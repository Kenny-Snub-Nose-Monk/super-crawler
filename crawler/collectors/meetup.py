"""Meetup collector。

偵查結果（2026-09-22，實測，用本專案自己的 parse_robots 驗過）：

  robots.txt   擋的是「搜尋」那條路：/*?location=*、/gql*、/_next/data/*、/api/。
               **主題頁、群組頁、活動頁全部允許**，而且那 30 個主題頁就列在
               Meetup 自己的 sitemap 裡 —— 是它主動希望你去抓的。
  發現機制     GET /find/tw--taipei/<topic>/ 是 SSR，原始 HTML 就含一個
               schema.org Event 的**裸陣列**（不是 ItemList），一個請求約 30 筆。
               ← 階梯第 1 層，而且一個請求就拿完，不需要再去點每一個活動頁。
  欄位品質     startDate 是 UTC（結尾 Z）；endDate 幾乎都是空字串；
               **Meetup 永遠不給 offers** —— 這邊拿不到票價，別再試了。
               address 是 PostalAddress 物件，中英混雜。

三件要先知道的事：

1. **不需要官方 API。** 「Meetup 的 GraphQL 要 OAuth」這句話本身沒錯，但跟這條
   路無關 —— 這裡一個 API 都不碰。那個誤解讓這個來源被擱置了半年，見
   docs/adr/0001-meetup-robots-whitelist.md。

2. **tw--taipei 的搜尋半徑會溢出。** 實測看得到永和（新北）甚至中壢（桃園）的
   活動。縣市在我們這邊自己濾，跟 Accupass 一樣的處理。
   ⚠️ 現階段地址解析不出行政區的活動會**全部留著**（寧可多不要漏）。
   Meetup 的地址多半是英文，既有的中文解析吃不下 —— issue 02 會補上英中對照，
   在那之前這個過濾器實際上不太會作用。

3. **結束時間、系列、報名人數要另外去群組頁拿**，見 issue 04。這支只做第一段。
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Iterable, Iterator, Optional

from ..jsonld import _LD_RE, event_from_jsonld, find_all_events
from ..schema import Event
from .base import Collector

BASE = "https://www.meetup.com"

# Meetup 自己的城市代號。它沒有「新北」的代號，新北的活動是從台北的
# 搜尋半徑溢出來的 —— 所以不用（也不能）多抓一個 tw--new-taipei。
CITY = "tw--taipei"

# 預設主題。issue 03 會改成「從情境宣告的活動類型推出來」，
# 在那之前先寫死一個，讓這條路整個跑得通。
DEFAULT_TOPICS = ("language-exchange",)

# 只留這些縣市。見上面第 2 點。
DEFAULT_CITIES = ("臺北市", "新北市")

_EVENT_ID_RE = re.compile(r"/events/(\d+)")


def topic_url(topic: str) -> str:
    """主題頁的網址。

    **這個形狀本身就是一個決定**：路徑式的 /find/<city>/<topic>/ 是 robots
    允許的，查詢式的 /find/?location=...&keywords=... 是 robots 禁止的，
    而兩者回傳的資料實測完全相同（同一批 32 筆，交集 32、差集 0）。
    所以網址在這裡集中產生，不要在別處手拼。
    """
    return f"{BASE}/find/{CITY}/{topic}/"


class MeetupCollector(Collector):
    name = "meetup"
    delay_between_pages = 1.0

    def __init__(self, *args, topics: Optional[list[str]] = None,
                 cities: tuple[str, ...] = DEFAULT_CITIES, **kw):
        super().__init__(*args, **kw)
        self.topics = list(topics or DEFAULT_TOPICS)
        self.cities = cities
        self.dropped: Counter = Counter()

    # --- 轉換（這一段刻意不碰網路，測試直接測它）---

    def _to_event(self, node: dict) -> Optional[Event]:
        """一個 schema.org Event 節點 → 一筆 Event。

        source_id 用活動的數字 id 而不是整個網址：群組改名的時候網址會變，
        數字 id 不會。用網址當 id 會讓同一場活動在改名後變成兩筆。
        """
        url = (node.get("url") or "").split("?")[0]
        m = _EVENT_ID_RE.search(url)
        if not m:
            return None
        return event_from_jsonld(
            node,
            source_platform=self.name,
            source_id=m.group(1),
            source_url=url,
        )

    # --- 取得 ---

    def select(self, nodes: Iterable[dict], seen: Optional[set[str]] = None
               ) -> Iterator[Event]:
        """把節點挑成要留下的 Event，順便記錄每一種被丟掉的理由。

        跟 fetch() 分開是刻意的：跨主題去重與縣市過濾是這支 collector 真正
        會出錯的地方，而且錯了不會爆、只會默默少資料。fetch() 要網路才跑得起來，
        這裡不用 —— 測試就能直接釘住這兩個行為（IMPLEMENTATION.md §0）。

        seen 由呼叫端傳進來，因為去重要跨主題生效，不是一頁一頁各自去重。
        """
        seen = seen if seen is not None else set()
        for node in nodes:
            self.dropped["總計"] += 1
            ev = self._to_event(node)
            if ev is None:
                self.dropped["拿不到 id"] += 1
                continue
            # 同一場活動會同時出現在好幾個主題頁（語言交換也算社交）
            if ev.uid in seen:
                self.dropped["跨主題重複"] += 1
                continue
            seen.add(ev.uid)
            # 解析不出縣市的先留著 —— 寧可多，不要漏
            if ev.city and self.cities and ev.city not in self.cities:
                self.dropped["非目標縣市"] += 1
                continue
            yield ev

    def fetch(self) -> Iterator[Event]:
        self.dropped = Counter()
        seen: set[str] = set()
        for topic in self.topics:
            nodes = find_all_events(self.get_text(topic_url(topic)))
            print(f"    {topic} → {len(nodes)} 筆")
            yield from self.select(nodes, seen)
            self.sleep()
        print("    " + " / ".join(f"{k} {v}" for k, v in self.dropped.items()))

    def probe(self) -> str:
        """回傳主題頁裡的 JSON-LD 區塊，長字串截短。

        不回整份 HTML —— 那是 600KB 的框架噪音，我們真正依賴的只有這個區塊。

        description 會截到 120 字：probe 的用途是**核對欄位名稱與結構**，
        而 Meetup 的 description 動輒好幾千字，不截的話一筆就吃掉整個輸出，
        你反而看不到有哪些欄位。
        """
        html = self.get_text(topic_url(self.topics[0]))
        nodes = find_all_events(html)
        if not nodes:
            # 解析不到就退回**第一手**的原始回應。probe 最有價值的時刻就是
            # 對方改版的時候，而那正是我們自己的解析器會回空陣列的時候 ——
            # 印一個 [] 給你看等於什麼都沒說。
            blocks = _LD_RE.findall(html)
            raw = "\n---\n".join(b.strip() for b in blocks) if blocks else html
            return (f"! find_all_events 解析不到 Event。以下是原始回應"
                    f"（{'JSON-LD 區塊' if blocks else 'HTML'}，共 {len(html)} 字）：\n\n"
                    + raw[:4000])
        return json.dumps([_shorten(n) for n in nodes[:3]],
                          ensure_ascii=False, indent=2)[:4000]


def _shorten(value, limit: int = 120):
    """遞迴把長字串截短，只為了 probe 的可讀性。"""
    if isinstance(value, str):
        return value if len(value) <= limit else value[:limit] + f"…(+{len(value) - limit})"
    if isinstance(value, dict):
        return {k: _shorten(v, limit) for k, v in value.items()}
    if isinstance(value, list):
        return [_shorten(v, limit) for v in value]
    return value
