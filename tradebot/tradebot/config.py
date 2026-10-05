"""Settings loaded from environment / .env (prefix TB_)."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TB_", extra="ignore")

    # --- what and where to trade -------------------------------------------
    mode: Literal["paper", "live"] = "paper"
    exchange: str = "binance"  # any ccxt exchange id: binance, bybit, okx, kraken ...
    market_type: Literal["spot", "swap"] = "spot"  # swap = USDT perpetual futures
    api_key: str = ""
    api_secret: str = ""
    api_password: str = ""  # OKX / KuCoin passphrase
    sandbox: bool = False  # exchange testnet if supported
    symbols: str = "BTC/USDT,ETH/USDT"
    timeframe: str = "1h"
    quote_currency: str = "USDT"

    # --- strategy -------------------------------------------------------------
    strategy: str = "ema_trend"
    strategy_params: str = ""  # JSON dict overriding strategy defaults

    # --- money & risk ---------------------------------------------------------
    starting_cash: float = 50.0  # paper-mode virtual balance
    risk_per_trade_pct: float = 1.0  # % of equity lost if the stop is hit
    max_risk_mult: float = 3.0  # allow up to N x risk to satisfy min notional
    max_position_pct: float = 50.0  # max notional of one position, % of equity
    max_open_positions: int = 2
    max_daily_loss_pct: float = 3.0  # halt new entries for the day
    max_drawdown_pct: float = 15.0  # kill switch from equity peak
    min_notional: float = 10.0  # exchange minimum order, quote currency
    fee_pct: float = 0.1  # taker fee per side (paper / backtest)
    slippage_pct: float = 0.05  # paper / backtest
    allow_short: bool = False  # needs market_type=swap on live
    leverage: int = 1

    # --- runtime ---------------------------------------------------------------
    poll_seconds: int = 30
    data_dir: str = "data"
    log_level: str = "INFO"

    # --- access ----------------------------------------------------------------
    web_host: str = "0.0.0.0"
    web_port: int = 8080
    web_token: str = ""  # REQUIRED for anything exposed to the internet
    telegram_token: str = ""
    telegram_chat_id: str = ""

    @field_validator("timeframe")
    @classmethod
    def _tf(cls, v: str) -> str:
        from .data.timeframes import tf_ms

        tf_ms(v)  # raises on invalid
        return v

    @property
    def symbol_list(self) -> list[str]:
        return [s.strip() for s in self.symbols.split(",") if s.strip()]

    @property
    def strategy_param_dict(self) -> dict:
        if not self.strategy_params:
            return {}
        return json.loads(self.strategy_params)

    @property
    def db_path(self) -> str:
        return f"{self.data_dir}/tradebot.sqlite"
