"""Engine behaviour with a scripted strategy so outcomes are deterministic."""
import numpy as np
import pandas as pd

from tradebot.data.feed import ReplayFeed
from tradebot.engine import Engine
from tradebot.exchange.paper import PaperBroker
from tradebot.models import LONG, SHORT, Position, Signal
from tradebot.risk import RiskLimits, RiskManager
from tradebot.storage import Storage
from tradebot.strategies.base import Strategy


class Scripted(Strategy):
    name = "scripted"
    defaults = {"entry_bar": 5, "side": LONG, "stop_pct": 5.0, "tp_pct": 0.0, "trail_pct": 0.0, "warm": 20}

    @property
    def warmup(self):
        return self.params["warm"]

    def signal(self, df, position):
        if position is not None:
            return Signal.hold()
        bar = (int(df["ts"].iloc[-1]) - 1_700_000_000_000) // 3_600_000
        if bar == self.params["entry_bar"]:
            price = float(df["close"].iloc[-1])
            side = self.params["side"]
            stop = price * (1 - side * self.params["stop_pct"] / 100)
            tp = price * (1 + side * self.params["tp_pct"] / 100) if self.params["tp_pct"] else None
            trail = price * self.params["trail_pct"] / 100 if self.params["trail_pct"] else None
            return Signal(direction=side, stop=stop, take_profit=tp, trail_distance=trail, reason="scripted")
        return Signal.hold()


def _df(closes, lows=None, highs=None):
    n = len(closes)
    closes = np.array(closes, dtype=float)
    return pd.DataFrame({
        "ts": 1_700_000_000_000 + np.arange(n) * 3_600_000,
        "open": closes, "high": np.array(highs) if highs is not None else closes,
        "low": np.array(lows) if lows is not None else closes, "close": closes, "volume": 1.0,
    })


def _run(df, strat, cash=1000.0, allow_short=False, limits=None, storage=None):
    feed = ReplayFeed({"X/USDT": df}, "1h", min_notional=0.0)
    broker = PaperBroker(feed, cash, fee_pct=0.0, slippage_pct=0.0, min_notional=0.0)
    storage = storage or Storage(":memory:")
    eng = Engine(symbols=["X/USDT"], timeframe="1h", strategy=strat, feed=feed, broker=broker,
                 risk=RiskManager(limits or RiskLimits(max_position_pct=100.0, max_drawdown_pct=0, max_daily_loss_pct=0)),
                 storage=storage, allow_short=allow_short, mode="backtest")
    for ts in feed.all_timestamps():
        feed.set_cursor(int(ts))
        eng.step()
    return eng, storage


def test_stop_loss_fills_at_stop_when_bar_crosses_it():
    closes = [100] * 6 + [99, 97, 96, 96]
    lows = [100] * 6 + [99, 94, 95, 95]  # bar 7 pierces the 95 stop
    df = _df(closes, lows=lows, highs=[c + 1 for c in closes])
    eng, st = _run(df, Scripted(entry_bar=5, stop_pct=5.0))
    trades = st.all_trades()
    assert len(trades) == 1 and trades[0].exit_reason == "stop loss"
    assert trades[0].exit_price == 95.0
    assert trades[0].exit_ts == int(df["ts"].iloc[7]) + 3_600_000
    assert not eng.positions


def test_take_profit_fills_at_target():
    closes = [100] * 6 + [101, 103, 104]
    highs = [100] * 6 + [101, 106, 104]
    df = _df(closes, lows=[c - 0.5 for c in closes], highs=highs)
    _, st = _run(df, Scripted(entry_bar=5, stop_pct=5.0, tp_pct=5.0))
    t = st.all_trades()
    assert len(t) == 1 and t[0].exit_reason == "take profit" and t[0].exit_price == 105.0 and t[0].pnl > 0


def test_trailing_stop_ratchets_up_then_fires():
    closes = [100] * 6 + [105, 110, 115, 111, 108]
    df = _df(closes, lows=[c - 0.5 for c in closes], highs=[c + 0.5 for c in closes])
    _, st = _run(df, Scripted(entry_bar=5, stop_pct=50.0, trail_pct=5.0))
    t = st.all_trades()
    # extreme high 115.5, trail 5 -> stop 110.5; bar with low 107.5 fires it, fill at stop
    assert len(t) == 1 and t[0].exit_reason == "stop loss" and t[0].exit_price == 110.5 and t[0].pnl > 0


def test_short_disallowed_by_default_but_works_when_enabled():
    closes = [100] * 6 + [95, 90, 90]
    df = _df(closes)
    _, st = _run(df, Scripted(entry_bar=5, side=SHORT, stop_pct=5.0))
    assert st.all_trades() == [] 
    eng, st = _run(df, Scripted(entry_bar=5, side=SHORT, stop_pct=5.0), allow_short=True)
    assert eng.positions["X/USDT"].side == SHORT
    assert eng.positions["X/USDT"].unrealized(90.0) > 0


def test_pause_blocks_entries_and_kill_closes_everything():
    closes = [100] * 12
    df = _df(closes)
    feed = ReplayFeed({"X/USDT": df}, "1h", min_notional=0.0)
    broker = PaperBroker(feed, 1000.0, fee_pct=0.0, slippage_pct=0.0, min_notional=0.0)
    st = Storage(":memory:")
    eng = Engine(symbols=["X/USDT"], timeframe="1h", strategy=Scripted(entry_bar=5), feed=feed, broker=broker,
                 risk=RiskManager(RiskLimits(max_position_pct=100.0)), storage=st, mode="backtest")
    eng.pause()
    for ts in feed.all_timestamps()[:8]:
        feed.set_cursor(int(ts)); eng.step()
    assert not eng.positions
    eng.resume()
    eng.strategy = Scripted(entry_bar=9)
    for ts in feed.all_timestamps()[8:]:
        feed.set_cursor(int(ts)); eng.step()
    assert "X/USDT" in eng.positions
    eng.kill("test")
    assert not eng.positions and eng.risk.killed
    assert st.all_trades()[0].exit_reason.startswith("kill")
    assert eng.status()["killed"] is True
    eng.reset_kill()
    assert eng.status()["killed"] is False


def test_drawdown_kill_switch_closes_position():
    closes = [100] * 6 + [90, 80, 80]
    df = _df(closes)
    limits = RiskLimits(risk_per_trade_pct=50.0, max_position_pct=100.0, max_drawdown_pct=10.0, max_daily_loss_pct=0)
    eng, st = _run(df, Scripted(entry_bar=5, stop_pct=90.0), limits=limits)
    assert eng.risk.killed and not eng.positions
    assert any("KILL" in e["message"] for e in st.events())


def test_positions_survive_restart():
    df = _df([100] * 8)
    st = Storage(":memory:")
    eng, _ = _run(df, Scripted(entry_bar=5, stop_pct=5.0), storage=st)
    assert eng.positions
    feed = ReplayFeed({"X/USDT": df}, "1h")
    eng2 = Engine(symbols=["X/USDT"], timeframe="1h", strategy=Scripted(), feed=feed,
                  broker=PaperBroker(feed, 1000.0), risk=RiskManager(RiskLimits()), storage=st)
    assert eng2.positions["X/USDT"].entry_price == 100.0


def test_unclosed_candle_is_ignored():
    """The engine must never act on the candle that is still forming."""
    df = _df([100] * 7)
    feed = ReplayFeed({"X/USDT": df}, "1h", min_notional=0.0)
    feed.set_cursor(int(df["ts"].iloc[6]))
    feed.step = 0  # pretend no time has passed: candle 6 is still open
    seen = {}

    class Spy(Scripted):
        def signal(self, d, position):
            seen["n"] = len(d)
            return Signal.hold()

    eng = Engine(symbols=["X/USDT"], timeframe="1h", strategy=Spy(), feed=feed,
                 broker=PaperBroker(feed, 100.0), risk=RiskManager(RiskLimits()), storage=Storage(":memory:"))
    eng.step()
    assert seen["n"] == 6
