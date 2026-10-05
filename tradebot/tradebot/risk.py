"""Risk management: position sizing, daily loss halt, drawdown kill switch.

This module is the part that keeps a small account alive. Every entry goes
through it; no strategy can bypass it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class RiskLimits:
    risk_per_trade_pct: float = 1.0
    max_risk_mult: float = 3.0
    max_position_pct: float = 50.0
    max_open_positions: int = 2
    max_daily_loss_pct: float = 3.0
    max_drawdown_pct: float = 15.0
    leverage: int = 1


@dataclass
class SizeResult:
    qty: float
    notional: float
    risk_amount: float
    reason: str = ""

    @property
    def ok(self) -> bool:
        return self.qty > 0


class RiskManager:
    def __init__(self, limits: RiskLimits) -> None:
        self.limits = limits
        self.peak_equity: float = 0.0
        self.day: str | None = None
        self.day_start_equity: float | None = None
        self.daily_halt: bool = False
        self.killed: bool = False
        self.kill_reason: str = ""

    # --- account-level checks --------------------------------------------------
    def update_equity(self, equity: float, ts_ms: int) -> list[str]:
        """Feed the latest equity. Returns human-readable events that fired."""
        events: list[str] = []
        day = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        if day != self.day:
            self.day = day
            self.day_start_equity = equity
            if self.daily_halt:
                events.append("new day: daily loss halt lifted")
            self.daily_halt = False
        if equity > self.peak_equity:
            self.peak_equity = equity

        lim = self.limits
        if self.day_start_equity and not self.daily_halt and lim.max_daily_loss_pct > 0:
            loss_pct = (self.day_start_equity - equity) / self.day_start_equity * 100.0
            if loss_pct >= lim.max_daily_loss_pct:
                self.daily_halt = True
                events.append(f"daily loss {loss_pct:.2f}% >= {lim.max_daily_loss_pct}%: no new entries today")
        if self.peak_equity and not self.killed and lim.max_drawdown_pct > 0:
            dd = (self.peak_equity - equity) / self.peak_equity * 100.0
            if dd >= lim.max_drawdown_pct:
                self.killed = True
                self.kill_reason = f"drawdown {dd:.2f}% >= {lim.max_drawdown_pct}%"
                events.append(f"KILL SWITCH: {self.kill_reason}")
        return events

    def drawdown_pct(self, equity: float) -> float:
        if not self.peak_equity:
            return 0.0
        return max(0.0, (self.peak_equity - equity) / self.peak_equity * 100.0)

    def daily_pnl_pct(self, equity: float) -> float:
        if not self.day_start_equity:
            return 0.0
        return (equity - self.day_start_equity) / self.day_start_equity * 100.0

    def reset_kill(self) -> None:
        self.killed = False
        self.kill_reason = ""
        self.peak_equity = 0.0

    def can_open(self, open_positions: int) -> tuple[bool, str]:
        if self.killed:
            return False, f"kill switch active: {self.kill_reason}"
        if self.daily_halt:
            return False, "daily loss limit reached"
        if open_positions >= self.limits.max_open_positions:
            return False, f"max open positions ({self.limits.max_open_positions})"
        return True, ""

    # --- sizing ----------------------------------------------------------------
    def position_size(self, equity: float, price: float, stop: float | None, min_notional: float = 0.0) -> SizeResult:
        """Fixed-fractional sizing: lose at most risk_per_trade_pct if the stop hits."""
        lim = self.limits
        if equity <= 0 or price <= 0:
            return SizeResult(0.0, 0.0, 0.0, "no equity")
        if stop is None or stop <= 0:
            return SizeResult(0.0, 0.0, 0.0, "strategy gave no stop; refusing to size blind")
        dist = abs(price - stop)
        if dist <= 0:
            return SizeResult(0.0, 0.0, 0.0, "zero stop distance")
        risk_amount = equity * lim.risk_per_trade_pct / 100.0
        qty = risk_amount / dist
        max_notional = equity * lim.max_position_pct / 100.0 * max(1, lim.leverage)
        if qty * price > max_notional:
            qty = max_notional / price
        notional = qty * price
        if min_notional and notional < min_notional:
            if min_notional > max_notional:
                return SizeResult(0.0, 0.0, risk_amount,
                                  f"min notional {min_notional} exceeds max position {max_notional:.2f}")
            qty = min_notional * 1.02 / price  # small buffer above the exchange minimum
            actual_risk = qty * dist
            if actual_risk > risk_amount * lim.max_risk_mult:
                return SizeResult(0.0, 0.0, risk_amount,
                                  f"min notional would risk {actual_risk:.2f} > {lim.max_risk_mult}x allowed")
            notional = qty * price
        return SizeResult(qty, notional, qty * dist)
