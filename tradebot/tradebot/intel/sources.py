"""Event sources: world news feeds that the analyst turns into trade theses.

All sources return `Event` objects; dedup happens in storage by id (hash of
the URL, or the title when there is no URL). Add your own source by
subclassing `Source` or by pushing JSON to POST /api/intel/ingest.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

log = logging.getLogger(__name__)

DEFAULT_RSS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",  # CNBC top news
    "https://www.cnbc.com/id/10000664/device/rss/rss.html",  # CNBC finance
    "https://oilprice.com/rss/main",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
    "https://www.investing.com/rss/news.rss",
    "https://www.interfax.ru/rss.asp",
    "https://www.rbc.ru/economics/?utm_source=rss",
]

GDELT_TERMS = [
    "tanker", "sanctions", "OPEC", "oil supply", "pipeline", "embargo", "tariff", "Federal Reserve",
    "rate hike", "rate cut", "inflation", "central bank", "bitcoin", "ethereum", "SEC crypto", "ETF approval",
    "earnings", "ceasefire", "missile", "strike", "blockade", "export ban", "default", "bailout",
]


@dataclass
class Event:
    id: str
    ts: int
    source: str
    title: str
    url: str = ""
    summary: str = ""

    @staticmethod
    def make(source: str, title: str, url: str = "", summary: str = "", ts: int | None = None) -> "Event":
        key = (url or title).strip().lower()
        return Event(id=hashlib.sha1(key.encode("utf-8")).hexdigest()[:20], ts=ts or int(time.time() * 1000),
                     source=source, title=title.strip(), url=url.strip(), summary=(summary or "").strip()[:1000])


def _parse_date(value: str | None) -> int:
    if not value:
        return int(time.time() * 1000)
    try:
        return int(parsedate_to_datetime(value).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        pass
    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return int(time.time() * 1000)


class Source:
    name = "source"

    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(timeout=20, headers={"User-Agent": "tradebot/0.1 (+intel)"}, follow_redirects=True)

    def fetch(self) -> list[Event]:  # pragma: no cover - abstract
        raise NotImplementedError

    def safe_fetch(self) -> list[Event]:
        try:
            return self.fetch()
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: fetch failed: %s", self.name, exc)
            return []


class GdeltSource(Source):
    """GDELT 2.0 DOC API: a free, global, minute-by-minute index of world news."""

    name = "gdelt"
    URL = "https://api.gdeltproject.org/api/v2/doc/doc"

    def __init__(self, terms: list[str] | None = None, timespan: str = "60min", client=None) -> None:
        super().__init__(client)
        self.terms = terms or GDELT_TERMS
        self.timespan = timespan

    def fetch(self) -> list[Event]:
        events: list[Event] = []
        # GDELT rejects very long queries; batch the terms
        for i in range(0, len(self.terms), 8):
            chunk = self.terms[i : i + 8]
            q = "(" + " OR ".join(f'"{t}"' if " " in t else t for t in chunk) + ") sourcelang:english"
            r = self.client.get(self.URL, params={"query": q, "mode": "ArtList", "maxrecords": 50, "format": "json",
                                                  "timespan": self.timespan, "sort": "DateDesc"})
            r.raise_for_status()
            if not r.text.strip():
                continue
            for a in r.json().get("articles", []):
                ts = _parse_gdelt_date(a.get("seendate"))
                events.append(Event.make("gdelt", a.get("title", ""), a.get("url", ""), f"{a.get('domain', '')} {a.get('sourcecountry', '')}", ts))
        return events


def _parse_gdelt_date(v: str | None) -> int:
    # "20260105T121500Z"
    try:
        return int(datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return int(time.time() * 1000)


class RssSource(Source):
    name = "rss"

    def __init__(self, urls: list[str] | None = None, client=None) -> None:
        super().__init__(client)
        self.urls = urls or DEFAULT_RSS

    def fetch(self) -> list[Event]:
        events: list[Event] = []
        for url in self.urls:
            try:
                r = self.client.get(url)
                r.raise_for_status()
                events += parse_feed(r.text, source=f"rss:{httpx.URL(url).host}")
            except Exception as exc:  # noqa: BLE001
                log.warning("rss %s failed: %s", url, exc)
        return events


def parse_feed(xml_text: str, source: str = "rss") -> list[Event]:
    """RSS 2.0 and Atom."""
    root = ET.fromstring(xml_text)
    events: list[Event] = []
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        events.append(Event.make(source, title, item.findtext("link") or "", _strip_html(item.findtext("description") or ""),
                                 _parse_date(item.findtext("pubDate"))))
    for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
        title = (entry.findtext("atom:title", namespaces=ns) or "").strip()
        if not title:
            continue
        link_el = entry.find("atom:link", ns)
        link = link_el.get("href", "") if link_el is not None else ""
        summary = entry.findtext("atom:summary", namespaces=ns) or entry.findtext("atom:content", namespaces=ns) or ""
        events.append(Event.make(source, title, link, _strip_html(summary),
                                 _parse_date(entry.findtext("atom:updated", namespaces=ns) or entry.findtext("atom:published", namespaces=ns))))
    return events


def _strip_html(text: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", text).replace("&nbsp;", " ").strip()


class NewsApiSource(Source):
    name = "newsapi"

    def __init__(self, api_key: str, client=None) -> None:
        super().__init__(client)
        self.api_key = api_key

    def fetch(self) -> list[Event]:
        events = []
        for cat in ("business", "general"):
            r = self.client.get("https://newsapi.org/v2/top-headlines",
                                params={"category": cat, "language": "en", "pageSize": 50, "apiKey": self.api_key})
            r.raise_for_status()
            for a in r.json().get("articles", []):
                events.append(Event.make("newsapi", a.get("title") or "", a.get("url") or "", a.get("description") or "",
                                         _parse_date(a.get("publishedAt"))))
        return events


class CustomJsonSource(Source):
    """Any HTTP endpoint that returns JSON events - plug in the tool of your choice.

    `fields` maps our names to keys in each item: {"items": "data", "title": "headline",
    "url": "link", "summary": "text", "ts": "published_at"}. `items` is the key holding
    the list (empty = the response itself is the list). Nested keys use dots.
    """

    name = "custom"

    def __init__(self, url: str, headers: dict | None = None, fields: dict | None = None, params: dict | None = None, client=None) -> None:
        super().__init__(client)
        self.url, self.headers, self.params = url, headers or {}, params or {}
        self.fields = {"items": "", "title": "title", "url": "url", "summary": "summary", "ts": "ts", **(fields or {})}

    def fetch(self) -> list[Event]:
        r = self.client.get(self.url, headers=self.headers, params=self.params)
        r.raise_for_status()
        return events_from_json(r.json(), self.fields, source="custom")


def _dig(obj, path: str):
    for part in path.split(".") if path else []:
        if isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj


def events_from_json(data, fields: dict | None = None, source: str = "custom") -> list[Event]:
    fields = {"items": "", "title": "title", "url": "url", "summary": "summary", "ts": "ts", **(fields or {})}
    items = _dig(data, fields["items"]) if fields["items"] else data
    if isinstance(items, dict):
        items = [items]
    events = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        title = _dig(it, fields["title"])
        if not title:
            continue
        ts = _dig(it, fields["ts"])
        if isinstance(ts, (int, float)):
            ts = int(ts if ts > 10**11 else ts * 1000)
        else:
            ts = _parse_date(ts) if ts else None
        events.append(Event.make(source, str(title), str(_dig(it, fields["url"]) or ""), str(_dig(it, fields["summary"]) or ""), ts))
    return events


def build_sources(settings) -> list[Source]:
    names = [n.strip() for n in settings.intel_sources.split(",") if n.strip()]
    out: list[Source] = []
    for n in names:
        if n == "gdelt":
            terms = GDELT_TERMS + [k.strip() for k in settings.intel_keywords.split(",") if k.strip()]
            out.append(GdeltSource(terms))
        elif n == "rss":
            urls = [u.strip() for u in settings.intel_rss_feeds.split(",") if u.strip()] or None
            out.append(RssSource(urls))
        elif n == "newsapi" and settings.intel_newsapi_key:
            out.append(NewsApiSource(settings.intel_newsapi_key))
        elif n == "custom" and settings.intel_custom_url:
            headers = json.loads(settings.intel_custom_headers) if settings.intel_custom_headers else {}
            out.append(CustomJsonSource(settings.intel_custom_url, headers=headers))
    return out
