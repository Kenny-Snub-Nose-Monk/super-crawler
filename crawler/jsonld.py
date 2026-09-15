"""schema.org Event 的 JSON-LD 解析 —— 跨網站共用。

這是取得階梯第 1 層的收穫：欄位名由 schema.org 定義，不是各家自創，
所以這支解析器對「任何有 JSON-LD 的網站」都適用。
下一個來源如果也有 JSON-LD，collector 只需要處理「怎麼找到活動網址」，
解析完全不用重寫。
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterator, Optional

from .normalize import (classify, detect_free, detect_languages,
                        parse_location, strip_html, to_taipei_iso)
from .schema import Event, EventStatus

_LD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)

# schema.org 的 eventStatus → 我們的 status
_STATUS_MAP = {
    "EventScheduled": EventStatus.UPCOMING.value,
    "EventCancelled": EventStatus.CANCELLED.value,
    "EventPostponed": EventStatus.CANCELLED.value,
    "EventRescheduled": EventStatus.UPCOMING.value,
    "EventMovedOnline": EventStatus.UPCOMING.value,
}


def iter_jsonld(html: str) -> Iterator[dict]:
    """把 HTML 裡所有 <script type="application/ld+json"> 拆出來。

    一頁可能有多個區塊，也可能是 @graph 包起來的陣列 —— 都攤平。
    某個區塊 JSON 壞掉不影響其他區塊。
    """
    for raw in _LD_RE.findall(html):
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            continue
        for node in _flatten(data):
            if isinstance(node, dict):
                yield node


def _flatten(data: Any) -> Iterator[Any]:
    if isinstance(data, list):
        for x in data:
            yield from _flatten(x)
    elif isinstance(data, dict):
        yield data
        if "@graph" in data:
            yield from _flatten(data["@graph"])


def find_event(html: str) -> Optional[dict]:
    """找出頁面裡的 Event 節點。@type 可能是字串或陣列。"""
    for node in iter_jsonld(html):
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if any(isinstance(x, str) and x.endswith("Event") for x in types if x):
            return node
    return None


def _text(value: Any) -> Optional[str]:
    """schema.org 的欄位可能是字串，也可能是 {"@type":..., "name":...}。"""
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("name", "text", "@id"):
            v = value.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    if isinstance(value, list) and value:
        return _text(value[0])
    return None


def _offer_price(node: dict) -> tuple[Optional[bool], Optional[str]]:
    """offers 可能是物件或陣列。回 (is_free, price_text)。

    沒有 offers 時回 (None, None) —— 「不知道」，不是「免費」。
    """
    offers = node.get("offers")
    if not offers:
        return None, None
    items = offers if isinstance(offers, list) else [offers]
    prices = []
    for o in items:
        if not isinstance(o, dict):
            continue
        p = o.get("price", o.get("lowPrice"))
        if p not in (None, ""):
            try:
                prices.append(float(p))
            except (TypeError, ValueError):
                pass
    if not prices:
        return None, None
    lo, hi = min(prices), max(prices)
    cur = _text(items[0].get("priceCurrency")) or "TWD"
    text = f"{cur} {lo:g}" if lo == hi else f"{cur} {lo:g}–{hi:g}"
    return (lo == 0), text


def event_from_jsonld(node: dict, *, source_platform: str, source_id: str,
                      source_url: str, extra_tags: Optional[list[str]] = None,
                      default_city: Optional[str] = None) -> Optional[Event]:
    """把一個 schema.org Event 節點轉成我們的 Event。"""
    title = _text(node.get("name"))
    if not title:
        return None

    description = strip_html(_text(node.get("description")))
    location = node.get("location") or {}
    if not isinstance(location, dict):
        location = {}
    venue = _text(location.get("name"))
    address = _text(location.get("address"))
    city, district = parse_location(address)

    is_free, price_text = _offer_price(node)
    if is_free is None:
        # JSON-LD 沒給票價時，退而看文字裡有沒有明講免費
        is_free = detect_free(title, description)

    status_raw = (_text(node.get("eventStatus")) or "").split("/")[-1]

    tags = list(extra_tags or [])
    tags += detect_languages(title, description)
    if (_text(node.get("eventAttendanceMode")) or "").endswith("OnlineEventAttendanceMode"):
        tags.append("online")

    geo = location.get("geo") if isinstance(location.get("geo"), dict) else {}

    return Event(
        source_platform=source_platform,
        source_id=source_id,
        source_url=source_url,
        title=title,
        type=classify(title, description),
        description=description,
        organizer=_text(node.get("organizer")),
        tags=tags,
        starts_at=to_taipei_iso(node.get("startDate")),
        ends_at=to_taipei_iso(node.get("endDate"), end_of_day=True),
        signup_deadline=None,   # schema.org Event 標準欄位裡沒有報名截止日
        venue=venue,
        address=address,
        district=district,
        city=city or default_city,
        lat=_num(geo.get("latitude")),
        lon=_num(geo.get("longitude")),
        is_free=is_free,
        price_text=price_text,
        status=_STATUS_MAP.get(status_raw, EventStatus.UPCOMING.value),
    )


def _num(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
