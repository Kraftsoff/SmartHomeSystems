"""Technical indicators on pandas Series / OHLCV DataFrames (no TA-Lib needed)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(series: pd.Series, n: int) -> pd.Series:
    return series.ewm(span=n, adjust=False).mean()


def sma(series: pd.Series, n: int) -> pd.Series:
    return series.rolling(n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = -delta.clip(upper=0.0)
    avg_up = up.ewm(alpha=1.0 / n, adjust=False).mean()
    avg_down = down.ewm(alpha=1.0 / n, adjust=False).mean()
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = avg_up / avg_down
        out = 100.0 - 100.0 / (1.0 + rs)
    return out.fillna(50.0)


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return true_range(df).ewm(alpha=1.0 / n, adjust=False).mean()


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = sma(close, n)
    std = close.rolling(n).std(ddof=0)
    return mid - k * std, mid, mid + k * std


def adx(df: pd.DataFrame, n: int = 14) -> pd.Series:
    high, low = df["high"], df["low"]
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=df.index)
    tr = true_range(df)
    atr_n = tr.ewm(alpha=1.0 / n, adjust=False).mean()
    with np.errstate(divide="ignore", invalid="ignore"):
        plus_di = 100.0 * plus_dm.ewm(alpha=1.0 / n, adjust=False).mean() / atr_n
        minus_di = 100.0 * minus_dm.ewm(alpha=1.0 / n, adjust=False).mean() / atr_n
        dx = 100.0 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return dx.fillna(0.0).ewm(alpha=1.0 / n, adjust=False).mean()
