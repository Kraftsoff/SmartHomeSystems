"""Strategy base class."""
from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from ..models import Position, Signal


class Strategy(ABC):
    name: str = "base"
    defaults: dict = {}

    def __init__(self, **params) -> None:
        unknown = set(params) - set(self.defaults)
        if unknown:
            raise ValueError(f"{self.name}: unknown params {sorted(unknown)}")
        self.params = {**self.defaults, **params}

    @property
    @abstractmethod
    def warmup(self) -> int:
        """Minimum number of closed candles needed before signals are valid."""

    @abstractmethod
    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        """Evaluate on closed candles (last row = latest closed)."""

    def describe(self) -> dict:
        return {"name": self.name, "params": dict(self.params)}
