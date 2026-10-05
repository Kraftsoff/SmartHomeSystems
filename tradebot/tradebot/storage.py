"""SQLite persistence: trades, equity curve, events, open positions (crash recovery)."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time

from .models import Position, Trade

_SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT, side INTEGER, qty REAL, entry_price REAL, exit_price REAL,
    entry_ts INTEGER, exit_ts INTEGER, pnl REAL, fees REAL,
    entry_reason TEXT, exit_reason TEXT
);
CREATE TABLE IF NOT EXISTS equity (
    ts INTEGER PRIMARY KEY, equity REAL, cash REAL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, level TEXT, message TEXT, data TEXT
);
CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY, data TEXT
);
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY, value TEXT
);
"""


class Storage:
    def __init__(self, path: str = ":memory:") -> None:
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            self._conn.executescript(_SCHEMA)

    # --- trades --------------------------------------------------------------
    def add_trade(self, t: Trade) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO trades (symbol, side, qty, entry_price, exit_price, entry_ts, exit_ts, pnl, fees, entry_reason, exit_reason)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (t.symbol, t.side, t.qty, t.entry_price, t.exit_price, t.entry_ts, t.exit_ts, t.pnl, t.fees,
                 t.entry_reason, t.exit_reason),
            )
            self._conn.commit()

    def trades(self, limit: int = 1000) -> list[Trade]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM trades ORDER BY exit_ts DESC, id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row_to_trade(r) for r in rows]

    def all_trades(self) -> list[Trade]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM trades ORDER BY exit_ts ASC, id ASC").fetchall()
        return [self._row_to_trade(r) for r in rows]

    @staticmethod
    def _row_to_trade(r: sqlite3.Row) -> Trade:
        return Trade(
            symbol=r["symbol"], side=r["side"], qty=r["qty"], entry_price=r["entry_price"],
            exit_price=r["exit_price"], entry_ts=r["entry_ts"], exit_ts=r["exit_ts"], pnl=r["pnl"],
            fees=r["fees"], entry_reason=r["entry_reason"] or "", exit_reason=r["exit_reason"] or "",
        )

    # --- equity --------------------------------------------------------------
    def add_equity(self, ts: int, equity: float, cash: float) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO equity (ts, equity, cash) VALUES (?,?,?)", (ts, equity, cash)
            )
            self._conn.commit()

    def equity_curve(self, limit: int = 5000) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, equity, cash FROM (SELECT * FROM equity ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # --- events --------------------------------------------------------------
    def add_event(self, level: str, message: str, data: dict | None = None, ts: int | None = None) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO events (ts, level, message, data) VALUES (?,?,?,?)",
                (ts or int(time.time() * 1000), level, message, json.dumps(data or {})),
            )
            self._conn.commit()

    def events(self, limit: int = 100) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, level, message, data FROM events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["data"] = json.loads(d["data"] or "{}")
            out.append(d)
        return out

    # --- positions (crash recovery) ---------------------------------------------
    def save_position(self, pos: Position) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO positions (symbol, data) VALUES (?,?)", (pos.symbol, pos.to_json())
            )
            self._conn.commit()

    def delete_position(self, symbol: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM positions WHERE symbol=?", (symbol,))
            self._conn.commit()

    def load_positions(self) -> dict[str, Position]:
        with self._lock:
            rows = self._conn.execute("SELECT symbol, data FROM positions").fetchall()
        return {r["symbol"]: Position.from_json(r["data"]) for r in rows}

    # --- kv --------------------------------------------------------------------
    def set(self, key: str, value) -> None:
        with self._lock:
            self._conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?,?)", (key, json.dumps(value)))
            self._conn.commit()

    def get(self, key: str, default=None):
        with self._lock:
            row = self._conn.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def close(self) -> None:
        with self._lock:
            self._conn.close()
