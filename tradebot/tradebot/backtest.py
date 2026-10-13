"""Event-driven backtester that reuses the live Engine on a ReplayFeed."""
from __future__ import annotations

import itertools
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .data.feed import ReplayFeed
from .data.timeframes import bars_per_year
from .engine import Engine
from .exchange.paper import PaperBroker
from .models import Trade
from .risk import RiskLimits, RiskManager
from .storage import Storage
from .strategies import make_strategy


@dataclass
class BacktestResult:
    metrics: dict
    trades: list[Trade]
    equity: pd.DataFrame  # ts, equity, cash
    events: list[dict] = field(default_factory=list)


def compute_metrics(equity: pd.DataFrame, trades: list[Trade], timeframe: str, starting_cash: float) -> dict:
    if equity.empty:
        return {"n_trades": 0}
    eq = equity["equity"].to_numpy(dtype=float)
    final = float(eq[-1])
    rets = np.diff(eq) / eq[:-1] if len(eq) > 1 else np.array([0.0])
    rets = rets[np.isfinite(rets)]
    peak = np.maximum.accumulate(eq)
    dd = (peak - eq) / peak
    bpy = bars_per_year(timeframe)
    years = len(eq) / bpy
    sharpe = float(rets.mean() / rets.std() * math.sqrt(bpy)) if len(rets) > 1 and rets.std() > 0 else 0.0
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    gross_win = sum(t.pnl for t in wins)
    gross_loss = -sum(t.pnl for t in losses)
    total_return = (final / starting_cash - 1.0) * 100.0
    cagr = ((final / starting_cash) ** (1.0 / years) - 1.0) * 100.0 if years > 0 and final > 0 else 0.0
    return {
        "starting_cash": starting_cash,
        "final_equity": round(final, 4),
        "total_return_pct": round(total_return, 2),
        "cagr_pct": round(cagr, 2),
        "max_drawdown_pct": round(float(dd.max()) * 100.0, 2),
        "sharpe": round(sharpe, 2),
        "n_trades": len(trades),
        "win_rate_pct": round(len(wins) / len(trades) * 100.0, 1) if trades else 0.0,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else (math.inf if gross_win > 0 else 0.0),
        "avg_trade_pnl": round(sum(t.pnl for t in trades) / len(trades), 4) if trades else 0.0,
        "total_fees": round(sum(t.fees for t in trades), 4),
        "bars": int(len(eq)),
        "years": round(years, 2),
    }


def run_backtest(
    data: dict[str, pd.DataFrame],
    *,
    timeframe: str,
    strategy: str,
    params: dict | None = None,
    starting_cash: float = 50.0,
    fee_pct: float = 0.1,
    slippage_pct: float = 0.05,
    min_notional: float = 10.0,
    allow_short: bool = False,
    limits: RiskLimits | None = None,
) -> BacktestResult:
    feed = ReplayFeed(data, timeframe, min_notional=min_notional)
    broker = PaperBroker(feed, starting_cash, fee_pct=fee_pct, slippage_pct=slippage_pct, min_notional=min_notional)
    strat = make_strategy(strategy, params)
    risk = RiskManager(limits or RiskLimits())
    storage = Storage(":memory:")
    engine = Engine(
        symbols=list(data), timeframe=timeframe, strategy=strat, feed=feed, broker=broker,
        risk=risk, storage=storage, allow_short=allow_short, mode="backtest",
    )
    timestamps = feed.all_timestamps()
    for ts in timestamps:
        feed.set_cursor(int(ts))
        engine.step()
    # close whatever is open at the end so the result is fully realized
    for sym in list(engine.positions):
        engine.close_symbol(sym, "end of backtest")
    engine._snapshot(feed.now_ms())  # noqa: SLF001
    equity = pd.DataFrame(storage.equity_curve(limit=10**9))
    trades = storage.all_trades()
    metrics = compute_metrics(equity, trades, timeframe, starting_cash)
    metrics["strategy"] = strat.describe()
    events = storage.events(limit=200)
    storage.close()
    return BacktestResult(metrics=metrics, trades=trades, equity=equity, events=events)


def grid_search(data: dict[str, pd.DataFrame], grid: dict[str, list], sort_by: str = "sharpe", **kwargs) -> list[dict]:
    """Try every parameter combination; returns rows sorted best-first.

    Warning: optimizing on one history overfits. Keep an out-of-sample period
    (see `walk_forward`) before trusting a parameter set.
    """
    keys = list(grid)
    base = kwargs.pop("params", None) or {}
    rows = []
    for combo in itertools.product(*(grid[k] for k in keys)):
        params = dict(zip(keys, combo))
        res = run_backtest(data, params={**base, **params}, **kwargs)
        rows.append({**params, **{k: v for k, v in res.metrics.items() if k != "strategy"}})
    rows.sort(key=lambda r: (r.get(sort_by, 0) if math.isfinite(r.get(sort_by, 0)) else -1), reverse=True)
    return rows


def walk_forward(data: dict[str, pd.DataFrame], grid: dict[str, list], n_splits: int = 3, sort_by: str = "sharpe", **kwargs) -> list[dict]:
    """Optimize on each in-sample window, test on the following out-of-sample window."""
    base = kwargs.pop("params", None) or {}
    any_df = next(iter(data.values()))
    n = len(any_df)
    seg = n // (n_splits + 1)
    results = []
    for i in range(n_splits):
        ins = {s: df.iloc[i * seg : (i + 1) * seg] for s, df in data.items()}
        oos = {s: df.iloc[(i + 1) * seg : (i + 2) * seg] for s, df in data.items()}
        best = grid_search(ins, grid, sort_by=sort_by, params=base, **kwargs)[0]
        best_params = {k: best[k] for k in grid}
        test = run_backtest(oos, params={**base, **best_params}, **kwargs)
        results.append({"split": i, "params": best_params, "in_sample": {k: best[k] for k in ("total_return_pct", "sharpe", "max_drawdown_pct", "n_trades")},
                        "out_of_sample": {k: test.metrics[k] for k in ("total_return_pct", "sharpe", "max_drawdown_pct", "n_trades")}})
    return results
