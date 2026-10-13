from __future__ import annotations

from .base import Strategy
from .donchian import DonchianBreakout
from .ema_trend import EmaTrend
from .ensemble import Ensemble
from .mean_reversion import MeanReversion
from .tsmom import TimeSeriesMomentum

STRATEGIES: dict[str, type[Strategy]] = {
    EmaTrend.name: EmaTrend,
    MeanReversion.name: MeanReversion,
    DonchianBreakout.name: DonchianBreakout,
    TimeSeriesMomentum.name: TimeSeriesMomentum,
    Ensemble.name: Ensemble,
}


def make_strategy(name: str, params: dict | None = None) -> Strategy:
    if name not in STRATEGIES:
        raise ValueError(f"unknown strategy {name!r}; available: {sorted(STRATEGIES)}")
    return STRATEGIES[name](**(params or {}))
