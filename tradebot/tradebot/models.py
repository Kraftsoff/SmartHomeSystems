"""Core data types shared by the engine, brokers, strategies and storage."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

LONG = 1
SHORT = -1

SIDE_NAMES = {LONG: "LONG", SHORT: "SHORT"}


@dataclass
class Candle:
    ts: int  # candle open time, unix ms
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class Signal:
    """What a strategy wants to do on the latest closed candle.

    direction      +1 open long, -1 open short, 0 no new position.
    close_position True if an existing position should be closed now.
    stop / take_profit are absolute price levels for a *new* position.
    trail_distance is an absolute price distance for a trailing stop.
    """

    direction: int = 0
    close_position: bool = False
    stop: float | None = None
    take_profit: float | None = None
    trail_distance: float | None = None
    reason: str = ""
    max_hold_ms: int | None = None  # time stop: close after this many ms
    source: str = "strategy"  # "strategy" | "intel" | "manual"
    max_notional: float | None = None  # hard cap on position size in quote currency

    @classmethod
    def hold(cls, reason: str = "hold") -> "Signal":
        return cls(direction=0, close_position=False, reason=reason)


@dataclass
class Position:
    symbol: str
    side: int  # LONG or SHORT
    qty: float
    entry_price: float
    entry_ts: int
    stop: float | None = None
    take_profit: float | None = None
    trail_distance: float | None = None
    extreme_price: float = 0.0  # best price seen since entry (for trailing)
    entry_fee: float = 0.0
    reason: str = ""
    expires_ts: int | None = None  # time stop
    source: str = "strategy"

    def unrealized(self, price: float) -> float:
        return (price - self.entry_price) * self.qty * self.side

    def notional(self, price: float) -> float:
        return self.qty * price

    def side_name(self) -> str:
        return SIDE_NAMES.get(self.side, str(self.side))

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "Position":
        return cls(**json.loads(raw))


@dataclass
class Trade:
    symbol: str
    side: int
    qty: float
    entry_price: float
    exit_price: float
    entry_ts: int
    exit_ts: int
    pnl: float  # net of fees
    fees: float
    entry_reason: str = ""
    exit_reason: str = ""

    @property
    def return_pct(self) -> float:
        cost = self.entry_price * self.qty
        return (self.pnl / cost * 100.0) if cost else 0.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["side"] = SIDE_NAMES.get(self.side, str(self.side))
        d["return_pct"] = round(self.return_pct, 4)
        return d


@dataclass
class Fill:
    symbol: str
    side: str  # "buy" | "sell"
    qty: float
    price: float
    fee: float
    ts: int
    order_id: str = ""


@dataclass
class MarketInfo:
    symbol: str
    min_qty: float = 0.0
    qty_step: float = 0.0
    min_notional: float = 0.0
    price_step: float = 0.0

    def round_qty(self, qty: float) -> float:
        if self.qty_step and self.qty_step > 0:
            steps = int(qty / self.qty_step + 1e-9)
            qty = steps * self.qty_step
        return float(f"{qty:.10g}")


@dataclass
class Event:
    ts: int
    level: str
    message: str
    data: dict = field(default_factory=dict)
