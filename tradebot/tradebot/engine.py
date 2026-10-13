"""Trading engine: the single code path shared by backtest, paper and live.

Per step, for every symbol:
  1. fetch closed candles, detect whether a new candle closed
  2. manage an open position: stop / take-profit / trailing (bar high-low in
     backtests, current price between candles live)
  3. on a new candle, ask the strategy for a signal and act on it through the
     RiskManager (sizing, limits, kill switch)
  4. snapshot equity and persist state for crash recovery
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Callable

import pandas as pd

from .data.timeframes import tf_ms
from .exchange.base import Broker, DataFeed
from .models import LONG, SHORT, Position, Signal, Trade
from .risk import RiskManager
from .storage import Storage
from .strategies.base import Strategy

log = logging.getLogger(__name__)

Notifier = Callable[[str], None]


class Engine:
    def __init__(
        self,
        *,
        symbols: list[str],
        timeframe: str,
        strategy: Strategy,
        feed: DataFeed,
        broker: Broker,
        risk: RiskManager,
        storage: Storage,
        allow_short: bool = False,
        notifier: Notifier | None = None,
        mode: str = "paper",
    ) -> None:
        self.symbols = symbols
        self.timeframe = timeframe
        self.tf = tf_ms(timeframe)
        self.strategy = strategy
        self.feed = feed
        self.broker = broker
        self.risk = risk
        self.storage = storage
        self.allow_short = allow_short
        self.notify = notifier or (lambda _msg: None)
        self.mode = mode

        self.positions: dict[str, Position] = storage.load_positions()
        self.last_candle_ts: dict[str, int] = {}
        self.last_prices: dict[str, float] = {}
        self.paused: bool = bool(storage.get("paused", False))
        self.running: bool = False
        self.started_at: int = 0
        self.last_step_at: int = 0
        self.last_error: str = ""
        self.equity: float = 0.0
        self.cash: float = 0.0
        self.lock = threading.RLock()
        self._stop_event = threading.Event()
        self._external: list[tuple[str, Signal]] = []
        self.market_open: bool = True
        if self.positions:
            log.info("recovered %d open position(s) from storage", len(self.positions))

    # ------------------------------------------------------------------ control
    def pause(self) -> None:
        self.paused = True
        self.storage.set("paused", True)
        self._event("WARN", "paused: no new entries (open positions still managed)")

    def resume(self) -> None:
        self.paused = False
        self.storage.set("paused", False)
        self._event("INFO", "resumed")

    def kill(self, reason: str = "manual kill") -> None:
        """Close everything and refuse new entries until reset."""
        with self.lock:
            self.risk.killed = True
            self.risk.kill_reason = reason
            self._event("ERROR", f"KILL SWITCH: {reason}")
            self._close_all(f"kill: {reason}")

    def _close_all(self, reason: str) -> None:
        for sym in list(self.positions):
            try:
                self._close(sym, self.last_prices.get(sym) or self.feed.fetch_price(sym), reason)
            except Exception as exc:  # noqa: BLE001
                self._event("ERROR", f"failed to close {sym}: {exc}")

    def reset_kill(self) -> None:
        self.risk.reset_kill()
        self._event("WARN", "kill switch reset by operator")

    def stop(self) -> None:
        self._stop_event.set()

    def submit_external(self, symbol: str, sig: Signal) -> None:
        """Queue a signal from outside the strategy (intel module, manual). Acted on next step."""
        with self.lock:
            self._external.append((symbol, sig))
            if symbol not in self.symbols:
                self.symbols.append(symbol)
        self._event("INFO", f"{symbol}: external signal queued ({sig.source}: {sig.reason})")

    def close_symbol(self, symbol: str, reason: str = "manual close") -> bool:
        with self.lock:
            if symbol not in self.positions:
                return False
            self._close(symbol, self.feed.fetch_price(symbol), reason)
            return True

    # --------------------------------------------------------------------- loop
    def run_forever(self, poll_seconds: int = 30) -> None:
        self.running = True
        self.started_at = self.feed.now_ms()
        self._event("INFO", f"engine started ({self.mode}) {self.symbols} {self.timeframe} {self.strategy.describe()}")
        while not self._stop_event.is_set():
            try:
                self.step()
            except Exception as exc:  # noqa: BLE001 - keep the loop alive, report
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.exception("step failed")
                self._event("ERROR", f"step failed: {self.last_error}")
            self._stop_event.wait(poll_seconds)
        self.running = False
        self._event("INFO", "engine stopped")

    def step(self) -> None:
        with self.lock:
            now = self.feed.now_ms()
            try:
                self.market_open = self.feed.is_market_open()
            except Exception as exc:  # noqa: BLE001 - treat an unreachable exchange clock as closed
                self.market_open = False
                raise RuntimeError(f"market clock unavailable: {exc}") from exc
            for sym in list(self.symbols):
                self._step_symbol(sym, now)
            self._process_external(now)
            self._snapshot(now)
            self.last_step_at = now

    def _process_external(self, now: int) -> None:
        if not self._external:
            return
        if not self.market_open:
            return  # keep queued until the market opens
        pending, self._external = self._external, []
        for sym, sig in pending:
            try:
                price = self.feed.fetch_price(sym)
                self.last_prices[sym] = price
                self._act(sym, sig, price, now)
            except Exception as exc:  # noqa: BLE001
                self._event("ERROR", f"{sym}: external signal failed: {exc}")

    # ------------------------------------------------------------------- per-symbol
    def _step_symbol(self, symbol: str, now: int) -> None:
        limit = self.strategy.warmup + 3
        df = self.feed.fetch_ohlcv(symbol, self.timeframe, limit)
        if df.empty:
            return
        closed = df[df["ts"] + self.tf <= now]
        if closed.empty:
            return
        last = closed.iloc[-1]
        last_ts = int(last["ts"])
        new_candle = self.last_candle_ts.get(symbol) != last_ts
        pos = self.positions.get(symbol)

        if new_candle:
            price = float(last["close"])
            self.last_prices[symbol] = price
            if pos is not None:
                self._manage_exits(symbol, pos, high=float(last["high"]), low=float(last["low"]), price=price)
                pos = self.positions.get(symbol)
            if not self.market_open:
                return  # candle closed but we cannot trade now; re-evaluate when open
            if pos is not None and pos.source != "strategy":
                # intel / manual positions are managed by their own stop, target and time stop only
                self.last_candle_ts[symbol] = last_ts
                return
            sig = self.strategy.signal(closed, pos)
            self._act(symbol, sig, price, last_ts)
            self.last_candle_ts[symbol] = last_ts
        elif pos is not None:
            # between candles: protect the position with the live price
            price = self.feed.fetch_price(symbol)
            self.last_prices[symbol] = price
            self._manage_exits(symbol, pos, high=price, low=price, price=price)

    def _manage_exits(self, symbol: str, pos: Position, *, high: float, low: float, price: float) -> None:
        # trailing stop ratchets with the best price seen
        if pos.trail_distance:
            if pos.side == LONG:
                pos.extreme_price = max(pos.extreme_price or pos.entry_price, high)
                new_stop = pos.extreme_price - pos.trail_distance
                if pos.stop is None or new_stop > pos.stop:
                    pos.stop = new_stop
            else:
                pos.extreme_price = min(pos.extreme_price or pos.entry_price, low)
                new_stop = pos.extreme_price + pos.trail_distance
                if pos.stop is None or new_stop < pos.stop:
                    pos.stop = new_stop
            self.storage.save_position(pos)

        if pos.expires_ts is not None and self.feed.now_ms() >= pos.expires_ts:
            self._close(symbol, price, "time stop")
            return
        # worst case first: if both stop and target are inside the bar, assume the stop hit
        if pos.stop is not None:
            if (pos.side == LONG and low <= pos.stop) or (pos.side == SHORT and high >= pos.stop):
                fill_price = min(pos.stop, price) if pos.side == LONG else max(pos.stop, price)
                self._close(symbol, fill_price, "stop loss")
                return
        if pos.take_profit is not None:
            if (pos.side == LONG and high >= pos.take_profit) or (pos.side == SHORT and low <= pos.take_profit):
                self._close(symbol, pos.take_profit, "take profit")

    def _act(self, symbol: str, sig: Signal, price: float, ts: int) -> None:
        pos = self.positions.get(symbol)
        if pos is not None and sig.close_position:
            self._close(symbol, price, sig.reason or "strategy exit")
            pos = None
        if pos is not None or sig.direction == 0:
            return
        if sig.direction == SHORT and not self.allow_short:
            self._event("INFO", f"{symbol}: short signal ignored (shorts disabled for this book)")
            return
        if self.paused:
            return
        ok, why = self.risk.can_open(len(self.positions))
        if not ok:
            log.info("%s: entry blocked: %s", symbol, why)
            return
        equity = self._equity()
        info = self.broker.market_info(symbol)
        size = self.risk.position_size(equity, price, sig.stop, min_notional=info.min_notional)
        if not size.ok:
            self._event("INFO", f"{symbol}: skip entry: {size.reason}", {"equity": equity, "price": price})
            return
        qty = size.qty
        if sig.max_notional and qty * price > sig.max_notional:
            qty = sig.max_notional / price
        qty = info.round_qty(qty)
        if info.min_qty and qty < info.min_qty:
            self._event("INFO", f"{symbol}: skip entry: qty {qty} < min {info.min_qty}")
            return
        if qty <= 0:
            return
        self._open(symbol, sig, qty, price, ts)

    # --------------------------------------------------------------------- orders
    def _open(self, symbol: str, sig: Signal, qty: float, price: float, ts: int) -> None:
        side = "buy" if sig.direction == LONG else "sell"
        fill = self.broker.market_order(symbol, side, qty, price_hint=price)
        pos = Position(
            symbol=symbol, side=sig.direction, qty=fill.qty, entry_price=fill.price, entry_ts=fill.ts,
            stop=sig.stop, take_profit=sig.take_profit, trail_distance=sig.trail_distance,
            extreme_price=fill.price, entry_fee=fill.fee, reason=sig.reason,
            expires_ts=(fill.ts + sig.max_hold_ms) if sig.max_hold_ms else None, source=sig.source,
        )
        self.positions[symbol] = pos
        self.storage.save_position(pos)
        stop_s = f"{sig.stop:.6g}" if sig.stop else "-"
        tp_s = f"{sig.take_profit:.6g}" if sig.take_profit else "-"
        msg = (f"OPEN {pos.side_name()} {symbol} qty={fill.qty:.6g} @ {fill.price:.6g} "
               f"stop={stop_s} tp={tp_s} ({sig.reason})")
        self._event("TRADE", msg, {"symbol": symbol, "side": pos.side_name(), "qty": fill.qty, "price": fill.price})
        self.notify(msg)

    def _close(self, symbol: str, price: float, reason: str) -> None:
        pos = self.positions[symbol]
        side = "sell" if pos.side == LONG else "buy"
        fill = self.broker.market_order(symbol, side, pos.qty, price_hint=price)
        gross = (fill.price - pos.entry_price) * fill.qty * pos.side
        fees = pos.entry_fee + fill.fee
        trade = Trade(
            symbol=symbol, side=pos.side, qty=fill.qty, entry_price=pos.entry_price, exit_price=fill.price,
            entry_ts=pos.entry_ts, exit_ts=fill.ts, pnl=gross - fees, fees=fees,
            entry_reason=pos.reason, exit_reason=reason,
        )
        self.storage.add_trade(trade)
        del self.positions[symbol]
        self.storage.delete_position(symbol)
        msg = (f"CLOSE {pos.side_name()} {symbol} @ {fill.price:.6g} pnl={trade.pnl:+.4f} "
               f"({trade.return_pct:+.2f}%) [{reason}]")
        self._event("TRADE", msg, {"symbol": symbol, "pnl": trade.pnl, "reason": reason})
        self.notify(msg)

    # ------------------------------------------------------------------- accounting
    def _equity(self) -> float:
        prices = dict(self.last_prices)
        for sym in self.positions:
            if sym not in prices:
                prices[sym] = self.feed.fetch_price(sym)
        return self.broker.account_value(self.positions, prices)

    def _snapshot(self, now: int) -> None:
        self.equity = self._equity()
        self.cash = self.broker.cash()
        self.storage.add_equity(now, self.equity, self.cash)
        for ev in self.risk.update_equity(self.equity, now):
            self._event("ERROR" if ev.startswith("KILL") else "WARN", ev)
            self.notify(ev)
        if self.risk.killed and self.positions:
            self._close_all(f"kill: {self.risk.kill_reason}")

    def _event(self, level: str, message: str, data: dict | None = None) -> None:
        log.log({"ERROR": logging.ERROR, "WARN": logging.WARNING}.get(level, logging.INFO), message)
        self.storage.add_event(level, message, data, ts=self.feed.now_ms())

    # ----------------------------------------------------------------------- status
    def status(self) -> dict:
        with self.lock:
            equity = self.equity
            positions = []
            for sym, pos in self.positions.items():
                price = self.last_prices.get(sym, pos.entry_price)
                positions.append({
                    "symbol": sym, "side": pos.side_name(), "qty": pos.qty, "entry_price": pos.entry_price,
                    "price": price, "stop": pos.stop, "take_profit": pos.take_profit,
                    "unrealized": pos.unrealized(price), "entry_ts": pos.entry_ts, "reason": pos.reason,
                    "expires_ts": pos.expires_ts, "source": pos.source,
                })
            return {
                "mode": self.mode,
                "running": self.running,
                "paused": self.paused,
                "killed": self.risk.killed,
                "kill_reason": self.risk.kill_reason,
                "daily_halt": self.risk.daily_halt,
                "market_open": self.market_open,
                "equity": equity,
                "cash": self.cash,
                "peak_equity": self.risk.peak_equity,
                "drawdown_pct": self.risk.drawdown_pct(equity),
                "daily_pnl_pct": self.risk.daily_pnl_pct(equity),
                "symbols": self.symbols,
                "timeframe": self.timeframe,
                "strategy": self.strategy.describe(),
                "positions": positions,
                "last_prices": dict(self.last_prices),
                "started_at": self.started_at,
                "last_step_at": self.last_step_at,
                "last_error": self.last_error,
                "now": int(time.time() * 1000),
            }
