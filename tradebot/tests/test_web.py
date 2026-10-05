from fastapi.testclient import TestClient

from tradebot.data.feed import ReplayFeed
from tradebot.data.synthetic import make_synthetic
from tradebot.engine import Engine
from tradebot.exchange.paper import PaperBroker
from tradebot.risk import RiskLimits, RiskManager
from tradebot.storage import Storage
from tradebot.strategies import make_strategy
from tradebot.web.app import create_app
from tradebot.notify import TelegramNotifier, format_status


def _engine():
    df = make_synthetic(300, seed=9)
    feed = ReplayFeed({"BTC/USDT": df}, "1h")
    feed.set_cursor(int(df["ts"].iloc[-1]))
    eng = Engine(symbols=["BTC/USDT"], timeframe="1h", strategy=make_strategy("ema_trend"), feed=feed,
                 broker=PaperBroker(feed, 50.0), risk=RiskManager(RiskLimits()), storage=Storage(":memory:"))
    eng.step()
    return eng


def test_api_requires_token_and_serves_everything():
    eng = _engine()
    c = TestClient(create_app(eng, token="s3cret"))
    assert c.get("/api/status").status_code == 401
    assert c.get("/healthz").status_code == 200
    r = c.get("/?token=s3cret")
    assert r.status_code == 200 and "tradebot" in r.text and "tb_token" in r.headers.get("set-cookie", "")
    h = {"x-token": "s3cret"}
    st = c.get("/api/status", headers=h).json()
    assert st["equity"] > 0 and st["symbols"] == ["BTC/USDT"]
    assert c.get("/api/trades", headers=h).json() == []
    assert len(c.get("/api/equity", headers=h).json()) == 1
    assert c.post("/api/pause", headers=h).json()["paused"] is True
    assert c.get("/api/status", headers=h).json()["paused"] is True
    assert c.post("/api/resume", headers=h).json()["paused"] is False
    assert c.post("/api/close/BTC/USDT", headers=h).status_code == 404
    assert c.post("/api/kill", headers=h).json()["killed"] is True
    assert c.post("/api/reset-kill", headers=h).json()["killed"] is False
    assert any(e["level"] == "ERROR" for e in c.get("/api/events", headers=h).json())


def test_telegram_commands_without_network():
    eng = _engine()
    tg = TelegramNotifier("x", "123", engine=eng)
    assert "equity" in tg.handle_command("/status")
    assert tg.handle_command("/positions") == "no open positions"
    assert tg.handle_command("/trades") == "no trades yet"
    assert "paused" in tg.handle_command("/pause") and eng.paused
    assert tg.handle_command("/resume") == "resumed"
    assert "KILLED" in tg.handle_command("/kill") and eng.risk.killed
    assert tg.handle_command("/reset") == "kill switch reset"
    assert "/status" in tg.handle_command("/help")
    assert "PAUSED" not in format_status(eng.status())
