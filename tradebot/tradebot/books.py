"""A Book = one asset class tab: its own broker, symbols, strategy, risk and cash."""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field

import yaml

from .config import Settings
from .risk import RiskLimits


@dataclass(eq=False)  # identity hash: books are dict keys in the Supervisor
class BookConfig:
    name: str  # "stocks" | "securities" | "crypto" | anything
    title: str  # tab label shown in the UI
    broker: str  # "ccxt" | "alpaca" | "tinvest"
    symbols: list[str]
    timeframe: str = "1d"
    strategy: str = "ensemble"
    strategy_params: dict = field(default_factory=dict)
    mode: str = "paper"  # paper | live (broker-specific meaning, see README)
    starting_cash: float = 50.0
    quote_currency: str = "USD"
    allow_short: bool = False
    fee_pct: float = 0.0
    slippage_pct: float = 0.05
    min_notional: float = 1.0
    enabled: bool = True
    risk: dict = field(default_factory=dict)
    # broker options
    exchange: str = "binance"  # ccxt
    market_type: str = "spot"  # ccxt
    leverage: int = 1
    sandbox: bool = True  # alpaca paper host / tinvest sandbox host
    default_class: str = "TQBR"  # tinvest

    def risk_limits(self, base: RiskLimits) -> RiskLimits:
        d = asdict(base)
        d.update({k: v for k, v in self.risk.items() if k in d})
        return RiskLimits(**d)

    def describe(self) -> dict:
        d = asdict(self)
        return d


DEFAULT_BOOKS = [
    BookConfig(
        name="stocks", title="Акции", broker="alpaca", timeframe="1d", strategy="ensemble",
        symbols=["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "XOM"],
        quote_currency="USD", min_notional=1.0,
    ),
    BookConfig(
        name="securities", title="Ценные бумаги", broker="alpaca", timeframe="1d", strategy="tsmom",
        symbols=["TLT", "IEF", "GLD", "SLV", "USO", "BNO", "UNG", "DBA", "UUP", "SH"],
        quote_currency="USD", min_notional=1.0,
    ),
    BookConfig(
        name="crypto", title="Криптовалюта", broker="ccxt", timeframe="1h", strategy="ema_trend",
        symbols=["BTC/USDT", "ETH/USDT"], quote_currency="USDT", fee_pct=0.1, min_notional=10.0,
    ),
]


def load_books(path: str | None, settings: Settings) -> list[BookConfig]:
    """Books from a YAML file, or the three default tabs when no file exists.

    The crypto default inherits the single-book TB_* env settings so the
    original one-book setup keeps working unchanged.
    """
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}
        books = []
        for item in raw.get("books", []):
            item = dict(item)
            if isinstance(item.get("symbols"), str):
                item["symbols"] = [s.strip() for s in item["symbols"].split(",") if s.strip()]
            books.append(BookConfig(**item))
        if not books:
            raise ValueError(f"{path}: no books defined")
        return books
    books = [BookConfig(**asdict(b)) for b in DEFAULT_BOOKS]
    for b in books:
        if b.name == "crypto":
            b.symbols = settings.symbol_list
            b.timeframe = settings.timeframe
            b.strategy = settings.strategy
            b.strategy_params = settings.strategy_param_dict
            b.mode = settings.mode
            b.starting_cash = settings.starting_cash
            b.quote_currency = settings.quote_currency
            b.allow_short = settings.allow_short
            b.fee_pct = settings.fee_pct
            b.slippage_pct = settings.slippage_pct
            b.min_notional = settings.min_notional
            b.exchange = settings.exchange
            b.market_type = settings.market_type
            b.leverage = settings.leverage
            b.sandbox = settings.sandbox
        elif b.broker == "alpaca":
            b.enabled = bool(settings.alpaca_key and settings.alpaca_secret)
            b.mode = "live" if settings.alpaca_live else "paper"
        b.starting_cash = b.starting_cash or settings.starting_cash
    return books
