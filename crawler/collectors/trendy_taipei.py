"""潮臺北 collector。

偵查結果（2026-09-16）：
  robots.txt  404 —— 沒有 robots.txt，依 RFC 9309 等於未設限
  第 1 層     沒有 JSON-LD
  第 2 層     ✓ 找到內部 API，ASP.NET + Vue + axios 的站
                GET /tw/Event/GetEvents?lang=tw&type=0&title=&startDate=
                回傳 {isSuccess, errorMessage, result, total}

**重要限制：潮臺北是「季節性活動品牌」，不是持續的活動行事曆。**
整個 2026 年只有 14 筆，集中在 7–9 月，偵查當下 13/14 已經結束。
留著它是為了下一季自動補上，不要期待它平常有東西。
"""

from __future__ import annotations

from typing import Iterator, Optional

from ..normalize import classify, detect_free, parse_location, strip_html, to_taipei_iso
from ..schema import Event
from .base import Collector

BASE = "https://trendy.taipei"

# 站方的分類 → 我們的 type。判不出來的交給 classify()。
CATEGORY_MAP = {
    "演唱會經濟": "music",
    "城市行動": "festival",
    "產業趨勢": "talk",
}


class TrendyTaipeiCollector(Collector):
    name = "trendy_taipei"

    def fetch(self) -> Iterator[Event]:
        payload = self.get_json(f"{BASE}/tw/Event/GetEvents",
                                params={"lang": "tw", "type": 0, "title": "", "startDate": ""})
        if isinstance(payload, dict) and payload.get("isSuccess") is False:
            raise RuntimeError(f"API 回報失敗: {payload.get('errorMessage')}")
        rows = self.unwrap(payload, "result")
        print(f"    GetEvents 回 {len(rows)} 筆")
        for row in rows:
            ev = self._to_event(row)
            if ev:
                yield ev

    def _to_event(self, row: dict) -> Optional[Event]:
        rid = str(row.get("id") or "").strip()
        title = (row.get("title") or "").strip()
        if not rid or not title:
            return None
        location = (row.get("location") or "").strip() or None
        category = (row.get("categoryName") or "").strip() or None
        content = strip_html(row.get("content"))
        city, district = parse_location(location)

        return Event(
            source_platform=self.name,
            source_id=rid,
            source_url=f"{BASE}/tw/Event/Detail?id={rid}",
            title=title,
            type=CATEGORY_MAP.get(category) or classify(title, content),
            description=content,
            organizer=(row.get("departmentName") or row.get("officeName") or None),
            tags=[f"cat:{category}"] if category else [],
            starts_at=to_taipei_iso(row.get("startDate")),
            ends_at=to_taipei_iso(row.get("endDate"), end_of_day=True),
            signup_deadline=None,
            venue=location.split("（")[0].strip() if location else None,
            address=location,
            district=district,
            city=city or "臺北市",   # 潮臺北是台北市辦的，沒解析出來就當台北
            is_free=detect_free(title, content),
        )
