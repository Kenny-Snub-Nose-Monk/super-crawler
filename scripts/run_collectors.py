#!/usr/bin/env python3
"""抓取進入點。GitHub Actions 每週跑的就是這支。

用法：
    python scripts/run_collectors.py                  # 全部來源
    python scripts/run_collectors.py -s travel_taipei # 只跑一支
    python scripts/run_collectors.py --dry-run        # 抓但不寫檔
    python scripts/run_collectors.py --probe travel_taipei  # 印出原始回應
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.collectors.base import make_session
from crawler.collectors.travel_taipei import TravelTaipeiCollector
from crawler.normalize import now_iso
from crawler.store import EventStore

# 加新來源只要在這裡多一行
COLLECTORS = {
    "travel_taipei": TravelTaipeiCollector,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-s", "--source", action="append", dest="sources",
                    help="只跑指定來源，可重複")
    ap.add_argument("--dry-run", action="store_true", help="抓取但不寫入 events.jsonl")
    ap.add_argument("--probe", metavar="SOURCE",
                    help="印出該來源第一頁的原始回應，用來確認欄位名稱")
    args = ap.parse_args()

    session = make_session()

    if args.probe:
        return probe(args.probe, session)

    names = args.sources or list(COLLECTORS)
    unknown = [n for n in names if n not in COLLECTORS]
    if unknown:
        print(f"未知的來源: {unknown}，可用: {list(COLLECTORS)}")
        return 2

    store = EventStore()
    print(f"[{now_iso()}] 開始抓取，現有 {len(store.all())} 筆")

    failures = []
    for name in names:
        collector = COLLECTORS[name](session=session)
        result = collector.run()
        if result.ok:
            stats = store.upsert_many(result.events)
            print(f"  ✓ {name:16} 抓到 {len(result.events):4} 筆  {stats}  ({result.seconds}s)")
            for p in stats.problems[:5]:
                print(f"      ! {p}")
        else:
            failures.append(name)
            print(f"  ✗ {name:16} 失敗: {result.error}  ({result.seconds}s)")

    changed = store.refresh_status()
    print(f"狀態更新 {changed} 筆")

    if args.dry_run:
        print("--dry-run：不寫入")
    else:
        store.save()
        print(f"已寫入 {store.path}，共 {len(store.all())} 筆")

    # 部分來源失敗不算整體失敗 —— 有資料總比沒有好。
    # 但全部失敗要讓 Actions 紅燈，否則你不會發現它已經壞了三週。
    if failures and len(failures) == len(names):
        print("所有來源都失敗")
        return 1
    return 0


def probe(name: str, session) -> int:
    """把原始回應印出來。改版時先跑這個，再改對應。"""
    if name not in COLLECTORS:
        print(f"未知的來源: {name}")
        return 2
    c = COLLECTORS[name](session=session)
    c.max_pages = 1
    try:
        raw = c.get_json(*_probe_target(c))
    except Exception as e:
        print(f"抓取失敗: {type(e).__name__}: {e}")
        return 1
    print(json.dumps(raw, ensure_ascii=False, indent=2)[:4000])
    return 0


def _probe_target(c):
    from datetime import date, timedelta
    from crawler.collectors.travel_taipei import BASE
    today = date.today()
    return (f"{BASE}/{c.lang}/Events/Activity",
            {"begin": today.isoformat(),
             "end": (today + timedelta(days=30)).isoformat(), "page": 1})


if __name__ == "__main__":
    raise SystemExit(main())
