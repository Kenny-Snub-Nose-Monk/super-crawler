#!/usr/bin/env python3
"""把 events.jsonl 匯出成網站讀的 site/data/events.json。

網站是純靜態頁，查詢在瀏覽器裡做（site/query.js），所以這裡不過濾，
整張表原樣帶過去 —— 過期的也帶，查詢時預設隱藏就好。

用法：
    python scripts/export_site_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.normalize import now_iso
from crawler.schema import EventType
from crawler.store import EventStore

OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "events.json"


def main() -> None:
    store = EventStore()
    events = [ev.to_dict() for ev in store.all()]
    payload = {
        "generated_at": now_iso(),
        "types": [t.value for t in EventType],
        "events": events,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"已匯出 {len(events)} 筆到 {OUT}")


if __name__ == "__main__":
    main()
