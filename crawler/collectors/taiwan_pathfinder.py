"""Taiwan Pathfinder collector —— 戶外挑戰活動（攀岩、DWS、溪降）。

偵查結果（2026-09-16）：

  robots.txt  只有 Cloudflare 的 content-signals 註解，沒有任何實際指令
              （沒有 User-agent / Disallow，也沒設定任何 content-signal 值），
              依 RFC 9309 等於未設限。
  第 1 層     沒有 JSON-LD
  第 1.5 層   沒有框架嵌入資料（是手寫 HTML + Bootstrap，不是 Next.js）
  第 2 層     ✓ /openForBooking/ 的內嵌 script 洩漏了真正的資料源：
              一份**公開的 Google Sheet CSV**，網站自己的前端就是這樣拿的。

差點就下結論說「第 5 層，得解析 HTML」了 —— 原始 HTML 只有 11KB
且不含標題與價格。偵查做完才發現第 2 層一直都在。

這是目前最乾淨的來源，而且補上全站最缺的兩個欄位：

  價格      三段式（原價／兩個月前早鳥 9 折／一個月前早鳥 95 折）
  報名狀態  報名中／已成團／即將額滿／已截止／取消

CSV 欄位（2026-09-16 實際的標題列）：
  活動類型, 活動類型 EN, 場次日期, 原價,
  早鳥價（2個月以上前報名，9折）, 早鳥價（1–2個月前報名，95折）,
  報名表單連結, 狀態, 報名狀態標籤, 目前顯示價格（自動）, , 最終狀態（自動）
"""

from __future__ import annotations

import csv
import io
import re
from typing import Iterator, Optional

from ..normalize import classify, to_taipei_iso
from ..schema import Event, EventStatus
from .base import Collector

BASE = "https://www.taiwanpathfinder.com"
LISTING = f"{BASE}/openForBooking/"

# 網站前端自己用的網址。優先從頁面抓，抓不到才用這個 —— 這樣他們換
# 試算表時我們會自動跟上，而不是安靜地抓到舊資料。
FALLBACK_CSV_URL = ("https://docs.google.com/spreadsheets/d/"
                    "1VvRRgURxwP4ka_it5MCn96JD6XzbjKS6CGEnWYE_afU/export?format=csv&gid=0")

_CSV_URL_RE = re.compile(r"""CSV_URL\s*=\s*['"]([^'"]+)['"]""")
_PRICE_RE = re.compile(r"NT\$\s*([\d,]+)")

# 這些活動辦在哪。只填我有把握的 —— 龍洞是新北貢寮的知名攀岩區。
# 其他的留空，不要猜。你認得的地點可以自己往下加。
ACTIVITY_LOCATION: dict[str, tuple[str, Optional[str], Optional[str]]] = {
    "龍洞": ("龍洞", "新北市", "貢寮區"),
    "Longdong": ("龍洞", "新北市", "貢寮區"),
}

# 報名狀態標籤 → 我們的 status。「取消」是唯一會改 status 的，
# 其餘交給 store.refresh_status() 依日期判斷。
_CANCELLED = {"取消", "已取消", "cancelled"}


class TaiwanPathfinderCollector(Collector):
    name = "taiwan_pathfinder"

    def csv_url(self) -> str:
        """從列表頁的內嵌 script 抓出 CSV 網址。"""
        try:
            html = self.get_text(LISTING)
            m = _CSV_URL_RE.search(html)
            if m:
                return m.group(1)
            print("    ! 頁面裡找不到 CSV_URL，改用寫死的網址")
        except Exception as e:  # noqa: BLE001
            print(f"    ! 讀不到列表頁（{type(e).__name__}），改用寫死的網址")
        return FALLBACK_CSV_URL

    def probe(self) -> str:
        return self.get_text(self.csv_url())[:4000]

    def fetch(self) -> Iterator[Event]:
        url = self.csv_url()
        text = self.get_text(url)
        yield from self.parse_csv(text)

    def parse_csv(self, text: str) -> Iterator[Event]:
        rows = list(csv.DictReader(io.StringIO(text)))
        if not rows:
            print("    ! CSV 沒有資料列")
            return
        # 欄位錯位偵測：價格欄含逗號，若來源沒有加引號會整排位移。
        # 與其安靜地產生垃圾，不如大聲講出來。
        extra = [k for k in rows[0] if k is None]
        if extra:
            print("    ! CSV 欄位數對不上（價格欄的逗號可能沒被引號包住），"
                  "請用 --probe taiwan_pathfinder 看原始內容")
        print(f"    CSV {len(rows)} 列")

        for row in rows:
            ev = self._to_event({(k or "").strip(): (v or "").strip()
                                 for k, v in row.items() if k})
            if ev:
                yield ev

    def _to_event(self, row: dict) -> Optional[Event]:
        name_zh = row.get("活動類型") or ""
        name_en = row.get("活動類型 EN") or ""
        date = row.get("場次日期") or ""
        title = name_zh or name_en
        if not title or not date:
            return None

        starts = to_taipei_iso(date)
        if not starts:
            return None

        link = row.get("報名表單連結") or LISTING
        # 同一種活動一年辦很多場，所以 id 要是「活動＋日期」
        source_id = f"{re.sub(r'[^A-Za-z0-9]+', '', name_en) or 'event'}-{date}"

        price_text = (row.get("目前顯示價格（自動）") or row.get("原價") or "").strip() or None
        early_2m = row.get("早鳥價（2個月以上前報名，9折）")
        early_1m = row.get("早鳥價（1–2個月前報名，95折）")

        signup_tag = (row.get("報名狀態標籤") or "").strip()
        state = (row.get("狀態") or "").strip()
        final = (row.get("最終狀態（自動）") or "").strip()

        tags = ["src:openForBooking"]
        if signup_tag:
            tags.append(f"signup:{signup_tag}")
        if final:
            tags.append(f"final:{final}")
        for label, value in (("early2m", early_2m), ("early1m", early_1m)):
            if value:
                tags.append(f"{label}:{value}")

        venue = city = district = None
        for key, (v, c, d) in ACTIVITY_LOCATION.items():
            if key in name_zh or key in name_en:
                venue, city, district = v, c, d
                break

        status = (EventStatus.CANCELLED.value
                  if state in _CANCELLED or final in _CANCELLED
                  else EventStatus.UPCOMING.value)

        return Event(
            source_platform=self.name,
            source_id=source_id,
            source_url=link,
            title=title,
            title_en=name_en or None,
            type=classify(title, name_en),
            description=None,
            organizer="Taiwan Pathfinder 台灣引路人",
            tags=tags,
            starts_at=starts,
            ends_at=to_taipei_iso(date, end_of_day=True),
            signup_deadline=None,   # CSV 沒有明確的截止日，只有狀態標籤
            venue=venue,
            city=city,
            district=district,
            is_free=_is_free(price_text),
            price_text=price_text,
            status=status,
        )


def _is_free(price_text: Optional[str]) -> Optional[bool]:
    if not price_text:
        return None
    m = _PRICE_RE.search(price_text)
    if not m:
        return None
    return int(m.group(1).replace(",", "")) == 0
