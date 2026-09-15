"""Accupass collector。

偵查結果（2026-09-15，用瀏覽器實測）：

  robots.txt   Allow: /，Disallow 全是交易與後台路徑（/order/ /myticket/
               /user/ /biz/... ）。/event/ 與 /search 都允許。沒有 crawl-delay。
  發現機制     GET /search?q=<關鍵字> 是 SSR，原始 HTML 就含 25 筆 /event/<id>，
               不需要跑 JS。（站方用 Next.js App Router，看得到 _rsc 與 __next_f。）
  取得機制     GET /event/<id> 頁面內有 schema.org Event 的 JSON-LD。← 階梯第 1 層
  欄位品質     startDate/endDate 帶 +08:00；venue 4/6、address 5/6 有值。
               比臺北旅遊網好太多（那邊 address 是 0/25）。

兩個已知限制：

  1. `&page=N` 無效 —— 第 1、2、3 頁回傳完全相同的 25 筆。分頁大概走 RSC
     或無限捲動。**因此改用「多組窄關鍵字」取代翻頁**，關鍵字來自
     config/interests.yaml。這反而更貼合需求：只抓你會想去的東西。
  2. `offers`（票價）在抽樣的 6 筆裡 0 筆有 —— is_free 多半會是 None(未知)。
     要拿票價得去解析頁面文字，那是第 5 層，先不做。

另外 `area=north` 過濾不可靠（會夾帶桃園、台中），所以**縣市在我們這邊自己濾**。
"""

from __future__ import annotations

import re
from typing import Iterator, Optional

from ..jsonld import event_from_jsonld, find_event
from ..schema import Event
from .base import Collector

BASE = "https://www.accupass.com"
_EVENT_ID_RE = re.compile(r"/event/(\d{10,})")

# 預設關鍵字。正式運作時由 config/interests.yaml 覆蓋。
DEFAULT_KEYWORDS = [
    "語言交換", "English", "英文會話",          # 情境2
    "攀岩", "登山", "戶外",                      # 情境1
    "市集", "live", "音樂", "講座",              # 情境3
]

# 只留這些縣市。Accupass 的 area 參數不可靠，自己濾。
DEFAULT_CITIES = ("臺北市", "新北市")


class AccupassCollector(Collector):
    name = "accupass"
    delay_between_pages = 1.0

    def __init__(self, *args, keywords: Optional[list[str]] = None,
                 cities: tuple[str, ...] = DEFAULT_CITIES,
                 max_events_per_keyword: int = 25, **kw):
        super().__init__(*args, **kw)
        self.keywords = keywords or DEFAULT_KEYWORDS
        self.cities = cities
        self.max_events_per_keyword = max_events_per_keyword

    # --- 發現 ---

    def discover(self) -> dict[str, list[str]]:
        """回傳 {event_id: [命中的關鍵字]}，跨關鍵字自動去重。"""
        found: dict[str, list[str]] = {}
        for kw in self.keywords:
            html = self.get_text(f"{BASE}/search", params={"q": kw})
            ids = list(dict.fromkeys(_EVENT_ID_RE.findall(html)))
            for eid in ids[: self.max_events_per_keyword]:
                found.setdefault(eid, []).append(kw)
            print(f"    搜尋「{kw}」→ {len(ids)} 筆")
            self.sleep()
        return found

    # --- 取得 ---

    def fetch(self) -> Iterator[Event]:
        discovered = self.discover()
        print(f"    去重後共 {len(discovered)} 個活動頁要抓")
        kept = skipped_city = no_ld = 0
        for eid, keywords in discovered.items():
            url = f"{BASE}/event/{eid}"
            html = self.get_text(url)
            node = find_event(html)
            if node is None:
                no_ld += 1
                self.sleep()
                continue
            ev = event_from_jsonld(
                node,
                source_platform=self.name,
                source_id=eid,
                source_url=url,
                extra_tags=[f"kw:{k}" for k in keywords],
            )
            self.sleep()
            if ev is None:
                continue
            # 縣市過濾：地址解析不出縣市的先留著（寧可多，不要漏）
            if ev.city and self.cities and ev.city not in self.cities:
                skipped_city += 1
                continue
            kept += 1
            yield ev
        print(f"    保留 {kept} / 非目標縣市 {skipped_city} / 沒有 JSON-LD {no_ld}")
