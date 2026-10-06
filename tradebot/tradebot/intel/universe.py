"""Tradable universe the analyst may pick from, with the themes each instrument expresses.

The example "a tanker was seized -> oil goes up -> buy oil" maps to USO/BNO on
a US broker, to inverse ETFs for bearish views on small accounts (no margin
needed), and to the matching MOEX names on T-Invest.
"""
from __future__ import annotations

CATALOG: dict[str, dict] = {
    # --- US ETFs: commodities, rates, FX, volatility, inverse ---------------------
    "USO": {"desc": "WTI crude oil ETF", "tags": ["oil", "energy", "wti"]},
    "BNO": {"desc": "Brent crude oil ETF", "tags": ["oil", "energy", "brent", "middle east"]},
    "SCO": {"desc": "2x inverse crude oil ETF (bearish oil, no margin needed)", "tags": ["oil", "inverse"], "inverse_of": "USO"},
    "UNG": {"desc": "US natural gas ETF", "tags": ["gas", "energy", "lng"]},
    "GLD": {"desc": "Gold ETF", "tags": ["gold", "safe haven", "inflation", "geopolitics"]},
    "SLV": {"desc": "Silver ETF", "tags": ["silver", "metals"]},
    "CPER": {"desc": "Copper ETF", "tags": ["copper", "china", "industrial"]},
    "DBA": {"desc": "Agriculture commodities ETF", "tags": ["food", "grain", "wheat", "agriculture"]},
    "WEAT": {"desc": "Wheat ETF", "tags": ["wheat", "grain", "ukraine", "food"]},
    "TLT": {"desc": "20+ year US Treasury bonds", "tags": ["bonds", "rates", "fed", "recession", "safe haven"]},
    "IEF": {"desc": "7-10 year US Treasury bonds", "tags": ["bonds", "rates", "fed"]},
    "TBT": {"desc": "2x inverse long Treasuries (bearish bonds / rates up)", "tags": ["bonds", "inverse", "rates"], "inverse_of": "TLT"},
    "UUP": {"desc": "US dollar index bullish", "tags": ["dollar", "fx", "fed"]},
    "FXE": {"desc": "Euro currency ETF", "tags": ["euro", "fx", "ecb"]},
    "FXY": {"desc": "Japanese yen ETF", "tags": ["yen", "fx", "boj", "safe haven"]},
    "VIXY": {"desc": "Short-term VIX futures (spikes on panic, decays otherwise - short holds only)", "tags": ["volatility", "panic", "crash"]},
    # --- US sectors ----------------------------------------------------------------
    "SPY": {"desc": "S&P 500", "tags": ["us equities", "macro", "risk-on"]},
    "QQQ": {"desc": "Nasdaq 100", "tags": ["tech", "growth", "risk-on"]},
    "SH": {"desc": "Inverse S&P 500 (bearish US stocks, no margin needed)", "tags": ["us equities", "inverse", "risk-off"], "inverse_of": "SPY"},
    "SQQQ": {"desc": "3x inverse Nasdaq 100", "tags": ["tech", "inverse", "risk-off"], "inverse_of": "QQQ"},
    "XLE": {"desc": "US energy sector", "tags": ["oil", "energy", "exxon", "chevron"]},
    "ITA": {"desc": "US aerospace & defense", "tags": ["defense", "war", "military", "nato"]},
    "SOXX": {"desc": "Semiconductors", "tags": ["chips", "semiconductors", "taiwan", "ai", "nvidia"]},
    "XLF": {"desc": "US financials", "tags": ["banks", "rates", "credit"]},
    "KWEB": {"desc": "China internet", "tags": ["china", "tariff", "trade war"]},
    "EWZ": {"desc": "Brazil equities", "tags": ["brazil", "emerging markets", "commodities"]},
    "EEM": {"desc": "Emerging markets equities", "tags": ["emerging markets", "dollar"]},
    "XLV": {"desc": "US healthcare", "tags": ["pharma", "healthcare", "fda"]},
    "URA": {"desc": "Uranium miners", "tags": ["uranium", "nuclear", "energy"]},
    "TAN": {"desc": "Solar energy", "tags": ["solar", "renewables", "subsidies"]},
    "IBIT": {"desc": "Spot bitcoin ETF (stock-market hours exposure to BTC)", "tags": ["bitcoin", "crypto"]},
    # --- US single names -------------------------------------------------------------
    "AAPL": {"desc": "Apple", "tags": ["tech", "china", "tariff", "consumer"]},
    "MSFT": {"desc": "Microsoft", "tags": ["tech", "ai", "cloud"]},
    "NVDA": {"desc": "Nvidia", "tags": ["ai", "chips", "export controls", "china"]},
    "AMZN": {"desc": "Amazon", "tags": ["tech", "retail", "cloud"]},
    "GOOGL": {"desc": "Alphabet", "tags": ["tech", "ai", "antitrust"]},
    "META": {"desc": "Meta", "tags": ["tech", "ai", "regulation"]},
    "TSLA": {"desc": "Tesla", "tags": ["ev", "china", "tariff", "musk"]},
    "XOM": {"desc": "ExxonMobil", "tags": ["oil", "energy"]},
    "LMT": {"desc": "Lockheed Martin", "tags": ["defense", "war", "military"]},
    "BA": {"desc": "Boeing", "tags": ["aerospace", "airlines", "tariff"]},
    "COIN": {"desc": "Coinbase", "tags": ["crypto", "bitcoin", "sec"]},
    "MSTR": {"desc": "MicroStrategy (leveraged bitcoin proxy)", "tags": ["bitcoin", "crypto"]},
    # --- crypto (ccxt symbols) -------------------------------------------------------
    "BTC/USDT": {"desc": "Bitcoin", "tags": ["bitcoin", "crypto", "etf approval", "sec", "halving", "risk-on"]},
    "ETH/USDT": {"desc": "Ethereum", "tags": ["ethereum", "crypto", "defi", "sec"]},
    "SOL/USDT": {"desc": "Solana", "tags": ["crypto", "defi"]},
    "XRP/USDT": {"desc": "XRP", "tags": ["crypto", "sec", "ripple"]},
    # --- MOEX (T-Invest) ----------------------------------------------------------------
    "SBER": {"desc": "Сбербанк", "tags": ["russia", "banks", "sanctions", "cbr"]},
    "GAZP": {"desc": "Газпром", "tags": ["russia", "gas", "sanctions", "europe"]},
    "LKOH": {"desc": "Лукойл", "tags": ["russia", "oil", "sanctions"]},
    "ROSN": {"desc": "Роснефть", "tags": ["russia", "oil", "sanctions"]},
    "NVTK": {"desc": "Новатэк", "tags": ["russia", "lng", "gas", "sanctions"]},
    "GMKN": {"desc": "Норникель", "tags": ["russia", "nickel", "palladium", "metals"]},
    "PLZL": {"desc": "Полюс", "tags": ["russia", "gold"]},
    "YDEX": {"desc": "Яндекс", "tags": ["russia", "tech"]},
    "TQTF:SBGD": {"desc": "Фонд на золото (Сбер)", "tags": ["gold", "russia", "safe haven"]},
    "TQTF:TMOS": {"desc": "Фонд на индекс Мосбиржи", "tags": ["russia", "macro"]},
    "TQOB:SU26238RMFS4": {"desc": "ОФЗ 26238 (длинные гособлигации)", "tags": ["russia", "bonds", "cbr", "rates"]},
}


def describe_universe(books: list) -> list[dict]:
    """Instruments the analyst may use, per enabled book, with short descriptions."""
    out = []
    for b in books:
        allowed = []
        for sym in b.symbols + [s for s, meta in CATALOG.items() if _fits(b, s)]:
            if sym in allowed:
                continue
            meta = CATALOG.get(sym, {"desc": sym, "tags": []})
            allowed.append(sym)
            out.append({"book": b.name, "symbol": sym, "desc": meta["desc"], "tags": meta.get("tags", []),
                        "inverse_of": meta.get("inverse_of"), "short_allowed": b.allow_short})
    return out


def _fits(book, symbol: str) -> bool:
    if book.broker == "ccxt":
        return "/" in symbol
    if book.broker == "tinvest":
        return ":" in symbol or (symbol.isalpha() and symbol.isupper() and symbol in {"SBER", "GAZP", "LKOH", "ROSN", "NVTK", "GMKN", "PLZL", "YDEX"})
    if book.broker == "alpaca":
        return "/" not in symbol and ":" not in symbol and symbol not in {"SBER", "GAZP", "LKOH", "ROSN", "NVTK", "GMKN", "PLZL", "YDEX"}
    return False


def inverse_for(symbol: str) -> str | None:
    for s, meta in CATALOG.items():
        if meta.get("inverse_of") == symbol:
            return s
    return None
