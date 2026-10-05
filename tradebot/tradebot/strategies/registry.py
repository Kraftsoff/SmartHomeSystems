from __future__ import annotations

from .base import Strategy
from .ema_trend import EmaTrend
from .mean_reversion import MeanReversion

STRATEGIES: dict[str, type[Strategy]] = {
    EmaTrend.name: EmaTrend,
    MeanReversion.name: MeanReversion,
}


def make_strategy(name: str, params: dict | None = None) -> Strategy:
    if name not in STRATEGIES:
        raise ValueError(f"unknown strategy {name!r}; available: {sorted(STRATEGIES)}")
    return STRATEGIES[name](**(params or {}))
