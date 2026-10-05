import numpy as np
import pandas as pd
import pytest

from tradebot.models import LONG, SHORT, Position, Signal
from tradebot.strategies import STRATEGIES, make_strategy


def _trend_df(n=400, up=True):
    ts = 1_700_000_000_000 + np.arange(n) * 3_600_000
    base = np.linspace(100, 160 if up else 60, n)
    noise = np.sin(np.arange(n) / 6.0) * 3.0  # pullbacks inside the trend
    close = base + noise
    return pd.DataFrame({"ts": ts, "open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 1.0})


def test_unknown_param_rejected():
    with pytest.raises(ValueError):
        make_strategy("ema_trend", {"nope": 1})
    with pytest.raises(ValueError):
        make_strategy("does_not_exist")


@pytest.mark.parametrize("name", list(STRATEGIES))
def test_warmup_returns_hold(name):
    strat = make_strategy(name)
    df = _trend_df(10)
    sig = strat.signal(df, None)
    assert sig.direction == 0 and not sig.close_position


def test_ema_trend_goes_long_in_uptrend_with_stop():
    strat = make_strategy("ema_trend", {"adx_min": 0})
    df = _trend_df(400, up=True)
    # scan for an entry signal somewhere after warmup
    found = None
    for i in range(strat.warmup, len(df)):
        sig = strat.signal(df.iloc[: i + 1], None)
        if sig.direction != 0:
            found = sig
            break
    assert found is not None and found.direction == LONG
    assert found.stop is not None and found.stop < df["close"].iloc[i]
    assert found.trail_distance and found.trail_distance > 0


def test_ema_trend_closes_long_when_trend_flips():
    strat = make_strategy("ema_trend", {"adx_min": 0})
    df = _trend_df(400, up=False)
    pos = Position("X", LONG, 1.0, 100.0, int(df["ts"].iloc[0]))
    sig = strat.signal(df, pos)
    assert sig.close_position and sig.direction == SHORT


def test_mean_reversion_signals_on_spike():
    strat = make_strategy("mean_reversion", {"adx_max": 0})
    n = 200
    ts = 1_700_000_000_000 + np.arange(n) * 3_600_000
    rng = np.random.default_rng(0)
    close = 100 + np.cumsum(rng.normal(0, 0.2, n))
    close[-8:] = close[-9] - np.arange(1, 9) * 1.5  # sharp drop at the end
    df = pd.DataFrame({"ts": ts, "open": close, "high": close + 0.1, "low": close - 0.1, "close": close, "volume": 1.0})
    sig = strat.signal(df, None)
    assert sig.direction == LONG and sig.stop < close[-1] and sig.take_profit > close[-1]
    # time stop closes stale positions
    pos = Position("X", LONG, 1.0, 100.0, int(ts[0]))
    assert strat.signal(df, pos).close_position


def test_signal_hold_helper():
    s = Signal.hold("x")
    assert s.direction == 0 and s.reason == "x"
