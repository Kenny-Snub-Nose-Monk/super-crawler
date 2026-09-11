"""活動資料的 schema —— 整個專案唯一的真實來源。

collector 可以換，skill 可以換，這個檔案不要輕易改。
改欄位時記得一併處理 data/events.jsonl 裡的既有資料（見 SCHEMA_VERSION）。
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Optional

SCHEMA_VERSION = 1
TZ_TAIPEI = "+08:00"


class EventType(str, Enum):
    """活動類型。

    刻意用固定 enum 而不是自由文字：三個使用情境都靠這個欄位過濾，
    自由文字會讓「英文語言交流」這種查詢在第三週開始默默漏東西。

    分不出來就給 OTHER。猜錯比 OTHER 糟 —— 猜錯會讓活動出現在錯的
    情境裡（你會不信任它），OTHER 只是暫時看不到（你會去翻）。
    """

    OUTDOOR_CHALLENGE = "outdoor_challenge"  # 攀岩、DWS、越野、長程健行、溯溪
    SPORTS = "sports"                        # 一般運動、球類、路跑、瑜伽
    LANGUAGE_EXCHANGE = "language_exchange"  # 語言交換、英文 conversation meetup
    MUSIC = "music"                          # 演出、live house、音樂節
    MARKET = "market"                        # 市集、快閃、跳蚤市場
    EXHIBITION = "exhibition"                # 展覽、藝文展演
    TALK = "talk"                            # 講座、工作坊、讀書會
    FOOD = "food"                            # 餐飲、品酒、料理課
    FESTIVAL = "festival"                    # 節慶、廟會
    SOCIAL = "social"                        # 一般社交聚會、networking
    OTHER = "other"


class EventStatus(str, Enum):
    UPCOMING = "upcoming"
    ONGOING = "ongoing"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class Event:
    """一筆活動。

    欄位分四組：身分、內容、時間、地點與其他。
    時間欄位一律存帶時區的 ISO 8601 字串（例如 2026-09-13T14:00:00+08:00），
    絕不存 naive datetime —— 理由見 IMPLEMENTATION.md「時間處理」。
    """

    # --- 身分 ---
    source_platform: str          # "travel_taipei" / "meetup" / "trendy_taipei"
    source_id: str                # 該平台自己的 id
    source_url: str

    # --- 內容 ---
    title: str
    type: str = EventType.OTHER.value
    title_en: Optional[str] = None
    description: Optional[str] = None
    organizer: Optional[str] = None
    tags: list[str] = field(default_factory=list)

    # --- 時間（全部 ISO 8601 +08:00）---
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    signup_deadline: Optional[str] = None   # None = 來源沒給，不代表沒有截止日

    # --- 地點 ---
    venue: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None          # 中正區 / Da'an / ...
    city: Optional[str] = None              # 臺北市 / 新北市
    lat: Optional[float] = None
    lon: Optional[float] = None

    # --- 費用 ---
    # is_free 是三態：True 免費 / False 要錢 / None 不知道。
    # 不要把 None 當成 False，「不知道」跟「要錢」是不同的過濾結果。
    is_free: Optional[bool] = None
    price_text: Optional[str] = None

    # --- 生命週期（由 store 維護，collector 不要自己填）---
    status: str = EventStatus.UPCOMING.value
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    content_hash: Optional[str] = None
    schema_version: int = SCHEMA_VERSION

    # --- 回饋迴路（由你標記，見 IMPLEMENTATION.md）---
    feedback: Optional[str] = None          # "went" / "interested" / "not_my_thing"

    @property
    def uid(self) -> str:
        """主鍵。同平台同 id 就是同一筆，跨平台不合併（理由見文件）。"""
        return f"{self.source_platform}:{self.source_id}"

    @property
    def dedup_key(self) -> str:
        """跨平台的「可能是同一場」提示，只在查詢時用來分組，不用來刪資料。"""
        norm = re.sub(r"[\s\W_]+", "", (self.title or "").lower())
        day = (self.starts_at or "")[:10]
        return f"{norm[:40]}|{day}"

    def compute_content_hash(self) -> str:
        """只 hash 會實質改變活動的欄位，避免來源加個追蹤參數就判定成『有更新』。"""
        parts = [
            self.title, self.type, self.starts_at, self.ends_at,
            self.signup_deadline, self.venue, self.price_text, self.status,
        ]
        blob = "|".join(p if p is not None else "" for p in parts)
        return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["uid"] = self.uid
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Event":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})


def validate(ev: Event) -> list[str]:
    """回傳問題清單，空 list 代表沒問題。

    刻意「回報而不丟例外」：一筆壞資料不該讓整次抓取失敗，
    但也不該安靜地混進資料表。run_collectors 會把這些印出來。
    """
    problems: list[str] = []
    if not ev.source_platform or not ev.source_id:
        problems.append("缺 source_platform 或 source_id")
    if not (ev.title or "").strip():
        problems.append("缺 title")
    if not ev.source_url:
        problems.append("缺 source_url")
    if ev.type not in {t.value for t in EventType}:
        problems.append(f"type 不在 enum 裡: {ev.type!r}")
    if ev.status not in {s.value for s in EventStatus}:
        problems.append(f"status 不在 enum 裡: {ev.status!r}")
    for f in ("starts_at", "ends_at", "signup_deadline"):
        v = getattr(ev, f)
        if v is not None and not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$", v):
            problems.append(f"{f} 不是帶時區的 ISO 8601: {v!r}")
    return problems
