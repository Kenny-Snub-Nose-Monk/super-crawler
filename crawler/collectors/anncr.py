"""嚷嚷社（anncr.co）collector —— 表演藝術行事曆。

偵查結果（2026-09-16）：
  robots.txt  User-agent: * / Disallow:（空值＝什麼都不禁），
              而且主動宣告 /sitemap/event（11,289 筆）與 /sitemap/article
  第 1 層     ✓ /calendar 頁面的 JSON-LD 是一個 ItemList，
              **一個請求就拿到當月 402 筆 Event**

這是目前性價比最高的來源：Accupass 要 1 次搜尋 + N 個詳情頁，
這裡是 1 個請求拿一整個月。

三個要注意的地方：

1. 它是**全台**的，不只台北。location 只有 {"@type":"Place","name":...}，
   沒有地址，所以縣市要靠 crawler/venues.py 的場地對照表。
   光靠字串比對「臺北」會漏掉一大票 —— 國家兩廳院一個月 26 場，
   名稱裡根本沒有「臺北」。
2. 內容偏**售票型藝文演出**（音樂 51 / 戲劇 35 / 舞蹈 3），
   跟情境3「chill」不完全重疊，但補足了我們原本很薄的表演類。
3. 換月份**不是 query 參數**（試過 date/month/ym/d 都回同一個月）。
   目前只抓當月。你一週跑一次，當月夠用。
"""

from __future__ import annotations

from typing import Iterator, Optional

from ..jsonld import event_from_jsonld, find_events_in_itemlist
from ..schema import Event
from ..venues import lookup as lookup_venue
from .base import Collector

BASE = "https://anncr.co"
DEFAULT_CITIES = ("臺北市", "新北市")


class AnncrCollector(Collector):
    name = "anncr"

    def __init__(self, *args, cities: tuple[str, ...] = DEFAULT_CITIES,
                 keep_unknown_venue: bool = False, **kw):
        super().__init__(*args, **kw)
        self.cities = cities
        # 場地查不到縣市時要不要留。預設丟掉 —— 這個來源是全台的，
        # 「不知道在哪」的東西留著只會稀釋推薦品質。
        self.keep_unknown_venue = keep_unknown_venue

    def fetch(self) -> Iterator[Event]:
        html = self.get_text(f"{BASE}/calendar")
        nodes = find_events_in_itemlist(html)
        print(f"    /calendar 的 ItemList 有 {len(nodes)} 筆")

        kept = wrong_city = unknown = 0
        for node in nodes:
            url = (node.get("url") or "").replace("http://", "https://")
            if not url:
                continue
            ev = event_from_jsonld(
                node, source_platform=self.name,
                source_id=url.rstrip("/").split("/")[-1],
                source_url=url, extra_tags=["src:calendar"],
            )
            if ev is None:
                continue

            # location 只有場地名，縣市靠對照表補
            city, district = lookup_venue(ev.venue)
            ev.city, ev.district = city, district

            if city is None:
                unknown += 1
                if not self.keep_unknown_venue:
                    continue
            elif self.cities and city not in self.cities:
                wrong_city += 1
                continue
            kept += 1
            yield ev

        print(f"    保留 {kept} / 非雙北 {wrong_city} / 場地查不到縣市 {unknown}")
