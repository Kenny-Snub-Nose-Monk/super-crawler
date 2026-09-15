"""events.jsonl 的讀寫。

為什麼是 jsonl 不是 SQLite：這張表要 commit 進 git，你才能用 git diff
看到「這週多了什麼」。jsonl 一行一筆，diff 乾淨；SQLite 是 binary，
diff 完全看不懂。等資料量大到 jsonl 撐不住（>5 萬筆）再換不遲。
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator, Optional

from .normalize import TAIPEI, now_iso
from .schema import Event, EventStatus, validate

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "events.jsonl"

# collector 不該覆蓋的欄位：這些是 store 或你自己維護的。
# 沒有這道防線的話，下一次抓取會把你標的 feedback 洗掉。
_PRESERVED = ("first_seen", "feedback")


@dataclass
class UpsertStats:
    new: int = 0
    updated: int = 0
    unchanged: int = 0
    invalid: int = 0
    problems: list[str] = None

    def __post_init__(self):
        if self.problems is None:
            self.problems = []

    def __str__(self) -> str:
        return (f"新增 {self.new} / 更新 {self.updated} / "
                f"未變 {self.unchanged} / 無效 {self.invalid}")


class EventStore:
    def __init__(self, path: Path | str = DEFAULT_PATH):
        self.path = Path(path)
        self._events: dict[str, Event] = {}
        self.load()

    # --- 讀寫 ---

    def load(self) -> None:
        self._events.clear()
        if not self.path.exists():
            return
        with self.path.open(encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = Event.from_dict(json.loads(line))
                except (json.JSONDecodeError, TypeError) as e:
                    # 壞掉的一行不該讓整個檔案讀不進來
                    print(f"  ! events.jsonl 第 {lineno} 行讀取失敗，已跳過: {e}")
                    continue
                self._events[ev.uid] = ev

    def save(self) -> None:
        """原子寫入：先寫暫存檔再 rename。

        中途被 Ctrl-C 或 Actions 逾時砍掉時，不會留下半個檔案。
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # 排序讓 git diff 穩定 —— 否則每次重寫整個檔案都是一大片變更
        rows = sorted(self._events.values(),
                      key=lambda e: (e.starts_at or "9999", e.uid))
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                for ev in rows:
                    f.write(json.dumps(ev.to_dict(), ensure_ascii=False,
                                       sort_keys=True) + "\n")
            os.replace(tmp, self.path)
        except Exception:
            Path(tmp).unlink(missing_ok=True)
            raise

    # --- 寫入 ---

    def upsert_many(self, events: Iterable[Event]) -> UpsertStats:
        stats = UpsertStats()
        stamp = now_iso()
        for ev in events:
            problems = validate(ev)
            if problems:
                stats.invalid += 1
                stats.problems.append(f"{ev.source_platform}:{ev.source_id} {problems}")
                continue

            ev.content_hash = ev.compute_content_hash()
            ev.last_seen = stamp
            existing = self._events.get(ev.uid)

            if existing is None:
                ev.first_seen = stamp
                self._events[ev.uid] = ev
                stats.new += 1
                continue

            # 保住 store / 你維護的欄位，其餘用新抓到的覆蓋
            for f in _PRESERVED:
                setattr(ev, f, getattr(existing, f))
            if existing.content_hash == ev.content_hash:
                existing.last_seen = stamp   # 只更新「還看得到」的時間
                stats.unchanged += 1
            else:
                self._events[ev.uid] = ev
                stats.updated += 1
        return stats

    # --- 狀態維護 ---

    def refresh_status(self, now: Optional[datetime] = None) -> int:
        """依現在時間更新 upcoming / ongoing / expired。

        過期的活動「標記」而不刪除：之後要做回饋迴路（你去過哪些活動、
        哪類活動你都不點）需要歷史資料。刪掉就回不來了。
        手動標成 CANCELLED 的不動它。
        """
        now = now or datetime.now(TAIPEI)
        changed = 0
        for ev in self._events.values():
            if ev.status == EventStatus.CANCELLED.value:
                continue
            start = _parse(ev.starts_at)
            end = _parse(ev.ends_at) or start
            if end and end < now:
                new_status = EventStatus.EXPIRED.value
            elif start and start <= now <= (end or now):
                new_status = EventStatus.ONGOING.value
            else:
                new_status = EventStatus.UPCOMING.value
            if ev.status != new_status:
                ev.status = new_status
                changed += 1
        return changed

    # --- 查詢（skill 用的就是這幾個）---

    def all(self) -> list[Event]:
        return list(self._events.values())

    def query(self, *, types: Optional[Iterable[str]] = None,
              tags: Optional[Iterable[str]] = None,
              city: Optional[str] = None,
              exclude_keywords: Optional[Iterable[str]] = None,
              exclude_online: bool = False,
              require_venue: bool = False,
              start_after: Optional[datetime] = None,
              start_before: Optional[datetime] = None,
              signup_open: bool = False,
              exclude_feedback: Iterable[str] = ("not_my_thing",),
              statuses: Iterable[str] = (EventStatus.UPCOMING.value,
                                         EventStatus.ONGOING.value),
              ) -> list[Event]:
        """三個使用情境都是這個函式換參數。"""
        now = datetime.now(TAIPEI)
        type_set = set(types) if types else None
        tag_set = set(tags) if tags else None
        status_set = set(statuses)
        skip_fb = set(exclude_feedback or ())
        bad_words = [w.lower() for w in (exclude_keywords or ())]
        out = []
        for ev in self._events.values():
            if ev.status not in status_set:
                continue
            if ev.feedback in skip_fb:
                continue
            # 排除規則在查詢時套用，不在抓取時 —— 資料留著，改規則不用重抓
            if exclude_online and "online" in ev.tags:
                continue
            if require_venue and not (ev.address or ev.venue):
                continue
            if bad_words:
                blob = f"{ev.title} {ev.description or ''}".lower()
                if any(w in blob for w in bad_words):
                    continue
            if type_set and ev.type not in type_set:
                continue
            if tag_set and not tag_set.issubset(set(ev.tags)):
                continue
            if city and ev.city != city:
                continue
            start = _parse(ev.starts_at)
            if start_after and (start is None or start < start_after):
                continue
            if start_before and (start is None or start > start_before):
                continue
            if signup_open:
                # signup_deadline 是 None 代表「來源沒給」，不是「沒有截止日」。
                # 這種情況退而求其次用開始時間判斷，並在輸出時標注不確定。
                deadline = _parse(ev.signup_deadline) or start
                if deadline and deadline < now:
                    continue
            out.append(ev)
        return sorted(out, key=lambda e: e.starts_at or "9999")


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso)
    except ValueError:
        return None
