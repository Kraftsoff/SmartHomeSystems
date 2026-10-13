"""Donchian channel breakout (the "Turtle" system, still the backbone of many CTAs).

Long on a close above the N-bar high, short on a close below the N-bar low,
exit on the opposite M-bar extreme (M < N), initial stop 2 ATR. Trades rarely,
catches the big moves, loses small many times - the classic trend profile.
"""
from __future__ import annotations

import pandas as pd

from ..models import LONG, SHORT, Position, Signal
from .base import Strategy
from .indicators import atr


class DonchianBreakout(Strategy):
    name = "donchian"
    defaults = {"entry": 55, "exit": 20, "atr_period": 20, "stop_atr": 2.0, "trail_atr": 0.0}

    @property
    def warmup(self) -> int:
        return max(self.params["entry"], self.params["atr_period"]) * 2 + 2

    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        p = self.params
        if len(df) < self.warmup:
            return Signal.hold("warmup")
        close = float(df["close"].iloc[-1])
        prev = df.iloc[:-1]
        hi_entry = float(prev["high"].tail(p["entry"]).max())
        lo_entry = float(prev["low"].tail(p["entry"]).min())
        hi_exit = float(prev["high"].tail(p["exit"]).max())
        lo_exit = float(prev["low"].tail(p["exit"]).min())
        atr_v = float(atr(df, p["atr_period"]).iloc[-1]) or close * 0.01

        if position is not None:
            if position.side == LONG and close < lo_exit:
                return Signal(close_position=True, reason=f"close below {p['exit']}-bar low")
            if position.side == SHORT and close > hi_exit:
                return Signal(close_position=True, reason=f"close above {p['exit']}-bar high")
            return Signal.hold()

        trail = p["trail_atr"] * atr_v if p["trail_atr"] > 0 else None
        if close > hi_entry:
            return Signal(direction=LONG, stop=close - p["stop_atr"] * atr_v, trail_distance=trail,
                          reason=f"breakout above {p['entry']}-bar high")
        if close < lo_entry:
            return Signal(direction=SHORT, stop=close + p["stop_atr"] * atr_v, trail_distance=trail,
                          reason=f"breakdown below {p['entry']}-bar low")
        return Signal.hold()
