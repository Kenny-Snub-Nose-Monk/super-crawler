"""潮臺北與嚷嚷社 collector 的離線測試，樣本是 2026-09-16 的真實回傳。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.collectors.anncr import OTHER_CITY, AnncrCollector, locate_from_detail, parse_detail
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

    print("\n嚷嚷社 —— 詳情頁確認地點（Issue：Duplicated events，樣本是 2026-11-15 的真實頁面）")
    tour = parse_detail((FIX / "anncr_event_tour.html").read_text(encoding="utf-8"))
    wrong = parse_detail((FIX / "anncr_event_wrong_venue.html").read_text(encoding="utf-8"))
    tpe = parse_detail((FIX / "anncr_event_taipei.html").read_text(encoding="utf-8"))
    check("拆出演出資訊的欄位", {"場次時間", "演出地點", "內容簡介"} <= set(tour), list(tour))

    nov6 = "2026-11-06T20:00:00+08:00"
    check("巡演頁 11/06 那場：介紹文字寫高雄 → 不是雙北",
          locate_from_detail(tour, nov6)[::2] == (OTHER_CITY, "介紹文字的場次"), locate_from_detail(tour, nov6))
    check("同一頁 9/19 那場：介紹文字寫台北 → 臺北市（巡演的台北場不能一起丟掉）",
          locate_from_detail(tour, "2026-09-19T22:00:00+08:00")[0] == "臺北市")
    check("場地欄填錯成北流、介紹文字的地址是高雄 → 以介紹文字為準",
          locate_from_detail(wrong, nov6)[::2] == (OTHER_CITY, "介紹文字的地址"), locate_from_detail(wrong, nov6))
    city, addr, _ = locate_from_detail(tpe, "2026-11-07T20:00:00+08:00")
    check("一般的台北場：留下，帶回完整地址", city == "臺北市" and addr and "復興北路480號" in addr, (city, addr))

    multi = {"演出地點": "A廳 臺北市中正區中山南路21-1號、B廳 台中市西屯區惠來路二段101號", "內容簡介": "巡演開跑！"}
    check("好幾個場地分在不同縣市、介紹文字沒講 → 不知道在哪",
          locate_from_detail(multi, nov6)[0] is None, locate_from_detail(multi, nov6))
    check("詳情頁什麼都沒有 → 交回月曆判斷", locate_from_detail({}, nov6) == (None, None, "詳情頁沒有地點"))
    check("11/6 不會命中 11/16 那一行",
          locate_from_detail({"內容簡介": "高雄 11/16 加場\n台北 11/6 首演"}, nov6)[0] == "臺北市")
    check("「新北投」不會被讀成新北市（沒寫縣市 → 交回月曆判斷）",
          locate_from_detail({"內容簡介": "11/06 新北投溫泉博物館前廣場"}, nov6)[0] is None,
          locate_from_detail({"內容簡介": "11/06 新北投溫泉博物館前廣場"}, nov6))

    print("\n嚷嚷社 —— fetch() 整段：月曆說台北的，詳情頁改判")
    cal = ('<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":['
           + ",".join(json.dumps({"@type": "ListItem", "item": {"@type": "Event", "name": n, "startDate": s,
                                                                 "url": f"http://anncr.co/Event/{i}",
                                                                 "location": {"@type": "Place", "name": v}}}, ensure_ascii=False)
                      for i, n, s, v in [
                          ("EWAIAK90450", "Ellery 呈獻 THE CUT｜Fall Edition 秋季場", "2026-11-06T20:00:00", "卡米地喜劇俱樂部"),
                          ("EWAIAQ19117", "Ellery 呈獻 THE CUT｜Fall Edition 秋季場", "2026-11-06T20:00:00", "臺北流行音樂中心"),
                          ("EWABBA87269", "菜冠雙Talk", "2026-11-07T20:00:00", "卡米地喜劇俱樂部")])
           + "]}</script>")
    pages = {"https://anncr.co/calendar": cal,
             "https://anncr.co/Event/EWAIAK90450": (FIX / "anncr_event_tour.html").read_text(encoding="utf-8"),
             "https://anncr.co/Event/EWAIAQ19117": (FIX / "anncr_event_wrong_venue.html").read_text(encoding="utf-8"),
             "https://anncr.co/Event/EWABBA87269": (FIX / "anncr_event_taipei.html").read_text(encoding="utf-8")}
    ac = AnncrCollector()
    ac.delay_between_pages = 0
    ac.get_text = lambda url, **kw: pages[url]
    got = {e.source_id: e for e in ac.fetch()}
    check("兩筆 THE CUT 都不算雙北 → 不留", set(got) == {"EWABBA87269"}, sorted(got))
    tk = got.get("EWABBA87269")
    check("台北場的行政區改用詳情頁的地址（卡米地＋在中山區，不是場地表的中正區）",
          tk is not None and tk.district == "中山區" and tk.city == "臺北市", tk and (tk.city, tk.district))

    def boom(url, **kw):
        if "/Event/" in url:
            raise ConnectionError("down")
        return pages[url]
    ac2 = AnncrCollector()
    ac2.delay_between_pages = 0
    ac2.get_text = boom
    got2 = {e.source_id for e in ac2.fetch()}
    check("詳情頁抓不到 → 沿用月曆的判斷，不讓整個來源失敗", got2 == {"EWAIAK90450", "EWAIAQ19117", "EWABBA87269"}, got2)
    ac3 = AnncrCollector(check_detail=False)
    ac3.get_text = lambda url, **kw: pages[url] if url.endswith("/calendar") else (_ for _ in ()).throw(AssertionError(url))
    check("check_detail=False → 不打詳情頁", len(list(ac3.fetch())) == 3)

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
