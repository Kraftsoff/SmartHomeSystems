"""Ensemble: regime filter + majority vote of several strategies.

Best practice in systematic trading is never to rely on one signal. This
strategy runs trend (EMA), breakout (Donchian) and momentum (TSMOM) side by
side and only trades when at least `min_votes` of them agree. A volatility
regime filter (realized vol vs its long-run median) stands aside in chaotic
markets where stops get hit at random.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..models import LONG, SHORT, Position, Signal
from .base import Strategy
from .donchian import DonchianBreakout
from .ema_trend import EmaTrend
from .tsmom import TimeSeriesMomentum


class Ensemble(Strategy):
    name = "ensemble"
    defaults = {
        "min_votes": 2,
        "vol_window": 20,
        "vol_long_window": 100,
        "max_vol_ratio": 2.5,  # stand aside when 20-bar vol > 2.5x its 100-bar median, 0 = off
        "ema": {},  # param overrides for the members
        "donchian": {},
        "tsmom": {},
    }

    def __init__(self, **params) -> None:
        super().__init__(**params)
        self.members: list[Strategy] = [
            EmaTrend(**self.params["ema"]),
            DonchianBreakout(**self.params["donchian"]),
            TimeSeriesMomentum(**self.params["tsmom"]),
        ]

    @property
    def warmup(self) -> int:
        return max(m.warmup for m in self.members) + self.params["vol_long_window"]

    def _vol_ok(self, df: pd.DataFrame) -> bool:
        p = self.params
        if p["max_vol_ratio"] <= 0:
            return True
        rets = np.log(df["close"]).diff().dropna()
        short = rets.tail(p["vol_window"]).std()
        long_med = rets.rolling(p["vol_window"]).std().tail(p["vol_long_window"]).median()
        if not long_med or np.isnan(long_med) or np.isnan(short):
            return True
        return short / long_med <= p["max_vol_ratio"]

    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        if len(df) < self.warmup:
            return Signal.hold("warmup")
        votes = [m.signal(df, position) for m in self.members]

        if position is not None:
            n_exit = sum(1 for v in votes if v.close_position)
            if n_exit >= 1 and sum(1 for v in votes if v.direction == position.side or not v.close_position) < self.params["min_votes"]:
                return Signal(close_position=True, reason=f"{n_exit}/{len(votes)} members want out")
            return Signal.hold()

        if not self._vol_ok(df):
            return Signal.hold("volatility regime: standing aside")
        longs = [v for v in votes if v.direction == LONG]
        shorts = [v for v in votes if v.direction == SHORT]
        for side, group in ((LONG, longs), (SHORT, shorts)):
            if len(group) >= self.params["min_votes"]:
                # tightest stop among agreeing members = most conservative risk
                stops = [v.stop for v in group if v.stop is not None]
                stop = (max(stops) if side == LONG else min(stops)) if stops else None
                trails = [v.trail_distance for v in group if v.trail_distance]
                return Signal(direction=side, stop=stop, trail_distance=min(trails) if trails else None,
                              reason=f"{len(group)}/{len(votes)} agree: " + "; ".join(v.reason for v in group))
        return Signal.hold("no consensus")
