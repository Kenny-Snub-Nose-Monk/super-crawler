"""潮臺北與嚷嚷社 collector 的離線測試，樣本是 2026-09-16 的真實回傳。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.collectors.anncr import AnncrCollector
from crawler.collectors.trendy_taipei import TrendyTaipeiCollector
from crawler.jsonld import find_events_in_itemlist
from crawler.schema import validate

FIX = Path(__file__).parent / "fixtures"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print("潮臺北 —— 內部 API（第 2 層）")
    c = TrendyTaipeiCollector()
    payload = json.loads((FIX / "trendy_taipei_getevents.json").read_text(encoding="utf-8"))
    rows = c.unwrap(payload, "result")
    check("從 result 取出兩筆", len(rows) == 2, len(rows))
    evs = [c._to_event(r) for r in rows]
    a, b = evs
    check("標題正確", a.title == "2026夏日松一下")
    check("城市行動 → festival", a.type == "festival", a.type)
    check("演唱會經濟 → music", b.type == "music", b.type)
    check("結束日補到 23:59", a.ends_at.endswith("23:59:59+08:00"), a.ends_at)
    check("行政區從 location 解析", a.district == "信義區", a.district)
    check("南港區解析正確", b.district == "南港區", b.district)
    check("場地去掉括號", a.venue == "松山文創園區 巴洛克花園、松菸口", a.venue)
    check("免費有判出來", b.is_free is True, b.is_free)
    check("source_url 正確", a.source_url.endswith("/Detail?id=32"), a.source_url)
    for e in evs:
        check(f"schema 驗證 {e.source_id}", validate(e) == [], validate(e))

    print("\n嚷嚷社 —— ItemList（第 1 層）")
    html = (FIX / "anncr_calendar.html").read_text(encoding="utf-8")
    nodes = find_events_in_itemlist(html)
    check("ItemList 拆出四筆", len(nodes) == 4, len(nodes))

    ac = AnncrCollector()
    got = list(ac.fetch.__wrapped__(ac)) if hasattr(ac.fetch, "__wrapped__") else None
    # 直接測轉換與過濾邏輯（不打網路）
    from crawler.jsonld import event_from_jsonld
    from crawler.venues import lookup
    kept = []
    for n in nodes:
        url = (n.get("url") or "").replace("http://", "https://")
        ev = event_from_jsonld(n, source_platform="anncr",
                               source_id=url.rstrip("/").split("/")[-1], source_url=url)
        city, district = lookup(ev.venue)
        ev.city, ev.district = city, district
        if city in ("臺北市", "新北市"):
            kept.append(ev)
    check("四筆過濾後剩兩筆（台中與無場地被排除）", len(kept) == 2,
          [e.venue for e in kept])
    names = {e.title for e in kept}
    check("臺北表演藝術中心留下", any("孃孃狂言" in n for n in names))
    check("國家兩廳院留下（名稱裡沒有『臺北』也要抓到）",
          any("盧易之" in n for n in names))
    tpac = [e for e in kept if "孃孃" in e.title][0]
    nthc = [e for e in kept if "盧易之" in e.title][0]
    check("北藝中心 → 士林區", tpac.district == "士林區", tpac.district)
    check("兩廳院 → 中正區", nthc.district == "中正區", nthc.district)
    check("開始時間補上時區", nthc.starts_at == "2026-09-20T19:30:00+08:00", nthc.starts_at)
    check("演出者存進 organizer", nthc.organizer == "台北愛樂", nthc.organizer)
    check("沒有 offers → is_free 是 None", nthc.is_free is None, repr(nthc.is_free))
    for e in kept:
        check(f"schema 驗證 {e.source_id}", validate(e) == [], validate(e))

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
