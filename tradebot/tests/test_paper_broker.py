import pytest

from tradebot.data.feed import ReplayFeed
from tradebot.data.synthetic import make_synthetic
from tradebot.exchange.paper import PaperBroker
from tradebot.models import LONG, SHORT, Position


def _feed():
    df = make_synthetic(50, seed=5)
    f = ReplayFeed({"BTC/USDT": df}, "1h")
    f.set_cursor(int(df["ts"].iloc[10]))
    return f, float(df["close"].iloc[10])


def test_buy_sell_roundtrip_costs_fees_and_slippage():
    feed, px = _feed()
    b = PaperBroker(feed, 100.0, fee_pct=0.1, slippage_pct=0.0)
    buy = b.market_order("BTC/USDT", "buy", 0.001)
    assert buy.price == pytest.approx(px)
    assert b.cash() == pytest.approx(100 - 0.001 * px * 1.001)
    sell = b.market_order("BTC/USDT", "sell", 0.001)
    assert b.cash() == pytest.approx(100 - 2 * 0.001 * px * 0.001)
    assert b.total_fees == pytest.approx(buy.fee + sell.fee)


def test_slippage_is_adverse():
    feed, px = _feed()
    b = PaperBroker(feed, 100.0, fee_pct=0.0, slippage_pct=1.0)
    assert b.market_order("BTC/USDT", "buy", 0.001).price == pytest.approx(px * 1.01)
    assert b.market_order("BTC/USDT", "sell", 0.001).price == pytest.approx(px * 0.99)


def test_price_hint_fills_at_stop_level():
    feed, px = _feed()
    b = PaperBroker(feed, 100.0, fee_pct=0.0, slippage_pct=0.0)
    assert b.market_order("BTC/USDT", "sell", 0.001, price_hint=123.0).price == 123.0


def test_account_value_long_and_short():
    feed, px = _feed()
    b = PaperBroker(feed, 100.0, fee_pct=0.0, slippage_pct=0.0)
    b.market_order("BTC/USDT", "buy", 0.001)
    pos = Position("BTC/USDT", LONG, 0.001, px, 0)
    assert b.account_value({"BTC/USDT": pos}, {"BTC/USDT": px}) == pytest.approx(100.0)
    assert b.account_value({"BTC/USDT": pos}, {"BTC/USDT": px * 1.1}) == pytest.approx(100.0 + 0.001 * px * 0.1)
    b2 = PaperBroker(feed, 100.0, fee_pct=0.0, slippage_pct=0.0)
    b2.market_order("BTC/USDT", "sell", 0.001)
    spos = Position("BTC/USDT", SHORT, 0.001, px, 0)
    assert b2.account_value({"BTC/USDT": spos}, {"BTC/USDT": px * 0.9}) == pytest.approx(100.0 + 0.001 * px * 0.1)


def test_rejects_bad_orders():
    feed, _ = _feed()
    b = PaperBroker(feed, 100.0)
    with pytest.raises(ValueError):
        b.market_order("BTC/USDT", "buy", 0)
    with pytest.raises(ValueError):
        b.market_order("BTC/USDT", "hold", 1)
