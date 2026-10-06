"""Time-series momentum (Moskowitz, Ooi & Pedersen 2012).

If the trailing `lookback`-bar return is positive, be long; if negative, be
short (or flat). Re-evaluated every `rebalance` bars. Vol-adjusted stop keeps
risk per trade constant. One of the most replicated anomalies in finance:
works across equities, bonds, commodities, FX and crypto on daily data.
"""
from __future__ import annotations

import pandas as pd

from ..models import LONG, SHORT, Position, Signal
from .base import Strategy
from .indicators import atr, ema


class TimeSeriesMomentum(Strategy):
    name = "tsmom"
    defaults = {
        "lookback": 90,  # bars (on 1d ~ 4 months; classic is 12 months)
        "skip": 5,  # skip the most recent bars (short-term reversal)
        "atr_period": 20,
        "stop_atr": 3.0,
        "trail_atr": 4.0,
        "trend_filter": 100,  # also require price above/below this EMA, 0 = off
    }

    @property
    def warmup(self) -> int:
        p = self.params
        return max(p["lookback"] + p["skip"], p["trend_filter"] * 2, p["atr_period"] * 2) + 2

    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        p = self.params
        if len(df) < self.warmup:
            return Signal.hold("warmup")
        close = df["close"]
        price = float(close.iloc[-1])
        ref = float(close.iloc[-1 - p["skip"] - p["lookback"]])
        recent = float(close.iloc[-1 - p["skip"]])
        mom = recent / ref - 1.0
        direction = LONG if mom > 0 else SHORT
        if p["trend_filter"] > 0:
            e = float(ema(close, p["trend_filter"]).iloc[-1])
            if (direction == LONG and price < e) or (direction == SHORT and price > e):
                direction = 0
        atr_v = float(atr(df, p["atr_period"]).iloc[-1]) or price * 0.01

        if position is not None:
            if direction != position.side:
                return Signal(direction=direction, close_position=True, reason=f"momentum flipped ({mom:+.1%})",
                              **self._levels(direction, price, atr_v))
            return Signal.hold()
        if direction == 0:
            return Signal.hold("momentum against trend filter")
        return Signal(direction=direction, reason=f"momentum {mom:+.1%} over {p['lookback']} bars",
                      **self._levels(direction, price, atr_v))

    def _levels(self, side: int, price: float, atr_v: float) -> dict:
        if side == 0:
            return {}
        p = self.params
        return {
            "stop": price - side * p["stop_atr"] * atr_v,
            "trail_distance": p["trail_atr"] * atr_v if p["trail_atr"] > 0 else None,
        }
