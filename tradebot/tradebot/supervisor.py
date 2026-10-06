"""Supervisor: one Engine per Book (tab), shared storage, one Telegram, one panel."""
from __future__ import annotations

import logging
import threading

from .books import BookConfig, load_books
from .config import Settings
from .engine import Engine
from .exchange.ccxt_adapter import CcxtBroker, CcxtFeed
from .exchange.paper import PaperBroker
from .risk import RiskManager
from .storage import Storage
from .strategies import make_strategy

log = logging.getLogger(__name__)


def make_broker(book: BookConfig, s: Settings):
    """Returns (feed, broker) for a book. Raises with a clear message when credentials are missing."""
    if book.broker == "ccxt":
        if book.mode == "live":
            broker = CcxtBroker(book.exchange, s.api_key, s.api_secret, s.api_password, market_type=book.market_type,
                                quote=book.quote_currency, leverage=book.leverage, sandbox=book.sandbox)
            return broker, broker
        feed = CcxtFeed(book.exchange, book.market_type, sandbox=book.sandbox)
        return feed, PaperBroker(feed, book.starting_cash, fee_pct=book.fee_pct, slippage_pct=book.slippage_pct, min_notional=book.min_notional)
    if book.broker == "alpaca":
        from .exchange.alpaca_adapter import AlpacaBroker

        broker = AlpacaBroker(s.alpaca_key, s.alpaca_secret, paper=(book.mode != "live"), feed=s.alpaca_feed)
        return broker, broker
    if book.broker == "tinvest":
        from .exchange.tinvest_adapter import TInvestBroker

        broker = TInvestBroker(s.tinvest_token, s.tinvest_account_id, sandbox=(book.mode != "live"), default_class=book.default_class)
        return broker, broker
    raise ValueError(f"unknown broker {book.broker!r}")


class Supervisor:
    def __init__(self, settings: Settings, books: list[BookConfig] | None = None, storage: Storage | None = None,
                 notifier=None, broker_factory=make_broker) -> None:
        self.s = settings
        self.storage = storage or Storage(settings.db_path)
        self.books: list[BookConfig] = books if books is not None else load_books(settings.config_file, settings)
        self.engines: dict[BookConfig, Engine] = {}
        self.disabled: dict[str, str] = {}
        self.threads: list[threading.Thread] = []
        base = _base_limits(settings)
        for b in self.books:
            if not b.enabled:
                self.disabled[b.name] = "disabled in config (missing credentials?)"
                continue
            try:
                feed, broker = broker_factory(b, settings)
            except Exception as exc:  # noqa: BLE001
                self.disabled[b.name] = str(exc)
                log.warning("book %s disabled: %s", b.name, exc)
                continue
            self.engines[b] = Engine(
                symbols=list(b.symbols), timeframe=b.timeframe, strategy=make_strategy(b.strategy, b.strategy_params),
                feed=feed, broker=broker, risk=RiskManager(b.risk_limits(base)), storage=BookStorage(self.storage, b.name),
                allow_short=b.allow_short, notifier=(lambda m, n=b.title: notifier(f"[{n}] {m}")) if notifier else None,
                mode=b.mode,
            )

    def start(self, poll_seconds: int = 30) -> None:
        for b, e in self.engines.items():
            t = threading.Thread(target=e.run_forever, args=(poll_seconds,), name=f"engine-{b.name}", daemon=True)
            t.start()
            self.threads.append(t)

    def stop(self) -> None:
        for e in self.engines.values():
            e.stop()

    # --- lookup ------------------------------------------------------------------
    def book(self, name: str) -> BookConfig | None:
        return next((b for b in self.books if b.name == name), None)

    def engine(self, name: str) -> Engine | None:
        return next((e for b, e in self.engines.items() if b.name == name), None)

    def enabled_books(self) -> list[BookConfig]:
        return list(self.engines)

    def status(self) -> dict:
        books = []
        for b in self.books:
            e = self.engine(b.name)
            entry = {"name": b.name, "title": b.title, "broker": b.broker, "enabled": e is not None,
                     "reason": self.disabled.get(b.name, ""), "config": b.describe()}
            if e is not None:
                entry["status"] = e.status()
            books.append(entry)
        return {"books": books, "total_equity": sum(e.equity for e in self.engines.values())}


def _base_limits(s: Settings):
    from .bootstrap import risk_limits

    return risk_limits(s)


class BookStorage:
    """Namespaces one shared Storage per book so trades/equity/positions don't mix."""

    def __init__(self, inner: Storage, book: str) -> None:
        self.inner = inner
        self.book = book
        self._prefix = f"{book}::"

    # trades / equity / events / positions all carry the book in the symbol or key
    def add_trade(self, t):
        t.symbol = self._prefix + t.symbol
        self.inner.add_trade(t)
        t.symbol = t.symbol[len(self._prefix):]

    def _own(self, trades):
        out = []
        for t in trades:
            if t.symbol.startswith(self._prefix):
                t.symbol = t.symbol[len(self._prefix):]
                out.append(t)
        return out

    def trades(self, limit: int = 1000):
        return self._own(self.inner.trades(limit=limit * 4))[:limit]

    def all_trades(self):
        return self._own(self.inner.all_trades())

    def add_equity(self, ts: int, equity: float, cash: float) -> None:
        self.inner.set(f"{self._prefix}equity_last", {"ts": ts, "equity": equity, "cash": cash})
        with self.inner._lock:  # noqa: SLF001
            self.inner._conn.execute(  # noqa: SLF001
                "CREATE TABLE IF NOT EXISTS equity_books (book TEXT, ts INTEGER, equity REAL, cash REAL, PRIMARY KEY (book, ts))")
            self.inner._conn.execute("INSERT OR REPLACE INTO equity_books (book, ts, equity, cash) VALUES (?,?,?,?)",  # noqa: SLF001
                                     (self.book, ts, equity, cash))
            self.inner._conn.commit()  # noqa: SLF001

    def equity_curve(self, limit: int = 5000):
        with self.inner._lock:  # noqa: SLF001
            self.inner._conn.execute(  # noqa: SLF001
                "CREATE TABLE IF NOT EXISTS equity_books (book TEXT, ts INTEGER, equity REAL, cash REAL, PRIMARY KEY (book, ts))")
            rows = self.inner._conn.execute(  # noqa: SLF001
                "SELECT ts, equity, cash FROM (SELECT * FROM equity_books WHERE book=? ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC",
                (self.book, limit)).fetchall()
        return [dict(r) for r in rows]

    def add_event(self, level: str, message: str, data: dict | None = None, ts: int | None = None) -> None:
        self.inner.add_event(level, f"[{self.book}] {message}", data, ts)

    def events(self, limit: int = 100):
        tag = f"[{self.book}] "
        out = []
        for e in self.inner.events(limit=limit * 4):
            if e["message"].startswith(tag):
                e["message"] = e["message"][len(tag):]
                out.append(e)
        return out[:limit]

    def save_position(self, pos) -> None:
        pos.symbol = self._prefix + pos.symbol
        self.inner.save_position(pos)
        pos.symbol = pos.symbol[len(self._prefix):]

    def delete_position(self, symbol: str) -> None:
        self.inner.delete_position(self._prefix + symbol)

    def load_positions(self):
        out = {}
        for sym, pos in self.inner.load_positions().items():
            if sym.startswith(self._prefix):
                pos.symbol = sym[len(self._prefix):]
                out[pos.symbol] = pos
        return out

    def set(self, key: str, value) -> None:
        self.inner.set(self._prefix + key, value)

    def get(self, key: str, default=None):
        return self.inner.get(self._prefix + key, default)

    def close(self) -> None:
        pass
