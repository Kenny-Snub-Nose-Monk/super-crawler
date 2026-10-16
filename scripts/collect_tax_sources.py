#!/usr/bin/env python3
"""稅務來源的抓取進入點。GitHub Actions 每週跟活動一起跑。

用法：
    python scripts/collect_tax_sources.py              # 全部來源
    python scripts/collect_tax_sources.py -s ntbt_special_talent   # 只跑一個（含它的子頁）
    python scripts/collect_tax_sources.py --dry-run    # 抓但不寫檔
    python scripts/collect_tax_sources.py --check      # 不抓，只檢查 facts 的引述還對不對得上快照
    python scripts/collect_tax_sources.py --prune      # 不抓，刪掉上一次完整一輪標成 stale 的頁

抓完會順便做一次 --check：快照變了、content/tax/facts.yaml 裡的引述對不上的，
會列出來。那些數字在網站上會標成「待複核」，直到有人改 facts.yaml。
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.collectors.base import make_session
from crawler.normalize import now_iso
from crawler.robots import RobotsGate
from crawler.tax.collect import SnapshotStore, TaxCollector, load_sources
from crawler.tax.facts import check_facts

MARK = {"new": "+", "changed": "Δ", "unchanged": "·", "index": "▸", "manual": "-", "stale": "⌀",
        "blocked": "✗", "disallowed": "✗", "error": "✗", "thin": "?", "empty": "?"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-s", "--source", action="append", dest="sources", help="只跑指定來源，可重複")
    ap.add_argument("--dry-run", action="store_true", help="抓取但不寫入")
    ap.add_argument("--check", action="store_true", help="不抓取，只檢查 facts 的引述")
    ap.add_argument("--prune", action="store_true", help="不抓取，刪掉上一次完整一輪標成 stale 的來源與快照")
    args = ap.parse_args()

    store = SnapshotStore()
    if args.check:
        return report_facts(store)
    if args.prune:
        gone = store.prune()
        for sid in gone:
            print(f"  - {sid}")
        if not args.dry_run:
            store.save()
        print(f"刪掉 {len(gone)} 個 stale 的來源{'（--dry-run，沒有寫入）' if args.dry_run else ''}")
        return report_facts(store)

    sources = load_sources()
    if args.sources:
        unknown = set(args.sources) - {s.id for s in sources}
        if unknown:
            print(f"未知的來源: {sorted(unknown)}")
            return 2
        sources = [s for s in sources if s.id in args.sources]

    # 政府網站的憑證鏈在 Python 3.13 的嚴格檢查下會被拒，見 base._GovCertAdapter
    session = make_session(gov_certs=True)
    collector = TaxCollector(session, RobotsGate(session=session))
    stamp = now_iso()
    print(f"[{stamp}] 稅務來源：{len(sources)} 個起點")

    queue, seen = deque(sources), set()
    counts: dict[str, int] = {}
    failed = attempted = 0
    while queue:
        src = queue.popleft()
        if src.id in seen or src.url in seen:
            continue
        seen.update((src.id, src.url))
        res = collector.fetch(src)
        outcome = store.record(src, res, stamp)
        counts[outcome] = counts.get(outcome, 0) + 1
        if src.fetch != "manual":
            attempted += 1
            failed += res.status in ("error", "blocked", "disallowed", "thin", "empty")
        indent = "    " if src.parent else "  "
        extra = f"（{res.error}）" if res.error else ""
        kids = f" → {len(res.children)} 個子頁" if res.children else ""
        print(f"{indent}{MARK.get(outcome, '?')} {src.id:42} {outcome:9}{kids}{extra}")
        queue.extend(res.children)

    summary = " / ".join(f"{k} {v}" for k, v in sorted(counts.items()))
    print(f"結果：{summary}")
    if not args.sources:
        # 完整的一輪才知道哪些頁「不見了」；只跑部分來源時沒走到的是正常的
        stale = store.mark_stale({sid for sid in seen if sid in store.index})
        for sid in stale:
            print(f"  ⌀ {sid}：這一輪沒有走到（連結不見了，或 id 換了）—— 確認後可用 --prune 刪掉")
    if args.dry_run:
        print("--dry-run：不寫入")
    else:
        store.save()
        print(f"已寫入 {store.index_path}")

    report_facts(store)
    # 跟活動那條線同一個紅綠燈規則：部分失敗是綠燈，全部失敗才紅燈
    return 1 if attempted and failed == attempted else 0


def report_facts(store: SnapshotStore) -> int:
    results = check_facts(store)
    drifted = [r for r in results if r["status"] == "drifted"]
    missing = [r for r in results if r["status"] == "unchecked"]
    print(f"facts：{len(results)} 筆，對得上 {len(results) - len(drifted) - len(missing)}，"
          f"待複核 {len(drifted)}，沒有快照可比 {len(missing)}")
    for r in drifted:
        print(f"  ⚠ {r['id']}：{r['detail']}")
    for r in missing:
        print(f"  ? {r['id']}：{r['detail']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
