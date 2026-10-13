"""Bollinger + RSI mean reversion.

Buy when price closes below the lower band with RSI oversold, target the middle
band, hard stop N x ATR below. Mirror for shorts. Works in ranging markets,
loses in strong trends - so it is best combined with a regime filter.
"""
from __future__ import annotations

import pandas as pd

from ..models import LONG, SHORT, Position, Signal
from .base import Strategy
from .indicators import adx, atr, bollinger, rsi


class MeanReversion(Strategy):
    name = "mean_reversion"
    defaults = {
        "bb_period": 20,
        "bb_std": 2.0,
        "rsi_period": 14,
        "rsi_low": 30.0,
        "rsi_high": 70.0,
        "atr_period": 14,
        "stop_atr": 2.0,
        "adx_max": 30.0,  # do not fade strong trends, 0 = off
        "max_hold_bars": 48,  # time stop
    }

    @property
    def warmup(self) -> int:
        p = self.params
        return 3 * max(p["bb_period"], p["rsi_period"], p["atr_period"]) + 2

    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        p = self.params
        if len(df) < self.warmup:
            return Signal.hold("warmup")
        close = df["close"]
        lower, mid, upper = bollinger(close, p["bb_period"], p["bb_std"])
        r = float(rsi(close, p["rsi_period"]).iloc[-1])
        atr_v = float(atr(df, p["atr_period"]).iloc[-1])
        price = float(close.iloc[-1])
        mid_v = float(mid.iloc[-1])

        if position is not None:
            bars_held = int((df["ts"] > position.entry_ts).sum())
            if bars_held >= p["max_hold_bars"]:
                return Signal(close_position=True, reason="time stop")
            if position.side == LONG and price >= mid_v:
                return Signal(close_position=True, reason="reached middle band")
            if position.side == SHORT and price <= mid_v:
                return Signal(close_position=True, reason="reached middle band")
            return Signal.hold()

        if p["adx_max"] > 0 and float(adx(df, p["atr_period"]).iloc[-1]) > p["adx_max"]:
            return Signal.hold("trend too strong to fade")
        if atr_v <= 0:
            atr_v = price * 0.01

        if price < float(lower.iloc[-1]) and r < p["rsi_low"]:
            return Signal(direction=LONG, stop=price - p["stop_atr"] * atr_v, take_profit=mid_v,
                          reason=f"below lower band, rsi {r:.0f}")
        if price > float(upper.iloc[-1]) and r > p["rsi_high"]:
            return Signal(direction=SHORT, stop=price + p["stop_atr"] * atr_v, take_profit=mid_v,
                          reason=f"above upper band, rsi {r:.0f}")
        return Signal.hold()
