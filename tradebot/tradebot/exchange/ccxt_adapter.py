"""Live exchange access through ccxt (100+ crypto exchanges, one API)."""
from __future__ import annotations

import logging
import time

import pandas as pd

from ..models import Fill, MarketInfo, Position
from .base import OHLCV_COLUMNS, Broker, DataFeed

log = logging.getLogger(__name__)


def _make_client(
    exchange_id: str,
    market_type: str = "spot",
    api_key: str = "",
    api_secret: str = "",
    api_password: str = "",
    sandbox: bool = False,
):
    import ccxt

    if not hasattr(ccxt, exchange_id):
        raise ValueError(f"unknown ccxt exchange: {exchange_id}")
    cfg = {
        "enableRateLimit": True,
        "options": {"defaultType": market_type, "adjustForTimeDifference": True},
    }
    if api_key:
        cfg.update({"apiKey": api_key, "secret": api_secret})
        if api_password:
            cfg["password"] = api_password
    client = getattr(ccxt, exchange_id)(cfg)
    if sandbox:
        client.set_sandbox_mode(True)
    return client


class CcxtFeed(DataFeed):
    """Public market data, no API keys needed."""

    def __init__(self, exchange_id: str, market_type: str = "spot", sandbox: bool = False, client=None):
        self.client = client or _make_client(exchange_id, market_type, sandbox=sandbox)
        self._markets_loaded = False

    def _ensure_markets(self) -> None:
        if not self._markets_loaded:
            self.client.load_markets()
            self._markets_loaded = True

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        raw = self.client.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        df = pd.DataFrame(raw, columns=OHLCV_COLUMNS)
        df["ts"] = df["ts"].astype("int64")
        return df

    def fetch_ohlcv_history(self, symbol: str, timeframe: str, since_ms: int, until_ms: int | None = None) -> pd.DataFrame:
        """Paginate through history (used by `download`)."""
        from ..data.timeframes import tf_ms

        step = tf_ms(timeframe)
        until_ms = until_ms or int(time.time() * 1000)
        frames = []
        cursor = since_ms
        while cursor < until_ms:
            raw = self.client.fetch_ohlcv(symbol, timeframe=timeframe, since=cursor, limit=1000)
            if not raw:
                break
            frames.append(pd.DataFrame(raw, columns=OHLCV_COLUMNS))
            last = raw[-1][0]
            if last <= cursor:
                break
            cursor = last + step
        if not frames:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        df = pd.concat(frames).drop_duplicates("ts").sort_values("ts").reset_index(drop=True)
        df["ts"] = df["ts"].astype("int64")
        return df[df["ts"] < until_ms]

    def fetch_price(self, symbol: str) -> float:
        t = self.client.fetch_ticker(symbol)
        price = t.get("last") or t.get("close")
        if price is None:
            raise RuntimeError(f"no price for {symbol}")
        return float(price)

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def market_info(self, symbol: str) -> MarketInfo:
        self._ensure_markets()
        m = self.client.market(symbol)
        limits = m.get("limits") or {}
        amount = limits.get("amount") or {}
        cost = limits.get("cost") or {}
        precision = m.get("precision") or {}
        qty_step = precision.get("amount") or 0.0
        # ccxt may express precision as number of decimals (TICK_SIZE mode gives the step)
        if qty_step and qty_step >= 1 and float(qty_step).is_integer() and self.client.precisionMode != 4:
            qty_step = 10 ** (-int(qty_step))
        return MarketInfo(
            symbol=symbol,
            min_qty=float(amount.get("min") or 0.0),
            qty_step=float(qty_step or 0.0),
            min_notional=float(cost.get("min") or 0.0),
            price_step=float(precision.get("price") or 0.0),
        )


class CcxtBroker(CcxtFeed, Broker):
    """Authenticated trading. Give the API key TRADE permission only, never WITHDRAW."""

    def __init__(
        self,
        exchange_id: str,
        api_key: str,
        api_secret: str,
        api_password: str = "",
        market_type: str = "spot",
        quote: str = "USDT",
        leverage: int = 1,
        sandbox: bool = False,
        client=None,
    ) -> None:
        if not api_key or not api_secret:
            raise ValueError("live mode needs TB_API_KEY and TB_API_SECRET")
        client = client or _make_client(exchange_id, market_type, api_key, api_secret, api_password, sandbox)
        super().__init__(exchange_id, market_type, sandbox, client=client)
        self.market_type = market_type
        self.quote = quote
        self.leverage = leverage
        self._leverage_set: set[str] = set()

    def _prepare_symbol(self, symbol: str) -> None:
        if self.market_type == "swap" and symbol not in self._leverage_set:
            try:
                self.client.set_leverage(self.leverage, symbol)
            except Exception as exc:  # noqa: BLE001 - some exchanges reject re-setting
                log.warning("set_leverage(%s) failed: %s", symbol, exc)
            self._leverage_set.add(symbol)

    def market_order(self, symbol: str, side: str, qty: float, price_hint: float | None = None) -> Fill:
        self._ensure_markets()
        self._prepare_symbol(symbol)
        amount = float(self.client.amount_to_precision(symbol, qty))
        order = self.client.create_order(symbol, "market", side, amount)
        # Many exchanges return a partial object; fetch to get the average fill price.
        if order.get("average") is None or order.get("filled") in (None, 0):
            try:
                order = self.client.fetch_order(order["id"], symbol)
            except Exception as exc:  # noqa: BLE001
                log.warning("fetch_order failed: %s", exc)
        price = order.get("average") or order.get("price") or self.fetch_price(symbol)
        filled = order.get("filled") or amount
        fee = 0.0
        fee_obj = order.get("fee") or {}
        if fee_obj.get("cost") is not None:
            fee = float(fee_obj["cost"])
            if fee_obj.get("currency") and fee_obj["currency"] != self.quote:
                fee = fee * float(price)  # fee paid in base asset -> convert
        return Fill(
            symbol=symbol,
            side=side,
            qty=float(filled),
            price=float(price),
            fee=fee,
            ts=int(order.get("timestamp") or self.now_ms()),
            order_id=str(order.get("id", "")),
        )

    def cash(self) -> float:
        bal = self.client.fetch_balance()
        return float((bal.get("free") or {}).get(self.quote) or 0.0)

    def account_value(self, positions: dict[str, Position], prices: dict[str, float]) -> float:
        bal = self.client.fetch_balance()
        total = float((bal.get("total") or {}).get(self.quote) or 0.0)
        if self.market_type == "spot":
            for sym, pos in positions.items():
                total += pos.qty * prices.get(sym, pos.entry_price)
            return total
        # swap: wallet balance + unrealized pnl of our tracked positions
        for sym, pos in positions.items():
            total += pos.unrealized(prices.get(sym, pos.entry_price))
        return total
