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
        "溯溪", "溪降", "瀑布", "越野", "越嶺", "trail run", "縱走", "登山", "百岳", "野營",
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

# 這些「X區」不是行政區，比對時要跳過
_NOT_DISTRICT_SUFFIX = ("園區", "社區", "校區", "廠區", "營區", "展區",
                        "專區", "特區", "商區", "街區", "景區", "災區")
_NOT_DISTRICT = {"市區", "地區", "郊區", "本區", "該區", "全區"}

# 雙北的行政區是固定的 41 個。先用白名單比對，命中就是確定答案；
# 沒命中才退回通用的「X區」樣式（給其他縣市用）。
_TAIPEI_DISTRICTS = (
    "中正區 大同區 中山區 松山區 大安區 萬華區 信義區 士林區 北投區 內湖區 南港區 文山區"
).split()
_NEW_TAIPEI_DISTRICTS = (
    "板橋區 三重區 中和區 永和區 新莊區 新店區 樹林區 鶯歌區 三峽區 淡水區 汐止區 瑞芳區 "
    "土城區 蘆洲區 五股區 泰山區 林口區 深坑區 石碇區 坪林區 三芝區 石門區 八里區 平溪區 "
    "雙溪區 貢寮區 金山區 萬里區 烏來區"
).split()
_KNOWN_DISTRICTS = tuple(_TAIPEI_DISTRICTS) + tuple(_NEW_TAIPEI_DISTRICTS)

# 英文行政區 → 中文行政區。**這是一份清單，加一行就好，不用改邏輯。**
#
# 為什麼需要它：Meetup 的地址是英文的，上面那份中文白名單一筆都吃不下，
# 所以在這張表出現之前，Meetup 的活動整批落在「未知」。
#
# 鍵值比對前會先正規化（見 _norm_en）：大小寫、空白、連字號、句點、
# 以及兩種引號都會被拿掉。所以 "Da’an" / "Da'an" / "Daan" / "Da An" 寫一個就夠。
EN_DISTRICTS: dict[str, str] = {
    # 臺北市
    "Zhongzheng": "中正區", "Datong": "大同區", "Zhongshan": "中山區",
    "Songshan": "松山區", "Daan": "大安區", "Wanhua": "萬華區",
    "Xinyi": "信義區", "Shilin": "士林區", "Beitou": "北投區",
    "Neihu": "內湖區", "Nangang": "南港區", "Wenshan": "文山區",
    # 新北市
    "Banqiao": "板橋區", "Sanchong": "三重區", "Zhonghe": "中和區",
    "Yonghe": "永和區", "Xinzhuang": "新莊區", "Xindian": "新店區",
    "Shulin": "樹林區", "Yingge": "鶯歌區", "Sanxia": "三峽區",
    "Tamsui": "淡水區", "Danshui": "淡水區", "Xizhi": "汐止區",
    "Ruifang": "瑞芳區", "Tucheng": "土城區", "Luzhou": "蘆洲區",
    "Wugu": "五股區", "Taishan": "泰山區", "Linkou": "林口區",
    "Shenkeng": "深坑區", "Shiding": "石碇區", "Pinglin": "坪林區",
    "Sanzhi": "三芝區", "Shimen": "石門區", "Bali": "八里區",
    "Pingxi": "平溪區", "Shuangxi": "雙溪區", "Gongliao": "貢寮區",
    "Jinshan": "金山區", "Wanli": "萬里區", "Wulai": "烏來區",
}

# 名字與名字之間允許出現的雜訊：空白、句點、連字號、底線、三種引號。
# 有了它，對照表的 "Daan" 一個寫法就能對上 "Da an" / "Da'an" / "Da’an" / "DaAn"。
_EN_SEP = r"[\s.\-_'\u2018\u2019\u02bc]*"

_EN_NOISE_RE = re.compile(r"[\s.\-_,'\u2018\u2019\u02bc]+")


def _norm_en(text: str) -> str:
    """拿掉大小寫、空白、連字號、句點與各種引號，讓對照表只需要寫一種拼法。"""
    return _EN_NOISE_RE.sub("", text).lower()


def _en_district_re(name: str) -> re.Pattern:
    """<行政區名> + District/Dist 的比對式。

    **一定要有 District/Dist 這個字，而且它後面不能再接字母。** 兩個限制缺一不可：

      少了「一定要有」：地址裡的 "Da An Park"、"DaAn SiLin Park" 是公園名，
      會被當成大安區。地標名推行政區就是在猜。

      少了「後面不能接字母」："Xinyi Distillery Bar, Hsinchu" 會被判成臺北市信義區，
      "Banqiao Distribution Hub, Taoyuan" 會被判成新北市板橋區 —— 兩個都在別的縣市。
      （這是 code review 抓到的，不是假想案例。）

    猜錯比未知糟，見 IMPLEMENTATION.md §6。
    """
    body = _EN_SEP.join(re.escape(ch) for ch in name)
    return re.compile(rf"(?<![A-Za-z]){body}{_EN_SEP}Dist(?:rict)?\b",
                      re.IGNORECASE)


_EN_DISTRICT_RES: dict[re.Pattern, str] = {}   # 延後到第一次用才建，見 _en_res()


def _en_res() -> dict[re.Pattern, str]:
    if not _EN_DISTRICT_RES:
        for en, zh in EN_DISTRICTS.items():
            _EN_DISTRICT_RES[_en_district_re(en)] = zh
    return _EN_DISTRICT_RES


# 這四個區名**雙北以外也有**，所以光看區名反推不出縣市：
#   中正區 中山區 信義區 → 基隆市也有      大安區 → 臺中市也有
# 對這四個要有別的佐證才敢說縣市。其餘 37 個在全台是唯一的。
_AMBIGUOUS_DISTRICTS = {"中正區", "中山區", "信義區", "大安區"}

# 中文的其他縣市。直接從 _CITY_RE 那份扣掉雙北，不另外維護一份。
_OTHER_CITY_ZH_RE = re.compile(
    r"桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|"
    r"彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣")

# 「這段文字提到雙北」的字面證據。要求 City／市 是刻意的 ——
# 光一個 Taipei 不算數："Taipei Cultural Center, Kaohsiung" 在高雄、
# "National Taipei University" 在三峽。（這也是 code review 抓到的。）
_TPE_TOKEN_RE = re.compile(r"新北市|臺北市|台北市|New\s+Taipei(\s+City)?|Taipei\s+City",
                           re.IGNORECASE)


# 其他縣市的英文名。用來偵測「這個區名雖然雙北有，但這段地址講的是別的縣市」。
#
# **一定要跟著 City/County。** 台北有很多路名就是別的縣市的名字 ——
# 信義區的「基隆路 Keelung Rd」是最常見的一條，光比 "Keelung" 會把
# 「基隆路上的信義區」誤判成「基隆市的信義區」，然後縣市整個掉成未知。
_OTHER_CITY_RE = re.compile(
    r"\b(?:Keelung|Taichung|Kaohsiung|Taoyuan|Tainan|Hsinchu|Chiayi|Miaoli|"
    r"Changhua|Nantou|Yunlin|Pingtung|Yilan|Hualien|Taitung|Penghu|Kinmen|"
    r"Lienchiang)\s+(?:City|County)\b", re.IGNORECASE)


def _city_of(district: Optional[str], evidence: str = "") -> Optional[str]:
    """行政區反推縣市。反推不出來就回 None —— 不猜。

    需要它是因為地址常常只有行政區沒有縣市（真實樣本：
    「106大安區大學里新生南路三段60巷7號」）。少了這一步，那種地址會解出
    行政區卻沒有縣市，然後被縣市過濾當成「不知道」放行。

    四個區名雙北以外也有（見 _AMBIGUOUS_DISTRICTS）。對那四個的判準是
    **「這段文字有沒有提到別的縣市」**，不是「有沒有提到雙北」：

      "Xinyi District, Keelung City"  → 提到基隆 → 不反推（否則會誤判成臺北信義區）
      "…, Da’an District, Ta"         → 沒提到任何別的縣市 → 反推臺北市

    反過來寫（要求一定要有雙北字樣）會拒絕掉大半真實資料 —— Meetup 的地址
    常常被截斷成 "…, Ta"，根本沒有完整的縣市名可以要求。

    殘留風險：地址完全沒寫縣市、而且那個區名在別的縣市也有（例如臺中的
    大安區只寫「大安區中松路1號」）會被反推成臺北市。這種地址人也分不出來，
    而且實際樣本裡沒出現過。真的踩到的話，往 _OTHER_CITY_RE 加字就好。
    """
    if district in _AMBIGUOUS_DISTRICTS:
        if _OTHER_CITY_RE.search(evidence) or _OTHER_CITY_ZH_RE.search(evidence):
            return None
    if district in _TAIPEI_DISTRICTS:
        return "臺北市"
    if district in _NEW_TAIPEI_DISTRICTS:
        return "新北市"
    return None


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
    # 雙北先查白名單 —— 命中就是確定的，不會被「文創園區」這類詞干擾
    for name in _KNOWN_DISTRICTS:
        if name in address:
            return city or _city_of(name, address), name

    rest = _CITY_RE.sub("", _COUNTRY_RE.sub("", address))
    # 其他縣市：掃過所有「X區」，跳過不是行政區的詞。
    # 真實案例：「松山文創園區 巴洛克花園（臺北市信義區光復南路）」
    # 第一個命中的是「文創園區」，正確答案是後面的「信義區」。
    for m in _DISTRICT_RE.finditer(rest):
        name = m.group(1)
        if name in _NOT_DISTRICT or any(name.endswith(w) for w in _NOT_DISTRICT_SUFFIX):
            continue
        return city or _city_of(name, address), name

    # 中文那三條都沒命中才換英文。順序不能顛倒 —— 中文地址是本地來源的
    # 常態、資訊也比較完整，英文那條是給 Meetup 這種國際平台補的。
    for rx, zh in _en_res().items():
        if rx.search(address):
            return city or _city_of(zh, address), zh

    # --- 修 3：行政區解不出來時，至少把縣市解出來 ---
    # 縣市會影響過濾（活動出不出現），行政區只影響排序，所以縣市值得多試一步。
    # 但只認 "Taipei City" / "New Taipei City" 這種帶 City 的寫法，不認裸的
    # "Taipei" —— 裸字會出現在別的縣市的地址裡（"…Taoyuan City, Taipei"）
    # 和機構名裡（"National Taipei University"）。
    if city is None:
        m = _TPE_TOKEN_RE.search(address)
        if m:
            city = "新北市" if re.match(r"新北|New", m.group(0), re.I) else "臺北市"
    return city, None


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
