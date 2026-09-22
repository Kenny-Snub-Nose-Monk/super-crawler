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


def _is_event(node: dict) -> bool:
    """@type 可能是字串也可能是陣列，而且有一堆子型別（MusicEvent、
    SocialEvent…），所以比對結尾而不是相等。"""
    t = node.get("@type")
    types = t if isinstance(t, list) else [t]
    return any(isinstance(x, str) and x.endswith("Event") for x in types if x)


def find_event(html: str) -> Optional[dict]:
    """找出頁面裡的第一個 Event 節點。用在「一頁一個活動」的詳情頁。"""
    for node in iter_jsonld(html):
        if _is_event(node):
            return node
    return None


def find_all_events(html: str) -> list[dict]:
    """把頁面裡所有 Event 節點都拿出來。

    有些站的列表頁不用 ItemList 包，直接放一個 Event 的裸陣列
    （Meetup 的主題頁就是，一個請求約 30 筆）。iter_jsonld 已經把陣列攤平了，
    這裡只負責篩。

    跟 find_events_in_itemlist 分開而不是合併，是因為兩者能給的保證不同：
    ItemList 有外層容器可以認，確定是「這一頁要列的東西」；裸陣列沒有，
    只能靠 @type 篩，所以頁面上任何一個 Event 都會被撈進來。
    """
    return [node for node in iter_jsonld(html) if _is_event(node)]


def find_events_in_itemlist(html: str) -> list[dict]:
    """把 ItemList 裡包著的 Event 全部拿出來。

    有些站不是一頁一個活動，而是在列表頁用一個 ItemList 裝一整個月的活動
    （嚷嚷社的 /calendar 就是，一次 402 筆）。這比「搜尋頁 + N 個詳情頁」
    省掉 N 個請求，是目前看過最划算的取得方式。

    itemListElement 的每個元素通常是 {"@type":"ListItem","item":{...}}，
    但也允許直接就是物件，兩種都吃。
    """
    events: list[dict] = []
    for node in iter_jsonld(html):
        if node.get("@type") != "ItemList":
            continue
        for element in node.get("itemListElement") or []:
            if not isinstance(element, dict):
                continue
            item = element.get("item") if "item" in element else element
            if not isinstance(item, dict):
                continue
            if _is_event(item):
                events.append(item)
    return events


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


def _address(value: Any) -> Optional[str]:
    """地址可能是一個字串，也可能是 schema.org 的 PostalAddress 物件。

    PostalAddress 沒有 name 欄位，所以不能直接丟給 _text() —— 那會回 None，
    然後 parse_location 拿不到東西，整批活動的縣市與行政區都變成未知。
    Accupass 給的是字串、Meetup 給的是物件，兩種都要吃。

    去重是因為來源常常把同一個值填兩次（真實樣本：
    "No. 32, Nanyang St, Zhongzheng District, Taipei City,, Taipei City"）。
    """
    if isinstance(value, dict):
        parts: list[str] = []
        for key in ("streetAddress", "addressLocality", "postalCode"):
            v = value.get(key)
            if not isinstance(v, str) or not v.strip():
                continue
            v = v.strip()
            # 比子字串而不是比片段：addressLocality 幾乎都已經包含在
            # streetAddress 裡面了（真實樣本 "…Zhongzheng District, Taipei
            # City,, Taipei City" 的 locality 就是 "Taipei City"）。
            # 比片段的話一個都去不掉，只會把重複再加一次。
            if any(v in p for p in parts):
                continue
            parts.append(v)
        if parts:
            return ", ".join(parts)
    return _text(value)


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
    address = _address(location.get("address"))
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
        # 表演藝術類的站常只填 performer 不填 organizer（嚷嚷社就是）
        organizer=_text(node.get("organizer")) or _text(node.get("performer")),
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
