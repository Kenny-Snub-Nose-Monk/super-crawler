"""稅務數字（facts）與它們的原文佐證。

content/tax/facts.yaml 是人工整理的：免稅額、級距、扣繳率、申報期間……
每一筆都附 evidence —— 哪一份快照、裡面的哪一句原文。

這裡做的事只有一件：**檢查那句原文還在不在快照裡。**

  verified   每一句引述都還在 → 網站照常顯示
  drifted    快照在，但引述對不上了 → 對方改了措辭或數字，網站標「待複核」
  unchecked  沒有快照可比（來源不能抓、還沒抓過，或那一頁已不在爬取範圍）→ 網站標「未自動核對」

不從快照自動解析數字是刻意的：政府網頁的版面三不五時就改，
用正規表達式從段落裡撈「97,000」遲早會撈錯，而且撈錯不會報錯。
人工整理 + 機器核對引述，錯的時候至少會知道。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import yaml

from .collect import ROOT, SnapshotStore
from .extract import match_key

FACTS = ROOT / "content" / "tax" / "facts.yaml"


def load_facts(path: Path = FACTS) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data.get("facts") or {}


def check_fact(fid: str, fact: dict, store: SnapshotStore) -> dict[str, Any]:
    evidence = fact.get("evidence") or []
    if not evidence:
        return {"id": fid, "status": "unchecked", "detail": "沒有附 evidence", "checked_at": None}
    checked_at: Optional[str] = None
    for ev in evidence:
        sid, quote = ev.get("source"), ev.get("quote") or ""
        snap = store.read_snapshot(sid) if sid else None
        if snap is None:
            return {"id": fid, "status": "unchecked",
                    "detail": f"沒有 {sid} 的快照", "checked_at": None}
        if match_key(quote) not in match_key(snap):
            return {"id": fid, "status": "drifted",
                    "detail": f"{sid} 裡找不到引述「{quote[:30]}…」", "checked_at": None}
        row = store.index.get(sid) or {}
        if row.get("status") == "stale":
            # 快照裡雖然還有這句話，但那一頁已經不在爬取範圍 —— 不能再說「這週核對過」
            return {"id": fid, "status": "unchecked",
                    "detail": f"{sid} 這一輪沒有再抓到（stale）", "checked_at": None}
        # 多份佐證時取最舊的那次檢查 —— 核對的可信度以最弱的一環為準
        stamp = row.get("last_ok")
        if stamp and (checked_at is None or stamp < checked_at):
            checked_at = stamp
    return {"id": fid, "status": "verified", "detail": "", "checked_at": checked_at}


def check_facts(store: Optional[SnapshotStore] = None,
                facts: Optional[dict] = None) -> list[dict[str, Any]]:
    store = store or SnapshotStore()
    facts = load_facts() if facts is None else facts
    return [check_fact(fid, f, store) for fid, f in facts.items()]
