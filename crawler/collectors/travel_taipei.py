"""臺北旅遊網 Open API collector。

端點與欄位名稱來自官方 Swagger（https://www.travel.taipei/open-api/swagger/docs/v1）：

  /{lang}/Events/Activity   活動展演   參數 begin, end, page
  /{lang}/Events/Calendar   活動年曆   參數 categoryId, begin, end, page
  /{lang}/Events/News       最新消息   參數 begin, end, page

每頁 30 筆。begin / end 格式 yyyy-MM-dd。

注意：官方欄位名稱有兩個拼字錯誤，是他們的錯不是我們的 ——
  distric      （少一個 t，不是 district）
  co_rganizer  （應該是 co_organizer）
不要「順手修正」，那會直接讓對應失效。
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterator, Optional

from ..normalize import (classify, detect_free, detect_languages,
                         parse_location, strip_html, to_taipei_iso)
from ..schema import Event
from .base import Collector

BASE = "https://www.travel.taipei/open-api"


class TravelTaipeiCollector(Collector):
    name = "travel_taipei"

    # lang 用 zh-tw：中文標題的分類命中率遠高於英文版，
    # 英文標題另外靠 en 版補（見 options["also_english"]）。
    def __init__(self, *args, lang: str = "zh-tw", days_ahead: int = 90,
                 endpoints: tuple[str, ...] = ("Activity", "Calendar"), **kw):
        super().__init__(*args, **kw)
        self.lang = lang
        self.days_ahead = days_ahead
        self.endpoints = endpoints

    def fetch(self) -> Iterator[Event]:
        today = date.today()
        end = today + timedelta(days=self.days_ahead)
        for endpoint in self.endpoints:
            yield from self._fetch_endpoint(endpoint, today, end)

    def _fetch_endpoint(self, endpoint: str, begin: date, end: date) -> Iterator[Event]:
        seen_ids: set[str] = set()
        for page in range(1, self.max_pages + 1):
            payload = self.get_json(
                f"{BASE}/{self.lang}/Events/{endpoint}",
                params={"begin": begin.isoformat(), "end": end.isoformat(),
                        "page": page},
            )
            rows = self.unwrap(payload, "data")
            if not rows:
                break
            new_on_page = 0
            for row in rows:
                rid = str(row.get("id") or "").strip()
                if not rid or rid in seen_ids:
                    continue
                seen_ids.add(rid)
                new_on_page += 1
                ev = self._to_event(row, endpoint)
                if ev:
                    yield ev
            # 有些分頁實作在超過最後一頁時會一直回最後一頁，
            # 沒有這個防呆就會空轉到 max_pages。
            if new_on_page == 0 or len(rows) < 30:
                break
            self.sleep()

    def _to_event(self, row: dict, endpoint: str) -> Optional[Event]:
        rid = str(row.get("id") or "").strip()
        title = (row.get("title") or "").strip()
        if not rid or not title:
            return None

        description = strip_html(row.get("description"))
        address = row.get("address") or None
        # distric 是官方的拼字，不是 typo
        district = (row.get("distric") or "").strip() or None
        city, parsed_district = parse_location(address)
        ticket = strip_html(row.get("ticket"), limit=200)

        tags = [f"src:{endpoint.lower()}"]
        tags += detect_languages(title, description)
        if row.get("is_major"):
            tags.append("major")

        # 官方網址有時是空的，退回活動頁的 links 第一筆
        url = (row.get("url") or "").strip()
        if not url:
            links = row.get("links") or []
            if isinstance(links, list) and links and isinstance(links[0], dict):
                url = (links[0].get("src") or "").strip()
        if not url:
            url = f"https://www.travel.taipei/{self.lang}/event-calendar"

        return Event(
            source_platform=self.name,
            source_id=f"{endpoint.lower()}-{rid}",
            source_url=url,
            title=title,
            type=classify(title, description),
            description=description,
            organizer=(row.get("organizer") or row.get("co_rganizer") or None),
            tags=tags,
            # begin 是開始日 → 補 00:00；end 是結束日 → 補 23:59，
            # 否則當天的活動早上就被判成過期。
            starts_at=to_taipei_iso(row.get("begin")),
            ends_at=to_taipei_iso(row.get("end"), end_of_day=True),
            signup_deadline=None,   # 這個 API 不提供報名截止日
            venue=None,
            address=address,
            district=district or parsed_district,
            city=city or "臺北市",
            lat=_num(row.get("nlat")),
            lon=_num(row.get("elong")),
            is_free=detect_free(ticket, title),
            price_text=ticket,
        )


def _num(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
