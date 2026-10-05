"""Build a configured Engine (+ optional Telegram) from Settings."""
from __future__ import annotations

import logging

from .config import Settings
from .engine import Engine
from .exchange.ccxt_adapter import CcxtBroker, CcxtFeed
from .exchange.paper import PaperBroker
from .risk import RiskLimits, RiskManager
from .storage import Storage
from .strategies import make_strategy


def risk_limits(s: Settings) -> RiskLimits:
    return RiskLimits(
        risk_per_trade_pct=s.risk_per_trade_pct,
        max_risk_mult=s.max_risk_mult,
        max_position_pct=s.max_position_pct,
        max_open_positions=s.max_open_positions,
        max_daily_loss_pct=s.max_daily_loss_pct,
        max_drawdown_pct=s.max_drawdown_pct,
        leverage=s.leverage,
    )


def build_engine(s: Settings, feed=None, broker=None, storage: Storage | None = None, notifier=None) -> Engine:
    logging.basicConfig(level=getattr(logging, s.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if s.allow_short and s.mode == "live" and s.market_type != "swap":
        raise ValueError("shorting on a live account needs TB_MARKET_TYPE=swap (perpetual futures)")
    if s.mode == "live":
        broker = broker or CcxtBroker(
            s.exchange, s.api_key, s.api_secret, s.api_password, market_type=s.market_type,
            quote=s.quote_currency, leverage=s.leverage, sandbox=s.sandbox,
        )
        feed = feed or broker
    else:
        feed = feed or CcxtFeed(s.exchange, s.market_type, sandbox=s.sandbox)
        broker = broker or PaperBroker(feed, s.starting_cash, fee_pct=s.fee_pct,
                                       slippage_pct=s.slippage_pct, min_notional=s.min_notional)
    storage = storage or Storage(s.db_path)
    return Engine(
        symbols=s.symbol_list, timeframe=s.timeframe,
        strategy=make_strategy(s.strategy, s.strategy_param_dict),
        feed=feed, broker=broker, risk=RiskManager(risk_limits(s)), storage=storage,
        allow_short=s.allow_short, notifier=notifier, mode=s.mode,
    )
