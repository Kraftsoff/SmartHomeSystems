"""T-Invest (Т-Банк / Тинькофф Инвестиции) REST API: акции, облигации, ETF на MOEX.

Docs: https://developer.tbank.ru/invest/api. Token: Настройки → Токены API
(только "полный доступ" к торговле, без вывода). Sandbox has its own host and
virtual money. Symbols are "TICKER" or "CLASSCODE:TICKER" (TQBR stocks,
TQTF ETF, TQOB bonds). Quantities are in lots; the adapter converts.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone

import httpx
import pandas as pd

from ..data.timeframes import tf_ms
from ..models import Fill, MarketInfo, Position
from .base import OHLCV_COLUMNS, Broker, DataFeed

log = logging.getLogger(__name__)

LIVE_HOST = "https://invest-public-api.tinkoff.ru/rest"
SANDBOX_HOST = "https://sandbox-invest-public-api.tinkoff.ru/rest"
_SVC = "tinkoff.public.invest.api.contract.v1."
_TF = {"1m": "CANDLE_INTERVAL_1_MIN", "5m": "CANDLE_INTERVAL_5_MIN", "15m": "CANDLE_INTERVAL_15_MIN",
       "1h": "CANDLE_INTERVAL_HOUR", "4h": "CANDLE_INTERVAL_4_HOUR", "1d": "CANDLE_INTERVAL_DAY", "1w": "CANDLE_INTERVAL_WEEK"}
# max request span per interval (API limits)
_SPAN_MS = {"1m": 86_400_000, "5m": 86_400_000, "15m": 86_400_000, "1h": 7 * 86_400_000,
            "4h": 30 * 86_400_000, "1d": 365 * 86_400_000, "1w": 2 * 365 * 86_400_000}


def q2f(q: dict | None) -> float:
    """Quotation {units, nano} -> float."""
    if not q:
        return 0.0
    return float(q.get("units") or 0) + float(q.get("nano") or 0) / 1e9


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


class TInvestBroker(DataFeed, Broker):
    def __init__(self, token: str, account_id: str = "", sandbox: bool = True, default_class: str = "TQBR",
                 transport: httpx.BaseTransport | None = None) -> None:
        if not token:
            raise ValueError("T-Invest needs TB_TINVEST_TOKEN")
        self.client = httpx.Client(base_url=SANDBOX_HOST if sandbox else LIVE_HOST, timeout=20, transport=transport,
                                   headers={"Authorization": f"Bearer {token}", "accept": "application/json"})
        self.sandbox = sandbox
        self.default_class = default_class
        self._account_id = account_id
        self._instruments: dict[str, dict] = {}

    def _call(self, method: str, body: dict) -> dict:
        r = self.client.post(f"/{_SVC}{method}", json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"tinvest {method}: {r.status_code} {r.text[:300]}")
        return r.json()

    # --- instruments ----------------------------------------------------------
    def instrument(self, symbol: str) -> dict:
        if symbol in self._instruments:
            return self._instruments[symbol]
        class_code, _, ticker = symbol.rpartition(":")
        class_code = class_code or self.default_class
        js = self._call("InstrumentsService/GetInstrumentBy",
                        {"idType": "INSTRUMENT_ID_TYPE_TICKER", "classCode": class_code, "id": ticker})
        inst = js.get("instrument")
        if not inst:
            raise RuntimeError(f"tinvest: instrument {symbol} not found")
        self._instruments[symbol] = inst
        return inst

    def account_id(self) -> str:
        if not self._account_id:
            js = self._call("UsersService/GetAccounts", {})
            accounts = [a for a in js.get("accounts", []) if a.get("status") in (None, "ACCOUNT_STATUS_OPEN")]
            if not accounts and self.sandbox:
                self._account_id = self._call("SandboxService/OpenSandboxAccount", {})["accountId"]
                return self._account_id
            if not accounts:
                raise RuntimeError("tinvest: no open accounts")
            self._account_id = accounts[0]["id"]
        return self._account_id

    def sandbox_pay_in(self, amount: float, currency: str = "rub") -> None:
        units = int(amount)
        self._call("SandboxService/SandboxPayIn", {"accountId": self.account_id(),
                   "amount": {"currency": currency, "units": str(units), "nano": int(round((amount - units) * 1e9))}})

    # --- DataFeed ---------------------------------------------------------------
    def _candles(self, uid: str, timeframe: str, since: int, until: int) -> list[list]:
        js = self._call("MarketDataService/GetCandles", {"instrumentId": uid, "from": _iso(since), "to": _iso(until), "interval": _TF[timeframe]})
        rows = []
        for c in js.get("candles", []):
            if c.get("isComplete") is False:
                continue
            rows.append([_parse_ts(c["time"]), q2f(c["open"]), q2f(c["high"]), q2f(c["low"]), q2f(c["close"]), float(c.get("volume") or 0)])
        return rows

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        uid = self.instrument(symbol)["uid"]
        now = self.now_ms()
        # trading hours + weekends: ask for ~4x the needed span, chunked by API limit
        span = min(_SPAN_MS[timeframe], tf_ms(timeframe) * limit * 4)
        rows: list[list] = []
        until = now
        while len(rows) < limit and now - until < tf_ms(timeframe) * limit * 12:
            rows = self._candles(uid, timeframe, until - span, until) + rows
            until -= span
        df = pd.DataFrame(rows, columns=OHLCV_COLUMNS)
        if df.empty:
            return df
        df["ts"] = df["ts"].astype("int64")
        return df.drop_duplicates("ts").sort_values("ts").tail(limit).reset_index(drop=True)

    def fetch_ohlcv_history(self, symbol: str, timeframe: str, since_ms: int, until_ms: int | None = None) -> pd.DataFrame:
        uid = self.instrument(symbol)["uid"]
        until_ms = until_ms or self.now_ms()
        rows, cursor = [], since_ms
        while cursor < until_ms:
            end = min(cursor + _SPAN_MS[timeframe], until_ms)
            rows += self._candles(uid, timeframe, cursor, end)
            cursor = end
        df = pd.DataFrame(rows, columns=OHLCV_COLUMNS)
        if df.empty:
            return df
        df["ts"] = df["ts"].astype("int64")
        return df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)

    def fetch_price(self, symbol: str) -> float:
        uid = self.instrument(symbol)["uid"]
        js = self._call("MarketDataService/GetLastPrices", {"instrumentId": [uid]})
        prices = js.get("lastPrices") or []
        if not prices:
            raise RuntimeError(f"tinvest: no last price for {symbol}")
        return q2f(prices[0].get("price"))

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def is_market_open(self) -> bool:
        # MOEX main session (approx, Moscow time 10:00-18:50 + evening 19:05-23:50 on weekdays).
        now = datetime.now(timezone.utc)
        msk_h = (now.hour + 3) % 24
        if now.weekday() >= 5:
            return False
        return 10 <= msk_h < 24

    def market_info(self, symbol: str) -> MarketInfo:
        inst = self.instrument(symbol)
        lot = float(inst.get("lot") or 1)
        return MarketInfo(symbol=symbol, min_qty=lot, qty_step=lot, min_notional=0.0,
                          price_step=q2f(inst.get("minPriceIncrement")))

    # --- Broker -------------------------------------------------------------------
    def market_order(self, symbol: str, side: str, qty: float, price_hint: float | None = None) -> Fill:
        inst = self.instrument(symbol)
        lot = int(inst.get("lot") or 1)
        lots = int(qty // lot)
        if lots <= 0:
            raise ValueError(f"{symbol}: qty {qty} is below one lot ({lot})")
        js = self._call("OrdersService/PostOrder", {
            "quantity": str(lots), "direction": "ORDER_DIRECTION_BUY" if side == "buy" else "ORDER_DIRECTION_SELL",
            "accountId": self.account_id(), "orderType": "ORDER_TYPE_MARKET", "orderId": str(uuid.uuid4()),
            "instrumentId": inst["uid"],
        })
        status = js.get("executionReportStatus", "")
        if status not in ("EXECUTION_REPORT_STATUS_FILL", "EXECUTION_REPORT_STATUS_PARTIALLYFILL"):
            raise RuntimeError(f"tinvest order not filled: {status} {js.get('message', '')}")
        filled_lots = int(js.get("lotsExecuted") or lots)
        price = q2f(js.get("executedOrderPrice")) or (price_hint or self.fetch_price(symbol))
        commission = q2f((js.get("executedCommission") or {}))
        return Fill(symbol=symbol, side=side, qty=float(filled_lots * lot), price=price, fee=commission,
                    ts=self.now_ms(), order_id=str(js.get("orderId", "")))

    def _portfolio(self) -> dict:
        return self._call("OperationsService/GetPortfolio", {"accountId": self.account_id()})

    def cash(self) -> float:
        return q2f(self._portfolio().get("totalAmountCurrencies"))

    def account_value(self, positions: dict[str, Position], prices: dict[str, float]) -> float:
        return q2f(self._portfolio().get("totalAmountPortfolio"))

    def close(self) -> None:
        self.client.close()
