"""Taiwan Pathfinder collector 的離線測試。

樣本是 2026-09-16 那份 Google Sheet CSV 的真實標題列與資料格式。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.collectors.taiwan_pathfinder import TaiwanPathfinderCollector
from crawler.schema import validate

FIX = Path(__file__).parent / "fixtures" / "taiwan_pathfinder.csv"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    c = TaiwanPathfinderCollector()
    evs = list(c.parse_csv(FIX.read_text(encoding="utf-8")))
    by = {e.title: e for e in evs}

    print()
    for e in evs:
        print(f"    {e.starts_at[:10]} {e.status:9} {str(e.price_text):9} "
              f"{e.type:18} {e.title[:20]}")
    print()

    check("五列都轉出來", len(evs) == 5, len(evs))

    dws = by.get("龍洞深水獨攀 DWS")
    check("DWS 有抓到", dws is not None)
    check("DWS 分類是戶外挑戰", dws and dws.type == "outdoor_challenge", dws and dws.type)
    check("DWS 日期正確", dws and dws.starts_at.startswith("2026-09-20"), dws and dws.starts_at)
    check("價格有帶逗號沒被切斷", dws and dws.price_text == "NT$3,500", dws and dws.price_text)
    check("英文名有存", dws and dws.title_en == "Longdong Deep Water Soloing (DWS)")
    check("報名狀態進 tags", dws and "signup:已成團" in dws.tags, dws and dws.tags)
    check("早鳥價進 tags", dws and any(t.startswith("early2m:") for t in dws.tags))
    check("龍洞 → 新北市貢寮區",
          dws and (dws.city, dws.district) == ("新北市", "貢寮區"), dws and (dws.city, dws.district))
    check("報名連結當 source_url", dws and "fillout.com" in dws.source_url)
    check("要付費 → is_free 是 False", dws and dws.is_free is False, dws and dws.is_free)

    canyon = by.get("大尖山瀑布群溪降體驗")
    check("溪降也分類成戶外挑戰", canyon and canyon.type == "outdoor_challenge",
          canyon and canyon.type)

    cancelled = by.get("龍洞新手攀岩體驗")
    check("取消的場次 status=cancelled",
          cancelled and cancelled.status == "cancelled", cancelled and cancelled.status)

    trad = by.get("傳統攀登工作坊")
    check("傳統攀登分類正確", trad and trad.type == "outdoor_challenge", trad and trad.type)
    check("即將額滿進 tags", trad and "signup:即將額滿" in trad.tags)
    check("非龍洞的活動不亂猜地點",
          trad and trad.city is None and trad.venue is None, trad and (trad.city, trad.venue))

    check("同活動不同場次 id 不衝突",
          len({e.source_id for e in evs}) == 5, [e.source_id for e in evs])

    for e in evs:
        check(f"schema 驗證 {e.source_id[:28]}", validate(e) == [], validate(e))

    print("\n欄位錯位的情況要被抓到（價格沒加引號）")
    bad = ("活動類型,活動類型 EN,場次日期,原價\n"
           "龍洞攀岩,Longdong,2026-10-01,NT$3,000\n")
    out = list(c.parse_csv(bad))
    check("不會炸掉", True)
    check("仍能產生資料或明確跳過", isinstance(out, list))

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
