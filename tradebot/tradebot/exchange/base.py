"""Abstract interfaces: a DataFeed provides prices, a Broker executes orders."""
from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from ..models import Fill, MarketInfo, Position

OHLCV_COLUMNS = ["ts", "open", "high", "low", "close", "volume"]


class DataFeed(ABC):
    @abstractmethod
    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        """Most recent `limit` candles (may include the still-open one)."""

    @abstractmethod
    def fetch_price(self, symbol: str) -> float:
        """Current mark / last price."""

    @abstractmethod
    def now_ms(self) -> int:
        """Current time in unix ms (wall clock live, simulated in backtests)."""

    def market_info(self, symbol: str) -> MarketInfo:
        return MarketInfo(symbol=symbol)


class Broker(ABC):
    @abstractmethod
    def market_order(
        self, symbol: str, side: str, qty: float, price_hint: float | None = None
    ) -> Fill:
        """Execute a market order. `price_hint` lets simulators fill at a stop level."""

    @abstractmethod
    def cash(self) -> float:
        """Free quote-currency balance."""

    @abstractmethod
    def account_value(self, positions: dict[str, Position], prices: dict[str, float]) -> float:
        """Total equity in quote currency: cash + open positions marked to market."""

    @abstractmethod
    def market_info(self, symbol: str) -> MarketInfo: ...

    def close(self) -> None:  # noqa: B027 - optional hook
        pass
