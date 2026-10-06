"""Alpaca / T-Invest adapters against mocked HTTP."""
import json

import httpx
import pytest

from tradebot.exchange.alpaca_adapter import AlpacaBroker
from tradebot.exchange.tinvest_adapter import TInvestBroker, q2f
from tradebot.models import LONG, Position


def test_alpaca_roundtrip():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append((req.method, req.url.path, dict(req.url.params)))
        p = req.url.path
        if p == "/v2/stocks/USO/bars":
            return httpx.Response(200, json={"bars": [
                {"t": "2026-10-02T14:00:00Z", "o": 70, "h": 71, "l": 69, "c": 70.5, "v": 100},
                {"t": "2026-10-02T13:00:00Z", "o": 69, "h": 70, "l": 68, "c": 70, "v": 90}]})
        if p == "/v2/stocks/USO/trades/latest":
            return httpx.Response(200, json={"trade": {"p": 70.7}})
        if p == "/v2/clock":
            return httpx.Response(200, json={"is_open": True})
        if p == "/v2/assets/USO":
            return httpx.Response(200, json={"fractionable": True, "tradable": True})
        if p == "/v2/orders" and req.method == "POST":
            body = json.loads(req.content)
            assert body == {"symbol": "USO", "qty": "0.1415", "side": "buy", "type": "market", "time_in_force": "day"}
            return httpx.Response(200, json={"id": "o1", "status": "accepted"})
        if p == "/v2/orders/o1":
            return httpx.Response(200, json={"id": "o1", "status": "filled", "filled_qty": "0.1415", "filled_avg_price": "70.71",
                                             "filled_at": "2026-10-02T14:00:01Z", "updated_at": "2026-10-02T14:00:01Z"})
        if p == "/v2/account":
            return httpx.Response(200, json={"cash": "40.0", "equity": "50.0"})
        return httpx.Response(404, json={"message": p})

    b = AlpacaBroker("k", "s", paper=True, transport=httpx.MockTransport(handler), fill_timeout=5)
    df = b.fetch_ohlcv("USO", "1h", 10)
    assert list(df["close"]) == [70, 70.5] and df["ts"].is_monotonic_increasing
    assert b.fetch_price("USO") == 70.7 and b.is_market_open()
    info = b.market_info("USO")
    assert info.qty_step == 1e-9
    fill = b.market_order("USO", "buy", 0.1415)
    assert fill.qty == 0.1415 and fill.price == 70.71 and fill.order_id == "o1"
    assert b.cash() == 40.0 and b.account_value({"USO": Position("USO", LONG, 0.1415, 70.71, 0)}, {"USO": 71}) == 50.0
    assert any(c[1] == "/v2/orders/o1" for c in calls)
    assert calls[0][2]["timeframe"] == "1Hour"
    with pytest.raises(ValueError):
        b.fetch_ohlcv("USO", "3h", 10)


def test_alpaca_whole_shares_only_and_rejections():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v2/assets/SH":
            return httpx.Response(200, json={"fractionable": False, "tradable": True})
        if req.url.path == "/v2/orders":
            return httpx.Response(200, json={"id": "o2", "status": "rejected"})
        return httpx.Response(404)

    b = AlpacaBroker("k", "s", transport=httpx.MockTransport(handler), fill_timeout=1)
    assert b.market_info("SH").qty_step == 1.0
    with pytest.raises(ValueError):
        b.market_order("SH", "buy", 0.4)
    with pytest.raises(RuntimeError):
        b.market_order("SH", "buy", 2)


def test_tinvest_roundtrip():
    def handler(req: httpx.Request) -> httpx.Response:
        m = req.url.path.split(".")[-1]
        body = json.loads(req.content or b"{}")
        if m == "InstrumentsService/GetInstrumentBy":
            assert body["classCode"] == "TQBR" and body["id"] == "SBER"
            return httpx.Response(200, json={"instrument": {"uid": "u1", "figi": "f1", "lot": 10, "minPriceIncrement": {"units": "0", "nano": 10000000}}})
        if m == "UsersService/GetAccounts":
            return httpx.Response(200, json={"accounts": [{"id": "acc1", "status": "ACCOUNT_STATUS_OPEN"}]})
        if m == "MarketDataService/GetCandles":
            return httpx.Response(200, json={"candles": [
                {"time": "2026-10-02T10:00:00Z", "open": {"units": "300", "nano": 0}, "high": {"units": "305", "nano": 0},
                 "low": {"units": "299", "nano": 500000000}, "close": {"units": "304", "nano": 250000000}, "volume": "1000", "isComplete": True},
                {"time": "2026-10-02T11:00:00Z", "open": {"units": "304"}, "high": {"units": "306"}, "low": {"units": "303"}, "close": {"units": "305"}, "volume": "5", "isComplete": False}]})
        if m == "MarketDataService/GetLastPrices":
            return httpx.Response(200, json={"lastPrices": [{"price": {"units": "305", "nano": 500000000}}]})
        if m == "OrdersService/PostOrder":
            assert body["quantity"] == "2" and body["direction"] == "ORDER_DIRECTION_BUY" and body["accountId"] == "acc1"
            return httpx.Response(200, json={"orderId": "ord1", "executionReportStatus": "EXECUTION_REPORT_STATUS_FILL", "lotsExecuted": 2,
                                             "executedOrderPrice": {"units": "305", "nano": 600000000}, "executedCommission": {"units": "0", "nano": 300000000}})
        if m == "OperationsService/GetPortfolio":
            return httpx.Response(200, json={"totalAmountPortfolio": {"units": "50000", "nano": 0}, "totalAmountCurrencies": {"units": "43888", "nano": 0}})
        return httpx.Response(404, text=m)

    b = TInvestBroker("tok", transport=httpx.MockTransport(handler))
    assert q2f({"units": "1", "nano": 500000000}) == 1.5
    df = b.fetch_ohlcv("SBER", "1h", 5)
    assert len(df) == 1 and df["close"].iloc[0] == 304.25  # incomplete candle dropped
    assert b.fetch_price("SBER") == 305.5
    info = b.market_info("SBER")
    assert info.qty_step == 10 and info.min_qty == 10 and info.price_step == 0.01
    fill = b.market_order("SBER", "buy", 25)  # 25 shares -> 2 lots = 20 shares
    assert fill.qty == 20 and fill.price == 305.6 and fill.fee == 0.3
    assert b.cash() == 43888 and b.account_value({}, {}) == 50000
    with pytest.raises(ValueError):
        b.market_order("SBER", "buy", 5)
