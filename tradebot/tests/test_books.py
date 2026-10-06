import textwrap

from tradebot.books import BookConfig, load_books
from tradebot.config import Settings
from tradebot.risk import RiskLimits
from tradebot.supervisor import BookStorage, Supervisor
from tradebot.storage import Storage
from tradebot.models import LONG, Position, Trade


def test_default_books_follow_env_and_credentials(tmp_path):
    s = Settings(_env_file=None, data_dir=str(tmp_path), symbols="SOL/USDT", timeframe="4h")
    books = load_books(None, s)
    assert [b.name for b in books] == ["stocks", "securities", "crypto"]
    crypto = books[-1]
    assert crypto.symbols == ["SOL/USDT"] and crypto.timeframe == "4h" and crypto.enabled
    assert not books[0].enabled  # no alpaca keys
    s2 = Settings(_env_file=None, data_dir=str(tmp_path), alpaca_key="k", alpaca_secret="s")
    assert all(b.enabled for b in load_books(None, s2))


def test_yaml_books_and_risk_override(tmp_path):
    cfg = tmp_path / "config.yaml"
    cfg.write_text(textwrap.dedent("""
        books:
          - name: moex
            title: Акции MOEX
            broker: tinvest
            symbols: SBER, GAZP
            timeframe: 1d
            strategy: donchian
            quote_currency: RUB
            risk: {risk_per_trade_pct: 0.5, max_open_positions: 5, unknown_key: 1}
    """))
    s = Settings(_env_file=None, data_dir=str(tmp_path))
    books = load_books(str(cfg), s)
    assert len(books) == 1 and books[0].symbols == ["SBER", "GAZP"] and books[0].broker == "tinvest"
    lim = books[0].risk_limits(RiskLimits(risk_per_trade_pct=1.0, max_drawdown_pct=15))
    assert lim.risk_per_trade_pct == 0.5 and lim.max_open_positions == 5 and lim.max_drawdown_pct == 15


def test_supervisor_disables_book_without_credentials(tmp_path):
    s = Settings(_env_file=None, data_dir=str(tmp_path))
    books = [BookConfig(name="stocks", title="s", broker="alpaca", symbols=["SPY"]),
             BookConfig(name="x", title="x", broker="weird", symbols=["A"])]
    sup = Supervisor(s, books=books, storage=Storage(":memory:"))
    assert set(sup.disabled) == {"stocks", "x"} and "TB_ALPACA_KEY" in sup.disabled["stocks"]
    st = sup.status()
    assert all(not b["enabled"] for b in st["books"]) and st["total_equity"] == 0


def test_book_storage_namespacing():
    inner = Storage(":memory:")
    a, b = BookStorage(inner, "a"), BookStorage(inner, "b")
    a.add_trade(Trade("X", LONG, 1, 1, 2, 0, 1, 1.0, 0.0))
    b.add_trade(Trade("X", LONG, 1, 1, 2, 0, 2, -1.0, 0.0))
    assert [t.pnl for t in a.trades()] == [1.0] and [t.pnl for t in b.trades()] == [-1.0]
    assert a.trades()[0].symbol == "X"
    a.save_position(Position("X", LONG, 1, 1, 0))
    assert "X" in a.load_positions() and b.load_positions() == {}
    a.add_equity(1, 10, 10)
    b.add_equity(1, 20, 20)
    assert a.equity_curve()[0]["equity"] == 10 and b.equity_curve()[0]["equity"] == 20
    a.add_event("INFO", "hi")
    assert a.events()[0]["message"] == "hi" and b.events() == []
    a.set("paused", True)
    assert a.get("paused") is True and b.get("paused") is None
