import numpy as np
import pandas as pd

from tradebot.data.synthetic import make_synthetic
from tradebot.strategies.indicators import adx, atr, bollinger, ema, rsi


def test_ema_tracks_constant_series():
    s = pd.Series([10.0] * 50)
    assert np.allclose(ema(s, 10), 10.0)


def test_rsi_bounds_and_direction():
    up = pd.Series(np.linspace(100, 200, 60))
    down = pd.Series(np.linspace(200, 100, 60))
    assert rsi(up, 14).iloc[-1] > 90
    assert rsi(down, 14).iloc[-1] < 10
    flat = pd.Series([5.0] * 30)
    assert rsi(flat, 14).iloc[-1] == 50


def test_atr_positive_and_bollinger_order():
    df = make_synthetic(300, seed=1)
    a = atr(df, 14)
    assert (a.iloc[20:] > 0).all()
    lo, mid, hi = bollinger(df["close"], 20, 2.0)
    assert (lo.iloc[20:] <= mid.iloc[20:]).all() and (mid.iloc[20:] <= hi.iloc[20:]).all()


def test_adx_range():
    df = make_synthetic(400, seed=3)
    a = adx(df, 14)
    assert ((a.iloc[50:] >= 0) & (a.iloc[50:] <= 100)).all()
