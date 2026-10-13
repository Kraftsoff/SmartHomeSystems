import json

import httpx
import pytest

from tradebot.books import BookConfig
from tradebot.config import Settings
from tradebot.data.feed import ReplayFeed
from tradebot.data.synthetic import make_synthetic
from tradebot.intel.analyst import Analysis, RuleAnalyst, Thesis
from tradebot.intel.service import IntelService
from tradebot.intel.sources import CustomJsonSource, Event, GdeltSource, RssSource, events_from_json, parse_feed
from tradebot.intel.universe import CATALOG, describe_universe, inverse_for
from tradebot.storage import Storage
from tradebot.supervisor import Supervisor

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Tanker seized in Strait of Hormuz</title><link>http://x/1</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Oil jumps&lt;/p&gt;</description></item>
<item><title>Fed signals rate cut</title><link>http://x/2</link></item>
</channel></rss>"""
ATOM = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Bitcoin ETF approval</title><link href="http://y/1"/><updated>2026-10-05T10:00:00Z</updated><summary>SEC approves</summary></entry></feed>"""


def test_parse_rss_and_atom():
    ev = parse_feed(RSS, "rss:test")
    assert [e.title for e in ev] == ["Tanker seized in Strait of Hormuz", "Fed signals rate cut"]
    assert ev[0].summary == "Oil jumps" and ev[0].ts == 1791194400000
    at = parse_feed(ATOM, "atom")
    assert at[0].url == "http://y/1" and at[0].summary == "SEC approves"
    # dedup id is stable per url
    assert Event.make("a", "x", "http://x/1").id == ev[0].id


def test_events_from_json_with_field_mapping():
    data = {"data": [{"headline": "OPEC cut", "link": "http://o/1", "text": "cut", "published_at": 1700000000},
                     {"headline": "", "link": "x"}]}
    ev = events_from_json(data, {"items": "data", "title": "headline", "url": "link", "summary": "text", "ts": "published_at"}, "tool")
    assert len(ev) == 1 and ev[0].ts == 1700000000000 and ev[0].source == "tool"


def test_sources_over_mock_transport():
    def handler(req: httpx.Request) -> httpx.Response:
        if "gdeltproject" in req.url.host:
            return httpx.Response(200, json={"articles": [{"title": "Pipeline attack", "url": "http://g/1", "seendate": "20261005T100000Z", "domain": "d", "sourcecountry": "US"}]})
        if req.url.host == "feed.test":
            return httpx.Response(200, text=RSS)
        if req.url.host == "custom.test":
            return httpx.Response(200, json=[{"title": "Custom event", "url": "http://c/1"}])
        return httpx.Response(404)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    g = GdeltSource(["pipeline"], client=client).fetch()
    assert len(g) == 1 and g[0].ts == 1791194400000
    r = RssSource(["http://feed.test/rss"], client=client).fetch()
    assert len(r) == 2
    c = CustomJsonSource("http://custom.test/api", client=client).fetch()
    assert c[0].title == "Custom event"
    bad = RssSource(["http://nope.test/"], client=client).safe_fetch()
    assert bad == []


def test_storage_dedups_events_and_tracks_proposals():
    st = Storage(":memory:")
    ev = parse_feed(RSS, "rss")
    assert st.add_events(ev) == 2
    assert st.add_events(ev) == 0
    assert len(st.unanalyzed_events()) == 2
    st.mark_analyzed([ev[0].id])
    assert len(st.unanalyzed_events()) == 1
    pid = st.add_proposal({"ts": 1, "book": "securities", "symbol": "USO", "direction": "long", "confidence": 0.7,
                           "horizon_hours": 48, "rationale": "r", "invalidation": "i", "event_ids": [ev[0].id], "status": "pending"})
    assert st.proposal(pid)["event_ids"] == [ev[0].id]
    st.update_proposal(pid, status="executed")
    assert st.proposals(status="executed")[0]["id"] == pid


def test_universe_and_inverse():
    books = [BookConfig(name="securities", title="s", broker="alpaca", symbols=["TLT"]),
             BookConfig(name="crypto", title="c", broker="ccxt", symbols=["BTC/USDT"])]
    uni = describe_universe(books)
    syms = {(u["book"], u["symbol"]) for u in uni}
    assert ("securities", "USO") in syms and ("crypto", "BTC/USDT") in syms
    assert ("crypto", "USO") not in syms and ("securities", "BTC/USDT") not in syms
    assert inverse_for("USO") == "SCO" and inverse_for("GLD") is None
    assert all("desc" in m for m in CATALOG.values())


def test_rule_analyst_maps_tanker_to_oil():
    books = [BookConfig(name="securities", title="s", broker="alpaca", symbols=["USO"])]
    uni = describe_universe(books)
    res = RuleAnalyst().analyze([{"id": "e1", "title": "Tanker seized in Strait of Hormuz", "summary": ""}], uni)
    assert res.theses and res.theses[0].symbol in ("USO", "BNO") and res.theses[0].direction == "long"
    assert RuleAnalyst().analyze([{"id": "e2", "title": "Cat stuck in tree", "summary": ""}], uni).theses == []


class StubAnalyst:
    def __init__(self, theses):
        self.theses = theses

    def analyze(self, events, universe, context=None):
        return Analysis(market_summary="stub", theses=self.theses)


def _supervisor(tmp_path, allow_short=False):
    df = make_synthetic(300, "1h", seed=2)
    df_b = make_synthetic(300, "1h", seed=3)
    feeds = {}

    def factory(book, s):
        from tradebot.exchange.paper import PaperBroker

        feed = ReplayFeed({sym: (df if i == 0 else df_b) for i, sym in enumerate(book.symbols + ["USO", "SCO"] if book.broker == "alpaca" else book.symbols)}, "1h", min_notional=0)
        feed.set_cursor(int(df["ts"].iloc[-1]))
        feeds[book.name] = feed
        return feed, PaperBroker(feed, book.starting_cash, fee_pct=0, slippage_pct=0, min_notional=0)

    s = Settings(_env_file=None, data_dir=str(tmp_path), intel_mode="confirm", intel_min_confidence=0.6, intel_auto_confidence=0.85)
    books = [BookConfig(name="securities", title="s", broker="alpaca", symbols=["TLT"], timeframe="1h", strategy="ema_trend",
                        starting_cash=1000, allow_short=allow_short, min_notional=0),
             BookConfig(name="crypto", title="c", broker="ccxt", symbols=["BTC/USDT"], timeframe="1h", strategy="ema_trend", starting_cash=50, min_notional=0)]
    sup = Supervisor(s, books=books, storage=Storage(":memory:"), broker_factory=factory)
    for e in sup.engines.values():
        e.step()
    return s, sup, feeds


def test_intel_confirm_flow_executes_on_approval(tmp_path):
    s, sup, feeds = _supervisor(tmp_path)
    sent = []
    theses = [Thesis(book="securities", symbol="USO", direction="long", confidence=0.7, horizon_hours=48, rationale="oil up", invalidation="x", event_ids=["e1"]),
              Thesis(book="securities", symbol="USO", direction="short", confidence=0.9, horizon_hours=48, rationale="oil down", invalidation="x"),
              Thesis(book="crypto", symbol="BTC/USDT", direction="long", confidence=0.3, horizon_hours=24, rationale="weak", invalidation="x"),
              Thesis(book="nope", symbol="ZZZ", direction="long", confidence=0.9, horizon_hours=24, rationale="unknown", invalidation="x")]
    svc = IntelService(s, sup.storage, sup, notifier=sent.append, sources=[], analyst=StubAnalyst(theses))
    sup.storage.add_events([Event.make("t", "Tanker seized", "http://x/1")])
    r = svc.run_once()
    assert r["analyzed"] == 1 and r["proposals"] == 3
    pending = sup.storage.proposals(status="pending")
    assert {(p["symbol"], p["direction"]) for p in pending} == {("USO", "long"), ("SCO", "long")}  # short -> inverse ETF
    assert sup.storage.proposals(status="advice")[0]["symbol"] == "BTC/USDT"
    assert len(sent) == 2 and "/approve" in sent[0]
    pid = next(p["id"] for p in pending if p["symbol"] == "USO")
    ok, why = svc.execute(pid)
    assert ok, why
    eng = sup.engine("securities")
    eng.step()  # external signal is acted on at the next step
    pos = eng.positions["USO"]
    assert pos.source == "intel" and pos.stop is not None and pos.expires_ts is not None
    assert pos.qty * pos.entry_price <= 1000 * s.intel_max_position_pct / 100 + 1e-6
    assert sup.storage.proposal(pid)["status"] == "executed"
    assert svc.execute(pid) == (False, "proposal is executed")
    # time stop closes it when the horizon passes
    feeds["securities"].step += 48 * 3_600_000
    eng.step()
    assert "USO" not in eng.positions and eng.storage.trades()[0].exit_reason == "time stop"
    assert svc.reject(next(p["id"] for p in sup.storage.proposals(status="pending")))


def test_intel_auto_mode_and_expiry(tmp_path):
    s, sup, feeds = _supervisor(tmp_path)
    s.intel_mode = "auto"
    theses = [Thesis(book="securities", symbol="USO", direction="long", confidence=0.9, horizon_hours=48, rationale="strong", invalidation="x")]
    svc = IntelService(s, sup.storage, sup, sources=[], analyst=StubAnalyst(theses))
    sup.storage.add_events([Event.make("t", "Strong event", "http://x/9")])
    svc.run_once()
    assert sup.storage.proposals(status="executed")
    pid = sup.storage.add_proposal({"ts": 0, "book": "securities", "symbol": "TLT", "direction": "long", "confidence": 0.7,
                                    "horizon_hours": 1, "rationale": "old", "invalidation": "", "status": "pending", "expires_ts": 1})
    assert svc.expire_proposals() == 1 and sup.storage.proposal(pid)["status"] == "expired"
    assert svc.status()["mode"] == "auto"


def test_ingest_endpoint_and_web_tabs(tmp_path):
    from fastapi.testclient import TestClient

    from tradebot.web.app import create_app

    s, sup, _ = _supervisor(tmp_path)
    svc = IntelService(s, sup.storage, sup, sources=[], analyst=StubAnalyst([]))
    c = TestClient(create_app(token="t", supervisor=sup, intel=svc))
    h = {"x-token": "t"}
    ov = c.get("/api/books", headers=h).json()
    assert [b["name"] for b in ov["books"]] == ["securities", "crypto"] and ov["total_equity"] > 0
    assert c.get("/api/books/crypto/status", headers=h).json()["symbols"] == ["BTC/USDT"]
    assert c.get("/api/books/nope/status", headers=h).status_code == 404
    assert c.get("/api/status", headers=h).json()["symbols"] == ["TLT"]  # legacy = first book
    r = c.post("/api/intel/ingest?source=mytool", headers=h, json={"items": [{"title": "Pushed event", "url": "http://p/1"}], "fields": {"items": "items"}})
    assert r.json() == {"ok": True, "new_events": 1}
    assert c.get("/api/intel/events", headers=h).json()[0]["source"] == "mytool"
    assert c.post("/api/intel/run", headers=h).json()["analyzed"] == 1
    assert c.post("/api/intel/proposals/999/approve", headers=h).status_code == 409
    assert c.post("/api/books/crypto/pause", headers=h).json()["paused"] is True
    assert "События" in c.get("/?token=t").text


def test_telegram_multi_book_commands(tmp_path):
    from tradebot.notify import TelegramNotifier

    s, sup, _ = _supervisor(tmp_path)
    svc = IntelService(s, sup.storage, sup, sources=[], analyst=StubAnalyst([]))
    tg = TelegramNotifier("x", "1", supervisor=sup, intel=svc)
    assert "securities:" in tg.handle_command("/status") and "crypto:" in tg.handle_command("/status")
    assert "paused (crypto)" in tg.handle_command("/pause crypto")
    assert sup.engine("crypto").paused and not sup.engine("securities").paused
    assert tg.handle_command("/ideas") == "no pending ideas"
    assert "cannot execute" in tg.handle_command("/approve 42")
    assert "scan done" in tg.handle_command("/scan")
    assert "/approve" in tg.handle_command("/help")
