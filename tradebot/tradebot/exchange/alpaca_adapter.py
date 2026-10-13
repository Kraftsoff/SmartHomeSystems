"""Alpaca (US stocks & ETFs): commission-free, fractional shares, paper API.

Docs: https://docs.alpaca.markets. Paper trading uses a separate host and its
own key pair. Shorting needs a margin account with >= $2,000 equity and whole
shares; small accounts should express bearish views through inverse ETFs
(SH, SQQQ, SCO ...) instead - the universe module does exactly that.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
import pandas as pd

from ..data.timeframes import tf_ms
from ..models import Fill, MarketInfo, Position
from .base import OHLCV_COLUMNS, Broker, DataFeed

log = logging.getLogger(__name__)

PAPER_HOST = "https://paper-api.alpaca.markets"
LIVE_HOST = "https://api.alpaca.markets"
DATA_HOST = "https://data.alpaca.markets"

_TF = {"1m": "1Min", "5m": "5Min", "15m": "15Min", "30m": "30Min", "1h": "1Hour", "4h": "4Hour", "1d": "1Day", "1w": "1Week"}


def _parse_ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


class AlpacaBroker(DataFeed, Broker):
    def __init__(self, key: str, secret: str, paper: bool = True, feed: str = "iex",
                 transport: httpx.BaseTransport | None = None, fill_timeout: float = 30.0) -> None:
        if not key or not secret:
            raise ValueError("Alpaca needs TB_ALPACA_KEY and TB_ALPACA_SECRET")
        headers = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "accept": "application/json"}
        self.trade = httpx.Client(base_url=PAPER_HOST if paper else LIVE_HOST, headers=headers, timeout=20, transport=transport)
        self.data = httpx.Client(base_url=DATA_HOST, headers=headers, timeout=20, transport=transport)
        self.feed_name = feed
        self.fill_timeout = fill_timeout
        self._assets: dict[str, dict] = {}

    # --- DataFeed ----------------------------------------------------------
    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        tf = _TF.get(timeframe)
        if tf is None:
            raise ValueError(f"alpaca: unsupported timeframe {timeframe}")
        r = self.data.get(f"/v2/stocks/{symbol}/bars", params={
            "timeframe": tf, "limit": limit, "feed": self.feed_name, "sort": "desc", "adjustment": "split",
        })
        r.raise_for_status()
        bars = r.json().get("bars") or []
        rows = [[_parse_ts(b["t"]), b["o"], b["h"], b["l"], b["c"], b["v"]] for b in bars]
        df = pd.DataFrame(rows, columns=OHLCV_COLUMNS)
        if df.empty:
            return df
        df["ts"] = df["ts"].astype("int64")
        return df.sort_values("ts").reset_index(drop=True)

    def fetch_ohlcv_history(self, symbol: str, timeframe: str, since_ms: int, until_ms: int | None = None) -> pd.DataFrame:
        tf = _TF[timeframe]
        start = datetime.fromtimestamp(since_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        frames, token = [], None
        while True:
            params = {"timeframe": tf, "start": start, "limit": 10000, "feed": self.feed_name, "adjustment": "split"}
            if token:
                params["page_token"] = token
            r = self.data.get(f"/v2/stocks/{symbol}/bars", params=params)
            r.raise_for_status()
            js = r.json()
            bars = js.get("bars") or []
            frames += [[_parse_ts(b["t"]), b["o"], b["h"], b["l"], b["c"], b["v"]] for b in bars]
            token = js.get("next_page_token")
            if not token or not bars:
                break
        df = pd.DataFrame(frames, columns=OHLCV_COLUMNS)
        if df.empty:
            return df
        df["ts"] = df["ts"].astype("int64")
        df = df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)
        return df[df["ts"] < (until_ms or self.now_ms())]

    def fetch_price(self, symbol: str) -> float:
        r = self.data.get(f"/v2/stocks/{symbol}/trades/latest", params={"feed": self.feed_name})
        r.raise_for_status()
        return float(r.json()["trade"]["p"])

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def is_market_open(self) -> bool:
        r = self.trade.get("/v2/clock")
        r.raise_for_status()
        return bool(r.json().get("is_open"))

    def market_info(self, symbol: str) -> MarketInfo:
        asset = self._asset(symbol)
        fractionable = bool(asset.get("fractionable"))
        return MarketInfo(symbol=symbol, min_qty=1e-9 if fractionable else 1.0,
                          qty_step=1e-9 if fractionable else 1.0, min_notional=1.0 if fractionable else 0.0)

    def _asset(self, symbol: str) -> dict:
        if symbol not in self._assets:
            r = self.trade.get(f"/v2/assets/{symbol}")
            r.raise_for_status()
            self._assets[symbol] = r.json()
        return self._assets[symbol]

    # --- Broker ---------------------------------------------------------------
    def market_order(self, symbol: str, side: str, qty: float, price_hint: float | None = None) -> Fill:
        asset = self._asset(symbol)
        if not asset.get("tradable", True):
            raise RuntimeError(f"{symbol} is not tradable on Alpaca")
        if asset.get("fractionable"):
            qty_s = f"{qty:.9f}".rstrip("0").rstrip(".")
        else:
            qty_s = str(int(qty))
            if int(qty) <= 0:
                raise ValueError(f"{symbol}: whole shares only, qty {qty} rounds to 0")
        body = {"symbol": symbol, "qty": qty_s, "side": side, "type": "market", "time_in_force": "day"}
        r = self.trade.post("/v2/orders", json=body)
        r.raise_for_status()
        order = r.json()
        deadline = time.time() + self.fill_timeout
        while order.get("status") not in ("filled", "canceled", "rejected", "expired") and time.time() < deadline:
            time.sleep(1.0)
            order = self.trade.get(f"/v2/orders/{order['id']}").json()
        if order.get("status") != "filled":
            raise RuntimeError(f"alpaca order {order.get('id')} not filled: status={order.get('status')}")
        return Fill(symbol=symbol, side=side, qty=float(order["filled_qty"]), price=float(order["filled_avg_price"]),
                    fee=0.0, ts=_parse_ts(order.get("filled_at") or order["updated_at"]), order_id=str(order["id"]))

    def cash(self) -> float:
        r = self.trade.get("/v2/account")
        r.raise_for_status()
        return float(r.json()["cash"])

    def account_value(self, positions: dict[str, Position], prices: dict[str, float]) -> float:
        r = self.trade.get("/v2/account")
        r.raise_for_status()
        return float(r.json()["equity"])

    def close(self) -> None:
        self.trade.close()
        self.data.close()
