"""Command line: python -m tradebot <command>."""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading

from .config import Settings


def _load_data(args, s: Settings) -> dict:
    import pandas as pd

    from .data.history import csv_path, load_csv
    from .data.synthetic import make_synthetic

    symbols = [x.strip() for x in (args.symbol or s.symbols).split(",")]
    data: dict[str, pd.DataFrame] = {}
    for i, sym in enumerate(symbols):
        if args.synthetic:
            data[sym] = make_synthetic(args.bars, args.timeframe or s.timeframe, seed=args.seed + i)
            continue
        path = args.csv or csv_path(s.data_dir, s.exchange, sym, args.timeframe or s.timeframe)
        if not os.path.exists(path):
            sys.exit(f"no data at {path}. Run: python -m tradebot download --symbol {sym} --days 365  (or use --synthetic)")
        df = load_csv(path)
        if args.days:
            df = df.tail(int(args.days * 86_400_000 / _tf(args.timeframe or s.timeframe)))
        data[sym] = df
    return data


def _tf(tf: str) -> int:
    from .data.timeframes import tf_ms

    return tf_ms(tf)


def cmd_run(args, s: Settings) -> None:
    import uvicorn

    from .bootstrap import build_engine
    from .notify import TelegramNotifier
    from .web.app import create_app

    tg = TelegramNotifier(s.telegram_token, s.telegram_chat_id) if s.telegram_token and s.telegram_chat_id else None
    engine = build_engine(s, notifier=tg.send if tg else None)
    if tg:
        tg.engine = engine
        tg.start_polling()
        tg.send(f"tradebot started in {s.mode} mode: {s.symbols} {s.timeframe} {s.strategy}")
    if s.mode == "live" and not s.web_token:
        print("WARNING: TB_WEB_TOKEN is empty; the control panel is unprotected", file=sys.stderr)
    t = threading.Thread(target=engine.run_forever, args=(s.poll_seconds,), name="engine", daemon=True)
    t.start()
    app = create_app(engine, token=s.web_token)
    try:
        uvicorn.run(app, host=s.web_host, port=s.web_port, log_level="warning")
    finally:
        engine.stop()
        if tg:
            tg.stop()


def cmd_backtest(args, s: Settings) -> None:
    from .backtest import run_backtest
    from .bootstrap import risk_limits

    data = _load_data(args, s)
    params = json.loads(args.params) if args.params else s.strategy_param_dict
    res = run_backtest(
        data, timeframe=args.timeframe or s.timeframe, strategy=args.strategy or s.strategy, params=params,
        starting_cash=args.cash or s.starting_cash, fee_pct=s.fee_pct, slippage_pct=s.slippage_pct,
        min_notional=s.min_notional, allow_short=args.short or s.allow_short, limits=risk_limits(s),
    )
    print(json.dumps(res.metrics, indent=2, default=str))
    if args.trades:
        for t in res.trades:
            print(json.dumps(t.to_dict()))
    if args.out:
        res.equity.to_csv(args.out, index=False)
        print(f"equity curve -> {args.out}")


def cmd_optimize(args, s: Settings) -> None:
    from .backtest import grid_search, walk_forward
    from .bootstrap import risk_limits

    data = _load_data(args, s)
    grid = json.loads(args.grid)
    common = dict(timeframe=args.timeframe or s.timeframe, strategy=args.strategy or s.strategy,
                  starting_cash=args.cash or s.starting_cash, fee_pct=s.fee_pct, slippage_pct=s.slippage_pct,
                  min_notional=s.min_notional, allow_short=args.short or s.allow_short, limits=risk_limits(s))
    if args.walk_forward:
        for row in walk_forward(data, grid, n_splits=args.walk_forward, sort_by=args.sort, **common):
            print(json.dumps(row, default=str))
    else:
        rows = grid_search(data, grid, sort_by=args.sort, **common)
        for row in rows[: args.top]:
            print(json.dumps(row, default=str))


def cmd_download(args, s: Settings) -> None:
    from .data.history import download

    for sym in [x.strip() for x in (args.symbol or s.symbols).split(",")]:
        path = download(s.exchange, sym, args.timeframe or s.timeframe, args.days, s.data_dir, s.market_type)
        print(f"{sym} -> {path}")


def cmd_status(args, s: Settings) -> None:
    from .storage import Storage

    st = Storage(s.db_path)
    curve = st.equity_curve(limit=1)
    print("equity:", curve[-1] if curve else "n/a")
    print("open positions:", {k: v.to_json() for k, v in st.load_positions().items()})
    for t in st.trades(limit=args.n):
        print(json.dumps(t.to_dict()))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="tradebot", description="risk-first algorithmic trading bot")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("run", help="run paper/live trading + web panel + telegram")

    def data_args(sp):
        sp.add_argument("--symbol", help="comma separated, default TB_SYMBOLS")
        sp.add_argument("--timeframe")
        sp.add_argument("--csv", help="explicit CSV path (single symbol)")
        sp.add_argument("--days", type=float, help="use only the last N days")
        sp.add_argument("--synthetic", action="store_true", help="generate synthetic data (offline smoke test)")
        sp.add_argument("--bars", type=int, default=5000)
        sp.add_argument("--seed", type=int, default=42)
        sp.add_argument("--strategy")
        sp.add_argument("--cash", type=float)
        sp.add_argument("--short", action="store_true", help="allow shorts")

    bt = sub.add_parser("backtest", help="backtest a strategy on history")
    data_args(bt)
    bt.add_argument("--params", help='JSON, e.g. \'{"fast": 10, "slow": 30}\'')
    bt.add_argument("--trades", action="store_true", help="print every trade")
    bt.add_argument("--out", help="write equity curve CSV")

    op = sub.add_parser("optimize", help="grid search / walk-forward over strategy params")
    data_args(op)
    op.add_argument("--grid", required=True, help='JSON, e.g. \'{"fast": [10, 20], "slow": [50, 100]}\'')
    op.add_argument("--sort", default="sharpe")
    op.add_argument("--top", type=int, default=10)
    op.add_argument("--walk-forward", type=int, default=0, metavar="N_SPLITS")

    dl = sub.add_parser("download", help="download OHLCV history to CSV")
    dl.add_argument("--symbol")
    dl.add_argument("--timeframe")
    dl.add_argument("--days", type=int, default=365)

    stt = sub.add_parser("status", help="print state from the database")
    stt.add_argument("-n", type=int, default=20)

    args = p.parse_args(argv)
    s = Settings()
    {"run": cmd_run, "backtest": cmd_backtest, "optimize": cmd_optimize, "download": cmd_download, "status": cmd_status}[args.cmd](args, s)


if __name__ == "__main__":
    main()
