"""Talent Taiwan（國發會）活動 collector。

偵查結果（2026-10-15）：
  robots.txt  User-agent: * / Disallow: 空 —— 全部允許
  第 1 層     沒有 JSON-LD（SPA，靜態抓只有 15 個字的空殼）
  第 2 層     ✓ 前端自己打的內部 API，中英文在同一包：
                GET /backend/event/events?timeRange=upcoming|past&formats[]=Online&formats[]=In-person
                回傳 {message, code, data: [ {id, title{en,zh}, contents{en,zh}, date, start_time,
                       end_time, location{en,zh}, format, fee, organiser{en,zh}, event_link, slug, past} ]}

為什麼要這個來源：網站的對象是在台工作的外國專業人士，Talent Taiwan 是政府替這群人
辦活動的單位 —— 就業金卡說明會、職涯活動，以及報稅季前的「外籍專業人士所得稅說明會」。
最後一種會被標上 topic:tax，出現在網站的稅務頁。

**限制：活動量很少，而且常常一段時間完全沒有 upcoming。** 偵查當下 upcoming 是 0 筆、
past 有 59 筆。past 也抓 —— 過期的活動會被 store 標成 expired，不會出現在預設查詢，
但網站可以據此說「上一場稅務說明會是哪一天」。
"""

from __future__ import annotations

import re
from typing import Iterator, Optional

from ..normalize import classify, detect_free, detect_languages, parse_location, strip_html, to_taipei_iso
from ..schema import Event
from .base import Collector

BASE = "https://talent.nat.gov.tw"
_TAX_RE = re.compile(r"\btax(es|ation)?\b|稅", re.IGNORECASE)
# 地點只寫城市名的居多（"Taipei"、"(Taichung)"）—— 雙北以外的實體活動不收
_OTHER_CITIES = re.compile(r"Taichung|Tainan|Kaohsiung|Hsinchu|Taoyuan|Keelung|Yilan|Hualien|Taitung|Chiayi|"
                           r"Changhua|Miaoli|Nantou|Yunlin|Pingtung|臺中|台中|臺南|台南|高雄|新竹|桃園", re.IGNORECASE)


class TalentTaiwanCollector(Collector):
    name = "talent_taiwan"

    def fetch(self) -> Iterator[Event]:
        seen = set()
        for time_range in ("upcoming", "past"):
            payload = self.get_json(f"{BASE}/backend/event/events",
                                    params={"timeRange": time_range, "formats[]": ["Online", "In-person"]})
            rows = self.unwrap(payload, "data")
            print(f"    {time_range}: {len(rows)} 筆")
            for row in rows:
                ev = self._to_event(row)
                if ev and ev.source_id not in seen:
                    seen.add(ev.source_id)
                    yield ev
            self.sleep()

    def _to_event(self, row: dict) -> Optional[Event]:
        slug = (row.get("slug") or "").strip()
        title = row.get("title") or {}
        title_en = (title.get("en") or "").strip()
        title_zh = (title.get("zh") or "").strip()
        if not slug or not (title_en or title_zh):
            return None
        location = row.get("location") or {}
        loc_en = (location.get("en") or "").strip()
        loc_zh = (location.get("zh") or "").strip()
        online = (row.get("format") or "").lower() == "online" or loc_en.lower() == "online"
        where = " ".join(x for x in (loc_en, loc_zh) if x)
        if not online and _OTHER_CITIES.search(f"{title_en} {where}"):
            return None
        city, district = parse_location(loc_zh or loc_en)
        if city is None and re.search(r"\bTaipei\b|臺北|台北", f"{title_en} {where}") and not online:
            city = "臺北市"
        contents = row.get("contents") or {}
        description = strip_html(contents.get("en") or contents.get("zh"))
        fee = (row.get("fee") or "").strip()
        date = row.get("date")
        start = to_taipei_iso(f"{date} {row.get('start_time') or '00:00:00'}") if date else None
        end = to_taipei_iso(f"{date} {row.get('end_time')}") if date and row.get("end_time") else None

        tags = ["audience:foreign-professionals"]
        if online:
            tags.append("online")
        tags += detect_languages(title_en, title_zh)
        if title_en and "lang:en" not in tags:
            tags.append("lang:en")      # Talent Taiwan 的活動以英文為主，標題本身就是英文
        if _TAX_RE.search(f"{title_en} {title_zh}"):
            tags.append("topic:tax")

        return Event(
            source_platform=self.name,
            source_id=slug,
            source_url=f"{BASE}/en/event/{slug}",
            title=title_zh or title_en,
            title_en=title_en or None,
            type=classify(title_en or title_zh, title_zh, description),
            description=description,
            organizer=((row.get("organiser") or {}).get("en") or "Talent Taiwan").strip(),
            tags=tags,
            starts_at=start,
            ends_at=end,
            venue=None if online else (loc_en or loc_zh or None),
            address=None if online else (loc_zh or None),
            district=district,
            city=city,
            is_free=True if re.fullmatch(r"free|免費", fee, re.IGNORECASE) else detect_free(fee) if fee else None,
            price_text=fee or None,
        )
