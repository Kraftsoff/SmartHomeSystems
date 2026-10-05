import math

from tradebot.backtest import compute_metrics, grid_search, run_backtest, walk_forward
from tradebot.data.synthetic import make_synthetic
from tradebot.models import LONG, Trade

import pandas as pd


def test_backtest_runs_and_reports():
    df = make_synthetic(900, seed=11)
    res = run_backtest({"BTC/USDT": df}, timeframe="1h", strategy="ema_trend", starting_cash=50, allow_short=True)
    m = res.metrics
    assert m["bars"] == 900 and m["starting_cash"] == 50
    assert math.isfinite(m["max_drawdown_pct"]) and 0 <= m["max_drawdown_pct"] <= 100
    assert m["n_trades"] == len(res.trades)
    assert abs(m["final_equity"] - (50 + sum(t.pnl for t in res.trades))) < 1e-3


def test_multi_symbol_backtest():
    data = {"A/USDT": make_synthetic(600, seed=1), "B/USDT": make_synthetic(600, seed=2)}
    res = run_backtest(data, timeframe="1h", strategy="mean_reversion", starting_cash=100)
    assert set(t.symbol for t in res.trades) <= set(data)


def test_metrics_math():
    eq = pd.DataFrame({"ts": [0, 1, 2, 3], "equity": [100, 110, 99, 120], "cash": [0, 0, 0, 0]})
    trades = [Trade("X", LONG, 1, 1, 2, 0, 1, 10.0, 0.1), Trade("X", LONG, 1, 2, 1, 1, 2, -5.0, 0.1)]
    m = compute_metrics(eq, trades, "1d", 100)
    assert m["total_return_pct"] == 20.0 and m["n_trades"] == 2 and m["win_rate_pct"] == 50.0
    assert m["profit_factor"] == 2.0 and m["max_drawdown_pct"] == 10.0


def test_grid_search_and_walk_forward():
    df = make_synthetic(700, seed=4)
    rows = grid_search({"X/USDT": df}, {"fast": [5, 10], "slow": [20]}, timeframe="1h", strategy="ema_trend",
                       params={"adx_min": 0}, starting_cash=100)
    assert len(rows) == 2 and {"fast", "slow", "sharpe"} <= set(rows[0])
    wf = walk_forward({"X/USDT": df}, {"fast": [5, 10], "slow": [20]}, n_splits=2, timeframe="1h",
                      strategy="ema_trend", params={"adx_min": 0}, starting_cash=100)
    assert len(wf) == 2 and "out_of_sample" in wf[0]
