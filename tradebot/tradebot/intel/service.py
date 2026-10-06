"""IntelService: sources -> storage -> analyst -> proposals -> (confirm | auto) -> engine.

Modes:
  off      nothing runs
  advise   theses are stored and shown, never traded
  confirm  theses become proposals you approve in the panel or Telegram (/approve ID)
  auto     confidence >= intel_auto_confidence executes immediately, the rest wait for approval
"""
from __future__ import annotations

import logging
import threading
import time

from ..models import LONG, SHORT, Signal
from ..strategies.indicators import atr
from .analyst import Analysis, make_analyst
from .sources import Event, Source, build_sources, events_from_json
from .universe import describe_universe, inverse_for

log = logging.getLogger(__name__)


class IntelService:
    def __init__(self, settings, storage, supervisor, notifier=None, sources: list[Source] | None = None, analyst=None) -> None:
        self.s = settings
        self.storage = storage
        self.sup = supervisor
        self.notify = notifier or (lambda _m: None)
        self.sources = sources if sources is not None else build_sources(settings)
        self.analyst = analyst or make_analyst(settings)
        self.mode = settings.intel_mode
        self.last_run: int = 0
        self.last_summary: str = ""
        self.last_error: str = ""
        self._stop = threading.Event()
        self._lock = threading.RLock()

    # --- lifecycle ------------------------------------------------------------------
    def start(self) -> threading.Thread:
        t = threading.Thread(target=self._loop, name="intel", daemon=True)
        t.start()
        return t

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            if self.mode != "off":
                try:
                    self.run_once()
                except Exception as exc:  # noqa: BLE001
                    self.last_error = f"{type(exc).__name__}: {exc}"
                    log.exception("intel run failed")
            self._stop.wait(max(60, self.s.intel_interval_minutes * 60))

    # --- pipeline ---------------------------------------------------------------------
    def collect(self) -> int:
        events: list[Event] = []
        for src in self.sources:
            events += src.safe_fetch()
        return self.storage.add_events(events)

    def ingest(self, payload, source: str = "webhook", fields: dict | None = None) -> int:
        """Events pushed from outside (POST /api/intel/ingest)."""
        return self.storage.add_events(events_from_json(payload, fields, source=source))

    def run_once(self) -> dict:
        with self._lock:
            new = self.collect()
            self.expire_proposals()
            events = self.storage.unanalyzed_events(limit=60)
            created = 0
            if events:
                analysis = self.analyze(events)
                created = self.apply(analysis)
                self.storage.mark_analyzed([e["id"] for e in events])
            self.last_run = int(time.time() * 1000)
            return {"new_events": new, "analyzed": len(events), "proposals": created}

    def analyze(self, events: list[dict]) -> Analysis:
        universe = describe_universe(self.sup.enabled_books())
        context = {b.name: {"equity": round(e.equity, 2), "open": [p["symbol"] for p in e.status()["positions"]]}
                   for b, e in self.sup.engines.items()}
        analysis = self.analyst.analyze(events, universe, context)
        self.last_summary = analysis.market_summary
        return analysis

    def apply(self, analysis: Analysis) -> int:
        created = 0
        universe = {(u["book"], u["symbol"]): u for u in describe_universe(self.sup.enabled_books())}
        for t in analysis.theses:
            book_cfg = self.sup.book(t.book)
            if book_cfg is None or (t.book, t.symbol) not in universe:
                log.info("thesis skipped: unknown %s/%s", t.book, t.symbol)
                continue
            symbol, direction = t.symbol, t.direction
            if direction == "short" and not book_cfg.allow_short:
                inv = inverse_for(symbol)
                if inv and (t.book, inv) in universe:
                    symbol, direction = inv, "long"
                else:
                    self._log(f"{t.book}/{t.symbol}: short thesis dropped (shorts off, no inverse instrument)")
                    continue
            if t.confidence < self.s.intel_min_confidence or t.already_priced_in:
                self.storage.add_proposal(self._row(t, symbol, direction, "advice", note="below threshold / priced in"))
                created += 1
                continue
            if self.mode == "advise":
                pid = self.storage.add_proposal(self._row(t, symbol, direction, "advice"))
                created += 1
                continue
            status = "pending"
            pid = self.storage.add_proposal(self._row(t, symbol, direction, status))
            created += 1
            msg = (f"IDEA #{pid} [{t.book}] {direction.upper()} {symbol} conf={t.confidence:.2f} "
                   f"h={t.horizon_hours}h\n{t.rationale}\nInvalidation: {t.invalidation}")
            if self.mode == "auto" and t.confidence >= self.s.intel_auto_confidence:
                ok, why = self.execute(pid)
                self.notify(msg + ("\nAUTO-EXECUTED" if ok else f"\nAUTO-EXEC FAILED: {why}"))
            else:
                self.notify(msg + f"\nReply /approve {pid} or /reject {pid}")
        return created

    def _row(self, t, symbol: str, direction: str, status: str, note: str = "") -> dict:
        now = int(time.time() * 1000)
        return {"ts": now, "book": t.book, "symbol": symbol, "direction": direction, "confidence": t.confidence,
                "horizon_hours": t.horizon_hours, "rationale": t.rationale, "invalidation": t.invalidation,
                "event_ids": t.event_ids, "status": status, "expires_ts": now + self.s.intel_proposal_ttl_hours * 3_600_000,
                "note": note}

    # --- actions --------------------------------------------------------------------------
    def execute(self, pid: int) -> tuple[bool, str]:
        p = self.storage.proposal(pid)
        if not p:
            return False, "no such proposal"
        if p["status"] not in ("pending", "advice"):
            return False, f"proposal is {p['status']}"
        engine = self.sup.engine(p["book"])
        if engine is None:
            return False, f"book {p['book']} is not running"
        open_intel = sum(1 for e in self.sup.engines.values() for pos in e.positions.values() if pos.source == "intel")
        if open_intel >= self.s.intel_max_open:
            return False, f"max {self.s.intel_max_open} intel positions already open"
        if p["symbol"] in engine.positions:
            return False, f"{p['symbol']} already has a position in {p['book']}"
        try:
            df = engine.feed.fetch_ohlcv(p["symbol"], engine.timeframe, 40)
            price = engine.feed.fetch_price(p["symbol"])
        except Exception as exc:  # noqa: BLE001
            return False, f"no market data for {p['symbol']}: {exc}"
        atr_v = float(atr(df, 14).iloc[-1]) if len(df) >= 15 else price * 0.02
        if not atr_v or atr_v != atr_v:
            atr_v = price * 0.02
        side = LONG if p["direction"] == "long" else SHORT
        sig = Signal(direction=side, stop=price - side * 2.0 * atr_v, take_profit=price + side * 3.0 * atr_v,
                     trail_distance=None, reason=f"intel #{pid}: {p['rationale'][:80]}", source="intel",
                     max_hold_ms=int(p["horizon_hours"]) * 3_600_000,
                     max_notional=engine.equity * self.s.intel_max_position_pct / 100.0 if engine.equity else None)
        engine.submit_external(p["symbol"], sig)
        self.storage.update_proposal(pid, status="executed", executed_ts=int(time.time() * 1000))
        return True, "queued for execution"

    def reject(self, pid: int, note: str = "rejected by operator") -> bool:
        p = self.storage.proposal(pid)
        if not p or p["status"] not in ("pending", "advice"):
            return False
        self.storage.update_proposal(pid, status="rejected", note=note)
        return True

    def expire_proposals(self) -> int:
        now = int(time.time() * 1000)
        n = 0
        for p in self.storage.proposals(status="pending", limit=500):
            if p["expires_ts"] and p["expires_ts"] < now:
                self.storage.update_proposal(p["id"], status="expired")
                n += 1
        return n

    def status(self) -> dict:
        return {"mode": self.mode, "last_run": self.last_run, "last_summary": self.last_summary, "last_error": self.last_error,
                "sources": [s.name for s in self.sources], "analyst": type(self.analyst).__name__,
                "pending": len(self.storage.proposals(status="pending", limit=100))}

    def _log(self, msg: str) -> None:
        log.info(msg)
        self.storage.add_event("INFO", f"intel: {msg}")
