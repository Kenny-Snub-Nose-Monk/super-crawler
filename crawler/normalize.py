"""共用的正規化工具：時間、分類、地點、費用。

分類規則(TYPE_RULES)是這個專案最需要你親手調的東西。
第一版一定不夠準 —— 調它，不要急著加來源。
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from .schema import EventType

TAIPEI = timezone(timedelta(hours=8))

# --- 時間 -------------------------------------------------------------

_DATE_PATTERNS = [
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d",
    "%Y.%m.%d", "%Y%m%d",
]


def to_taipei_iso(value, *, end_of_day: bool = False) -> Optional[str]:
    """把來源給的各種時間字串轉成帶 +08:00 的 ISO 8601。

    來源幾乎都給 naive 的本地時間（台灣時間），所以沒有時區資訊時
    一律當作台北時間。end_of_day=True 用在「結束日」只有日期的情況，
    否則 2026-09-13 的活動會在當天 00:00 就被判定成過期。
    """
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip().replace("Z", "+00:00")
        dt = None
        # 先試 ISO（可能已帶時區）
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            for p in _DATE_PATTERNS:
                try:
                    dt = datetime.strptime(s, p)
                    break
                except ValueError:
                    continue
        if dt is None:
            return None
        # 只有日期、沒有時間 → 視情況補 00:00 或 23:59
        if end_of_day and dt.hour == 0 and dt.minute == 0 and dt.second == 0:
            dt = dt.replace(hour=23, minute=59, second=59)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TAIPEI)
    else:
        dt = dt.astimezone(TAIPEI)
    return dt.isoformat(timespec="seconds")


def now_iso() -> str:
    return datetime.now(TAIPEI).isoformat(timespec="seconds")


# --- 分類 -------------------------------------------------------------
# 規則由上往下比對，第一個命中的就採用，所以「窄」的規則要放前面。
# 例如「英文角」要比「講座」先比中，否則會被歸成 TALK。

TYPE_RULES: list[tuple[str, list[str]]] = [
    (EventType.OUTDOOR_CHALLENGE.value, [
        "攀岩", "抱石", "攀登", "深水", "dws", "deep water",
        "溯溪", "越野", "越嶺", "trail run", "縱走", "登山", "百岳", "野營",
        "健行", "古道", "小百岳",
        "獨木舟", "sup", "衝浪", "潛水", "free dive", "自由潛水",
        "bouldering", "climbing", "hiking", "canyoning", "mountaineering",
    ]),
    (EventType.LANGUAGE_EXCHANGE.value, [
        "語言交換", "語言交流", "英文角", "英語角", "會話", "口說",
        "language exchange", "language meetup", "conversation",
        "toastmasters", "english corner", "speaking club", "polyglot",
        "日語交流", "韓語交流",
    ]),
    (EventType.MARKET.value, [
        "市集", "快閃", "跳蚤", "二手市", "農夫市", "flea", "market day",
        "bazaar", "pop-up", "popup",
    ]),
    (EventType.MUSIC.value, [
        "音樂", "演唱", "演奏", "樂團", "live house", "livehouse", "dj",
        "concert", "gig", "音樂節", "爵士", "jazz", "band", "獨立音樂",
        "acoustic", "recital",
    ]),
    (EventType.FESTIVAL.value, [
        "節慶", "廟會", "嘉年華", "燈節", "花季", "festival", "carnival",
    ]),
    (EventType.SPORTS.value, [
        "路跑", "馬拉松", "瑜伽", "yoga", "健身", "球賽", "羽球", "籃球",
        "自行車", "單車", "游泳", "運動", "marathon", "run club", "fitness",
    ]),
    (EventType.FOOD.value, [
        "品酒", "餐酒", "料理", "烘焙", "咖啡", "美食", "廚藝",
        "tasting", "brunch", "dining", "cooking class", "wine",
    ]),
    (EventType.EXHIBITION.value, [
        "展覽", "特展", "個展", "聯展", "藝術展", "攝影展", "美術",
        "常設展", "珍藏展", "巡迴展", "主題展", "文化展", "檔案展", "雙年展",
        "exhibition", "gallery", "art show", "installation",
    ]),
    (EventType.TALK.value, [
        "講座", "講堂", "沙龍", "工作坊", "研習", "課程", "讀書會", "分享會", "論壇",
        "workshop", "seminar", "talk", "lecture", "meetup", "conference",
    ]),
    (EventType.SOCIAL.value, [
        "聚會", "交流會", "networking", "social", "mixer", "happy hour",
    ]),
]


def _match(blob: str) -> str:
    for type_value, keywords in TYPE_RULES:
        if any(k in blob for k in keywords):
            return type_value
    return EventType.OTHER.value


def classify(title: Optional[str], *other_texts: Optional[str]) -> str:
    """標題優先：先只看標題，判不出來才把描述等其他文字納入。

    2026-09-12 第一次真實抓取證明描述會蓋過標題：
      「昆蟲的頭等大事特展」   描述提到食物 → 被判成 food
      「金車文藝講堂」          描述寫「走進一個展覽」→ 被判成 exhibition
      「日治時期電影娛樂文化展」描述提到音樂 → 被判成 music
    標題是主辦方對活動的命名，訊號密度遠高於發散的行銷描述。

    判不出來回 OTHER —— 不要猜。
    """
    t = _match((title or "").lower())
    if t != EventType.OTHER.value:
        return t
    return _match(" ".join(x.lower() for x in (title, *other_texts) if x))


# --- 語言標記 ---------------------------------------------------------
# 情境2 要的是「英文」的語言交流活動，光靠 type 不夠。

_LANG_HINTS = {
    "en": ["english", "英文", "英語", "esl", "ielts", "toeic"],
    "ja": ["japanese", "日文", "日語", "にほんご"],
    "ko": ["korean", "韓文", "韓語"],
    "es": ["spanish", "西班牙文", "西語"],
    "fr": ["french", "法文", "法語"],
    "zh": ["中文", "華語", "mandarin", "chinese"],
}


def detect_languages(*texts: Optional[str]) -> list[str]:
    blob = " ".join(t.lower() for t in texts if t)
    return [f"lang:{code}" for code, hints in _LANG_HINTS.items()
            if any(h in blob for h in hints)]


# --- 地點 -------------------------------------------------------------

_DISTRICT_RE = re.compile(r"([一-鿿]{2,3}區)")
_CITY_RE = re.compile(
    r"(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|"
    r"基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|"
    r"屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣)"
)
# 國名前綴。不拿掉的話「台灣桃園市中壢區」切完縣市會剩「台灣中壢區」，
# 然後 {2,3}區 會抓到「灣中壢區」。
_COUNTRY_RE = re.compile(r"(台灣|臺灣|Taiwan)", re.IGNORECASE)


def _normalize_city(name: str) -> str:
    """台/臺 統一成臺，否則同一個縣市會出現兩種寫法，過濾時會漏。"""
    return name.replace("台", "臺")


def parse_location(address: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """從地址粗略抓出 (city, district)。抓不到就回 (None, None)。"""
    if not address:
        return None, None
    city_m = _CITY_RE.search(address)
    city = _normalize_city(city_m.group(1)) if city_m else None
    # 把「所有」縣市名拿掉再找行政區。
    # 只切掉第一個不夠 —— Accupass 的真實地址長這樣：
    #   台灣台北市108臺北市萬華區成都路10巷35-37號
    # 縣市出現兩次，中間還夾郵遞區號。只切第一個會剩「108臺北市萬華區」，
    # 然後 {2,3}區 會從「市萬華區」開始匹配，抓到錯的行政區。
    rest = _CITY_RE.sub("", _COUNTRY_RE.sub("", address))
    dist_m = _DISTRICT_RE.search(rest)
    return city, (dist_m.group(1) if dist_m else None)


# --- 費用 -------------------------------------------------------------

_FREE_HINTS = ["免費", "免票", "自由入場", "free entry", "free admission", "no charge"]
_PAID_HINTS = ["票價", "售票", "元", "nt$", "ntd", "$", "費用", "報名費"]


def detect_free(*texts: Optional[str]) -> Optional[bool]:
    """三態：True 免費 / False 要錢 / None 不知道。不要把 None 當 False。"""
    blob = " ".join(t.lower() for t in texts if t)
    if not blob.strip():
        return None
    if any(h in blob for h in _FREE_HINTS):
        return True
    if any(h in blob for h in _PAID_HINTS):
        return False
    return None


def strip_html(text: Optional[str], limit: int = 500) -> Optional[str]:
    if not text:
        return None
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:limit] or None
