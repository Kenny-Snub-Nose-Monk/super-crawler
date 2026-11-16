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

第 4 點（2026-11-15，Issue「Duplicated events」）：**月曆的場地不能直接信。**

   Ellery THE CUT 秋季巡演（台北 9/19、台中 10/10、高雄 11/06）在 anncr 上：
   - 巡演頁 EWAIAK90450 的月曆項目是「當月那場的時間」配「第一個場地」——
     11 月的項目變成「11/06 卡米地（台北）」，這個組合根本不存在；
   - 另一頁 EWAIAQ19117 的場地欄直接填錯成臺北流行音樂中心，
     但同一頁的介紹文字寫著「地址：高雄市前金區…」。
   兩筆都以「台北的活動」上了網站。

   所以月曆判成雙北的，再看一次詳情頁（見 locate_from_detail）：主辦自己寫的
   介紹文字優先，其次是 anncr 的「演出地點」欄（有完整地址），月曆的場地名最後。
   一週多 150 個左右的請求（間隔 1 秒，約 4–5 分鐘），換不把高雄的演出推薦給台北的人。
   2026-11 實測：162 筆月曆判成雙北的，詳情頁改判 11 筆不是雙北或看不出在哪
   （THE CUT 兩筆、臺中市中山堂 4 筆、分在好幾個縣市的巡演頁 5 筆），
   另外 40 多筆的行政區被地址校正（卡米地＋在中山區，不是場地表的中正區）。
"""

from __future__ import annotations

import html as html_lib
import re
from typing import Iterator, Optional

from ..jsonld import event_from_jsonld, find_events_in_itemlist
from ..normalize import parse_location
from ..schema import Event
from .base import Collector

BASE = "https://anncr.co"
DEFAULT_CITIES = ("臺北市", "新北市")

# 詳情頁的「演出資訊」是一串 <li><h3>標籤</h3><div>內容</div></li>
_FIELD_RE = re.compile(r"<h3>\s*([^<]+?)\s*</h3>\s*<div>(.*?)</div>", re.S)

# 介紹文字裡的縣市常寫簡稱（「高雄：2026/11/06」），完整縣市名交給 parse_location。
# 「新北投」是台北市北投區的地名，不是新北市。
_SHORT_CITY_RE = re.compile(
    r"(臺北|台北|新北(?!投)|桃園|臺中|台中|臺南|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|"
    r"嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|馬祖)")
_SHORT_TO_CITY = {"台北": "臺北市", "臺北": "臺北市", "新北": "新北市"}
OTHER_CITY = "其他縣市"   # 不是雙北就好，不需要知道是哪一個

_ADDRESS_LINE_RE = re.compile(r"(?:地址|演出地點|活動地點|地點|場地)\s*[:：]\s*(.+)")


def parse_detail(html: str) -> dict[str, str]:
    """詳情頁的演出資訊 → {標籤: 純文字}。同一個標籤出現兩次以第一個為準。"""
    fields: dict[str, str] = {}
    for label, body in _FIELD_RE.findall(html):
        text = re.sub(r"<br\s*/?>|</p>", "\n", body, flags=re.I)
        text = html_lib.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        fields.setdefault(label.strip(), text)
    return fields


def _city_in(text: str) -> set[str]:
    """一段文字提到的縣市（雙北照名字，其他一律算 OTHER_CITY）。"""
    found = set()
    city, _ = parse_location(text)
    if city:
        found.add(city)
    for m in _SHORT_CITY_RE.finditer(text):
        found.add(_SHORT_TO_CITY.get(m.group(1), OTHER_CITY))
    return {c if c in ("臺北市", "新北市") else OTHER_CITY for c in found}


def _date_patterns(starts_at: str) -> list[str]:
    """2026-11-06T20:00 → 介紹文字裡可能的寫法：2026/11/06、2026.11.06、11/06、11/6、11月6日 …"""
    y, m, d = starts_at[:4], starts_at[5:7], starts_at[8:10]
    mi, di = str(int(m)), str(int(d))
    return [f"{y}/{m}/{d}", f"{y}.{m}.{d}", f"{y}-{m}-{d}", f"{y}/{mi}/{di}",
            f"{m}/{d}", f"{mi}/{di}", f"{mi}月{di}日", f"{m}.{d}"]


def _session_lines(description: str, starts_at: str) -> list[str]:
    pats = _date_patterns(starts_at)
    out = []
    for line in description.splitlines():
        for p in pats:
            # 11/6 不能命中 11/16、2011/6：前後不能再接數字
            if re.search(rf"(?<![\d/.]){re.escape(p)}(?![\d])", line):
                out.append(line)
                break
    return out


def locate_from_detail(fields: dict[str, str], starts_at: Optional[str]) -> tuple[Optional[str], Optional[str], str]:
    """用詳情頁決定這一場在哪個縣市。回傳 (縣市或 None, 地址或 None, 依據)。

    依可信度由高到低，第一個「只指向一個縣市」的就採用：
      1. 介紹文字裡寫著這一場日期的那幾行（「高雄：2026/11/06（五）20:00」）
      2. 介紹文字裡的地址行（「地址：高雄市前金區…」）
      3. anncr 的「演出地點」欄：只有一個場地就用它的地址；
         好幾個場地分在不同縣市，就不知道這一場在哪 → (None, None, …)
    都沒有就回 (None, None, "詳情頁沒有地點")，呼叫端退回月曆的判斷。
    介紹文字是主辦自己寫的；「演出地點」是 anncr 整理的，THE CUT 兩頁都整理錯了。
    """
    desc = fields.get("內容簡介", "")
    venues = [v.strip() for v in fields.get("演出地點", "").split("、") if v.strip()]
    venue_cities = {c for c in (parse_location(v)[0] for v in venues) if c}

    def with_address(city: str, why: str):
        # 只有一個場地、而且跟判出來的縣市一致，才把它的完整地址帶回去
        if len(venues) == 1 and venue_cities == {city}:
            return city, venues[0], why
        return city, None, why

    if starts_at and desc:
        cities = set().union(set(), *(_city_in(l) for l in _session_lines(desc, starts_at)))
        if len(cities) == 1:
            return with_address(cities.pop(), "介紹文字的場次")

    addr_lines = [m.group(1) for m in _ADDRESS_LINE_RE.finditer(desc)]
    cities = set().union(set(), *(_city_in(l) for l in addr_lines))
    if len(cities) == 1:
        return with_address(cities.pop(), "介紹文字的地址")

    if len(venue_cities) == 1:
        return with_address(next(iter(venue_cities)), "演出地點")
    if len(venue_cities) > 1:
        return None, None, "好幾個場地、看不出這一場在哪"
    return None, None, "詳情頁沒有地點"


class AnncrCollector(Collector):
    name = "anncr"

    def __init__(self, *args, cities: tuple[str, ...] = DEFAULT_CITIES,
                 keep_unknown_venue: bool = False, check_detail: bool = True, **kw):
        super().__init__(*args, **kw)
        self.cities = cities
        # 場地查不到縣市時要不要留。預設丟掉 —— 這個來源是全台的，
        # 「不知道在哪」的東西留著只會稀釋推薦品質。
        self.keep_unknown_venue = keep_unknown_venue
        # 月曆判成雙北的，要不要再看詳情頁確認（第 4 點）
        self.check_detail = check_detail

    def fetch(self) -> Iterator[Event]:
        html = self.get_text(f"{BASE}/calendar")
        nodes = find_events_in_itemlist(html)
        print(f"    /calendar 的 ItemList 有 {len(nodes)} 筆")

        kept = wrong_city = unknown = 0
        moved: dict[str, int] = {}     # 詳情頁改判的原因 → 筆數
        detail_failed = 0
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

            # location 只有場地名，縣市靠對照表補 —— 這件事現在由
            # jsonld.event_from_jsonld 統一做了（地址優先、場地表當退路），
            # 這裡再查一次會反轉那個優先序，所以只讀結果不重算。
            city = ev.city
            wanted = city in self.cities if city else self.keep_unknown_venue

            # 月曆說在雙北的才值得多花一個請求確認；月曆說在別處的，詳情頁救回來的機會很小
            if wanted and self.check_detail:
                try:
                    self.sleep()
                    fields = parse_detail(self.get_text(url))
                except Exception as e:  # noqa: BLE001 — 詳情頁壞一頁不該讓整個來源失敗
                    detail_failed += 1
                    print(f"      ! 詳情頁失敗，沿用月曆的場地：{url}（{type(e).__name__}）")
                    fields = {}
                d_city, d_address, why = locate_from_detail(fields, ev.starts_at)
                if fields and d_city is None and why != "詳情頁沒有地點":
                    city = None
                    moved[why] = moved.get(why, 0) + 1
                elif d_city and d_city != city:
                    city = d_city
                    moved[why] = moved.get(why, 0) + 1
                if city != ev.city:
                    # 改判到別處：原本從場地表查來的行政區也不對了
                    ev.city = None if city == OTHER_CITY else city
                    ev.district = None
                if d_address and d_city == city:
                    # 「演出地點」有完整地址，比場地對照表準（同一個品牌常常有好幾個場館）
                    ev.address = d_address
                    ev.district = parse_location(d_address)[1] or ev.district

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
        if moved or detail_failed:
            reasons = "、".join(f"{k} {v}" for k, v in moved.items())
            print(f"    詳情頁改判 {sum(moved.values())} 筆（{reasons or '—'}）／詳情頁失敗 {detail_failed}")
