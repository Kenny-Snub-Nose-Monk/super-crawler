"""Talent Taiwan collector 的離線測試。樣本是 2026-10-15 /backend/event/events 的真實回傳（刪減）。

跑法： python3 tests/test_talent_taiwan.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.collectors.talent_taiwan import TalentTaiwanCollector
from crawler.schema import validate

FIX = Path(__file__).parent / "fixtures"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    c = TalentTaiwanCollector()
    rows = c.unwrap(json.loads((FIX / "talent_taiwan_events.json").read_text(encoding="utf-8")), "data")
    check("樣本三筆", len(rows) == 3, len(rows))
    tax_row, taichung_row, online_row = rows

    print("台北的稅務說明會")
    ev = c._to_event(tax_row)
    check("有轉出來", ev is not None)
    check("中文標題當 title、英文標題放 title_en", ev.title_en and ev.title_en.startswith("Introduction to Taiwan Income Tax"), ev.title_en)
    check("標上 topic:tax —— 稅務頁會列出來", "topic:tax" in ev.tags, ev.tags)
    check("標上目標族群", "audience:foreign-professionals" in ev.tags)
    check("英文活動標 lang:en", "lang:en" in ev.tags)
    check("時間帶 +08:00", ev.starts_at and ev.starts_at.endswith("+08:00"), ev.starts_at)
    check("結束時間同一天", ev.ends_at and ev.ends_at[:10] == ev.starts_at[:10], ev.ends_at)
    check("source_url 指回 Talent Taiwan 的活動頁", ev.source_url == f"https://talent.nat.gov.tw/en/event/{tax_row['slug']}")
    check("fee 空字串 → 費用未知，不是免費", ev.is_free is None and ev.price_text is None, (ev.is_free, ev.price_text))
    check("schema 驗證", validate(ev) == [], validate(ev))

    print("\n雙北以外的實體活動不收")
    check("台中的實體說明會 → None", c._to_event(taichung_row) is None)

    print("\n線上活動")
    on = c._to_event(online_row)
    check("線上活動保留", on is not None)
    check("標 online", "online" in on.tags, on.tags)
    check("線上活動沒有場地", on.venue is None and on.address is None)
    check("schema 驗證", validate(on) == [], validate(on))

    print(f"\n{len(failures)} 個失敗" if failures else "\n全部通過")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
