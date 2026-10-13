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
    import logging

    import uvicorn

    from .intel.service import IntelService
    from .notify import TelegramNotifier
    from .supervisor import Supervisor
    from .web.app import create_app

    logging.basicConfig(level=getattr(logging, s.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    tg = TelegramNotifier(s.telegram_token, s.telegram_chat_id) if s.telegram_token and s.telegram_chat_id else None
    sup = Supervisor(s, notifier=tg.send if tg else None)
    intel = IntelService(s, sup.storage, sup, notifier=tg.send if tg else None) if s.intel_enabled and s.intel_mode != "off" else None
    for name, why in sup.disabled.items():
        print(f"book {name!r} disabled: {why}", file=sys.stderr)
    if not sup.engines:
        sys.exit("no book could start; check broker credentials in .env")
    if not s.web_token:
        print("WARNING: TB_WEB_TOKEN is empty; the control panel is unprotected", file=sys.stderr)
    if tg:
        tg.supervisor, tg.intel = sup, intel
        tg.start_polling()
        tg.send("tradebot started: " + ", ".join(f"{b.title} ({b.mode}, {b.strategy})" for b in sup.engines)
                + (f"; intel mode={intel.mode}" if intel else ""))
    sup.start(s.poll_seconds)
    if intel:
        intel.start()
    app = create_app(token=s.web_token, supervisor=sup, intel=intel)
    try:
        uvicorn.run(app, host=s.web_host, port=s.web_port, log_level="warning")
    finally:
        sup.stop()
        if intel:
            intel.stop()
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


def cmd_intel(args, s: Settings) -> None:
    """Offline check of the intel pipeline: fetch sources, analyze, print theses (no trading)."""
    from .books import load_books
    from .intel.analyst import make_analyst
    from .intel.sources import build_sources
    from .intel.universe import describe_universe

    books = [b for b in load_books(s.config_file, s) if b.enabled or args.all_books]
    universe = describe_universe(books)
    events = []
    for src in build_sources(s):
        got = src.safe_fetch()
        print(f"{src.name}: {len(got)} events", file=sys.stderr)
        events += got
    events = [e.__dict__ for e in events][: args.limit]
    for e in events[:15]:
        print(f"  - [{e['source']}] {e['title'][:110]}")
    analyst = make_analyst(s)
    print(f"analyst: {type(analyst).__name__}, universe: {len(universe)} instruments", file=sys.stderr)
    res = analyst.analyze(events, universe, {})
    print("\nMARKET SUMMARY:", res.market_summary)
    for t in res.theses:
        print(json.dumps(t.model_dump(), ensure_ascii=False))
    if not res.theses:
        print("(no theses)")


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

    it = sub.add_parser("intel", help="dry run of the news -> theses pipeline (no trading)")
    it.add_argument("--limit", type=int, default=60)
    it.add_argument("--all-books", action="store_true", help="include books without credentials in the universe")

    stt = sub.add_parser("status", help="print state from the database")
    stt.add_argument("-n", type=int, default=20)

    args = p.parse_args(argv)
    s = Settings()
    {"run": cmd_run, "backtest": cmd_backtest, "optimize": cmd_optimize, "download": cmd_download, "status": cmd_status, "intel": cmd_intel}[args.cmd](args, s)


if __name__ == "__main__":
    main()
