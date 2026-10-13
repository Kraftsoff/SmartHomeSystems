"""Paper broker: realistic simulated fills (fee + adverse slippage) on any feed."""
from __future__ import annotations

import threading

from ..models import Fill, MarketInfo, Position
from .base import Broker, DataFeed


class PaperBroker(Broker):
    def __init__(
        self,
        feed: DataFeed,
        cash: float,
        fee_pct: float = 0.1,
        slippage_pct: float = 0.05,
        min_notional: float = 10.0,
    ) -> None:
        self.feed = feed
        self._cash = float(cash)
        self.fee_pct = fee_pct
        self.slippage_pct = slippage_pct
        self.min_notional = min_notional
        self.total_fees = 0.0
        self._lock = threading.Lock()
        self._fill_counter = 0

    def market_order(
        self, symbol: str, side: str, qty: float, price_hint: float | None = None
    ) -> Fill:
        if qty <= 0:
            raise ValueError("qty must be positive")
        if side not in ("buy", "sell"):
            raise ValueError(f"bad side {side}")
        price = price_hint if price_hint is not None else self.feed.fetch_price(symbol)
        slip = price * self.slippage_pct / 100.0
        price = price + slip if side == "buy" else price - slip
        notional = qty * price
        fee = notional * self.fee_pct / 100.0
        with self._lock:
            if side == "buy":
                self._cash -= notional + fee
            else:
                self._cash += notional - fee
            self.total_fees += fee
            self._fill_counter += 1
            oid = f"paper-{self._fill_counter}"
        return Fill(
            symbol=symbol, side=side, qty=qty, price=price, fee=fee, ts=self.feed.now_ms(), order_id=oid
        )

    def cash(self) -> float:
        return self._cash

    def account_value(self, positions: dict[str, Position], prices: dict[str, float]) -> float:
        value = self._cash
        for sym, pos in positions.items():
            price = prices.get(sym)
            if price is None:
                price = self.feed.fetch_price(sym)
            # long: cash was spent, asset is worth qty*price
            # short: cash was received, liability is worth qty*price
            value += pos.side * pos.qty * price
        return value

    def market_info(self, symbol: str) -> MarketInfo:
        info = self.feed.market_info(symbol)
        if not info.min_notional:
            info.min_notional = self.min_notional
        if not info.qty_step:
            info.qty_step = 1e-6
        return info
