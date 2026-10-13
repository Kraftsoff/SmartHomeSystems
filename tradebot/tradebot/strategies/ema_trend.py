"""EMA trend-following with ATR stops and trailing stop.

Enter on fast/slow EMA crossover (optionally only when ADX confirms a trend),
initial stop = N x ATR, trail the stop as price moves in our favour, exit when
the EMAs cross back. Classic, robust, low trade frequency (good for small
accounts where fees matter).
"""
from __future__ import annotations

import pandas as pd

from ..models import LONG, SHORT, Position, Signal
from .base import Strategy
from .indicators import adx, atr, ema


class EmaTrend(Strategy):
    name = "ema_trend"
    defaults = {
        "fast": 20,
        "slow": 50,
        "atr_period": 14,
        "stop_atr": 2.0,  # initial stop distance in ATRs
        "tp_atr": 0.0,  # take-profit in ATRs, 0 = none (let the trend run)
        "trail_atr": 3.0,  # trailing stop distance in ATRs, 0 = off
        "adx_period": 14,
        "adx_min": 20.0,  # require trend strength, 0 = off
        "reentry": True,  # also enter on pullback to the fast EMA inside a trend
    }

    @property
    def warmup(self) -> int:
        p = self.params
        return 3 * max(p["slow"], p["atr_period"], p["adx_period"]) + 2

    def signal(self, df: pd.DataFrame, position: Position | None) -> Signal:
        p = self.params
        if len(df) < self.warmup:
            return Signal.hold("warmup")
        close = df["close"]
        fast = ema(close, p["fast"])
        slow = ema(close, p["slow"])
        atr_v = float(atr(df, p["atr_period"]).iloc[-1])
        price = float(close.iloc[-1])
        f0, f1 = float(fast.iloc[-1]), float(fast.iloc[-2])
        s0, s1 = float(slow.iloc[-1]), float(slow.iloc[-2])
        cross_up = f0 > s0 and f1 <= s1
        cross_dn = f0 < s0 and f1 >= s1
        trend = LONG if f0 > s0 else SHORT

        if position is not None:
            if position.side == LONG and f0 < s0:
                return Signal(direction=SHORT, close_position=True, reason="ema cross down",
                              **self._levels(SHORT, price, atr_v))
            if position.side == SHORT and f0 > s0:
                return Signal(direction=LONG, close_position=True, reason="ema cross up",
                              **self._levels(LONG, price, atr_v))
            return Signal.hold()

        if p["adx_min"] > 0 and float(adx(df, p["adx_period"]).iloc[-1]) < p["adx_min"]:
            return Signal.hold("adx too low")

        if cross_up:
            return Signal(direction=LONG, reason="ema cross up", **self._levels(LONG, price, atr_v))
        if cross_dn:
            return Signal(direction=SHORT, reason="ema cross down", **self._levels(SHORT, price, atr_v))

        if p["reentry"]:
            prev_close = float(close.iloc[-2])
            if trend == LONG and prev_close < f1 and price > f0:
                return Signal(direction=LONG, reason="pullback to fast ema", **self._levels(LONG, price, atr_v))
            if trend == SHORT and prev_close > f1 and price < f0:
                return Signal(direction=SHORT, reason="pullback to fast ema", **self._levels(SHORT, price, atr_v))
        return Signal.hold()

    def _levels(self, side: int, price: float, atr_v: float) -> dict:
        p = self.params
        if atr_v <= 0:
            atr_v = price * 0.01
        stop = price - side * p["stop_atr"] * atr_v
        tp = price + side * p["tp_atr"] * atr_v if p["tp_atr"] > 0 else None
        trail = p["trail_atr"] * atr_v if p["trail_atr"] > 0 else None
        return {"stop": stop, "take_profit": tp, "trail_distance": trail}
