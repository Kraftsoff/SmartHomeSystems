"""Turn world events into structured trade theses.

ClaudeAnalyst calls the Claude API with structured output; RuleAnalyst is a
keyword fallback that needs no key (and keeps tests deterministic).
Both return the same `Analysis` object.
"""
from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, Field

log = logging.getLogger(__name__)


class Thesis(BaseModel):
    book: str = Field(description="book name the instrument belongs to")
    symbol: str = Field(description="exact symbol from the allowed universe")
    direction: Literal["long", "short"]
    confidence: float = Field(ge=0.0, le=1.0, description="probability the move happens within the horizon")
    horizon_hours: int = Field(ge=1, le=720)
    rationale: str = Field(description="2-3 sentences: event -> mechanism -> price")
    invalidation: str = Field(description="what would prove the thesis wrong")
    event_ids: list[str] = Field(default_factory=list)
    already_priced_in: bool = Field(default=False, description="true if the market has very likely reacted already")


class Analysis(BaseModel):
    market_summary: str = Field(description="3-5 sentences on the dominant themes right now")
    theses: list[Thesis] = Field(default_factory=list)


SYSTEM_PROMPT = """You are the chief macro and event-driven strategist of a small systematic fund.
You receive a batch of recent world news headlines and the exact list of instruments the fund can trade.
Your job: identify events that create a tradable, directional price impact over hours to days, and express
each as a thesis on ONE allowed instrument.

Discipline rules (the fund's risk desk enforces them, you must respect them):
- Only use symbols from the allowed universe, exactly as written, with the matching book.
- Prefer the most direct instrument for the theme (oil shock -> USO/BNO, not an airline).
- If a book does not allow shorts, express a bearish view with the listed inverse instrument, or skip it.
- Markets are fast: a headline older than a few hours is usually priced in. Set already_priced_in=true
  and confidence <= 0.5 unless the event has multi-day consequences the market is still digesting.
- Confidence is a calibrated probability, not enthusiasm. Most headlines deserve nothing. Returning zero
  theses is a good answer when nothing is clearly actionable. Never exceed 0.9.
- Give concrete invalidation conditions. Horizon in hours (1-720).
- Do not invent facts. If a headline is ambiguous, rumor-like, or satirical, ignore it."""


class ClaudeAnalyst:
    def __init__(self, api_key: str, model: str = "claude-opus-5-5", effort: str = "high") -> None:
        import anthropic

        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.effort = effort

    def analyze(self, events: list[dict], universe: list[dict], context: dict | None = None) -> Analysis:
        lines = [f"[{e['id']}] {e.get('source', '')} | {e.get('title', '')}" + (f" — {e['summary'][:200]}" if e.get("summary") else "")
                 for e in events]
        uni = "\n".join(f"- {u['book']}: {u['symbol']} — {u['desc']} (tags: {', '.join(u['tags'])}; shorts {'allowed' if u['short_allowed'] else 'NOT allowed'}"
                        + (f"; inverse of {u['inverse_of']}" if u.get("inverse_of") else "") + ")" for u in universe)
        user = (f"Current portfolio context: {json.dumps(context or {}, ensure_ascii=False)}\n\n"
                f"ALLOWED UNIVERSE:\n{uni}\n\nRECENT EVENTS (newest first):\n" + "\n".join(lines))
        response = self.client.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=Analysis,
            output_config={"effort": self.effort},
        )
        if response.stop_reason == "refusal":
            log.warning("analyst: request refused by safety classifier")
            return Analysis(market_summary="refused", theses=[])
        parsed = response.parsed_output
        return parsed if parsed is not None else Analysis(market_summary="no parse", theses=[])


# --- keyword fallback -----------------------------------------------------------------
RULES: list[tuple[tuple[str, ...], str, str, float, int, str]] = [
    # (keywords any-of, theme tag, direction, confidence, horizon h, rationale)
    (("tanker", "strait of hormuz", "opec cut", "oil embargo", "pipeline attack", "refinery attack"), "oil", "long", 0.6, 72, "supply disruption lifts crude"),
    (("opec raises output", "opec increase", "oil glut", "spr release"), "oil", "short", 0.55, 72, "supply increase pressures crude"),
    (("rate cut", "dovish", "pivot"), "bonds", "long", 0.55, 120, "lower rates lift bond prices"),
    (("rate hike", "hawkish", "hot inflation", "inflation surges"), "bonds", "short", 0.55, 120, "higher rates hit bond prices"),
    (("etf approval", "bitcoin etf", "spot etf approved"), "bitcoin", "long", 0.6, 96, "ETF flows lift bitcoin"),
    (("exchange hack", "crypto hack", "sec sues", "sec lawsuit crypto", "exchange halts withdrawals"), "bitcoin", "short", 0.55, 48, "crypto risk-off"),
    (("invasion", "missile strike", "war escalat", "ceasefire collapses"), "gold", "long", 0.55, 96, "geopolitical safe-haven bid"),
    (("ceasefire", "peace deal", "truce"), "gold", "short", 0.5, 96, "risk-on unwinds safe-haven bid"),
    (("tariff", "trade war", "export controls"), "china", "short", 0.5, 120, "tariffs hit China-exposed assets"),
    (("defense spending", "nato", "rearm", "military aid"), "defense", "long", 0.5, 240, "defense budgets rise"),
    (("chip export", "semiconductor ban", "taiwan"), "chips", "short", 0.5, 96, "semis exposed to export/China risk"),
]


class RuleAnalyst:
    """No-API fallback. Deliberately conservative - it mostly returns nothing."""

    def analyze(self, events: list[dict], universe: list[dict], context: dict | None = None) -> Analysis:
        theses: list[Thesis] = []
        seen: set[tuple[str, str]] = set()
        for e in events:
            text = f"{e.get('title', '')} {e.get('summary', '')}".lower()
            for keywords, tag, direction, conf, horizon, why in RULES:
                if not any(k in text for k in keywords):
                    continue
                # prefer the most direct instrument: the one whose primary tag is the theme (USO over XOM)
                for u in sorted(universe, key=lambda u: (u["tags"][:1] != [tag], u["symbol"])):
                    if tag not in u["tags"] or u.get("inverse_of"):
                        continue
                    sym, book = u["symbol"], u["book"]
                    if (book, sym) in seen:
                        continue
                    seen.add((book, sym))
                    theses.append(Thesis(book=book, symbol=sym, direction=direction, confidence=conf, horizon_hours=horizon,
                                         rationale=f"{e.get('title', '')[:120]}: {why}", invalidation="headline reversed or price moves against by 1 ATR",
                                         event_ids=[e["id"]]))
                    break
        return Analysis(market_summary=f"rule-based scan of {len(events)} events", theses=theses)


def make_analyst(settings):
    if settings.anthropic_api_key:
        return ClaudeAnalyst(settings.anthropic_api_key, settings.intel_model)
    return RuleAnalyst()
