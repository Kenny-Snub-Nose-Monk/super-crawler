"""Meetup collector 的離線測試，樣本是 2026-09-22 的真實回傳。

這支測的是「取得階梯第 1 層」那條路：topic 頁自己帶的 schema.org JSON-LD。
不碰網路 —— 對方改版的時候要能先在這裡看到，而不是在每週的抓取裡默默少資料。
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.collectors.meetup import MeetupCollector, topic_url
from crawler.jsonld import find_all_events
from crawler.schema import Event, validate
from crawler.store import EventStore

FIX = Path(__file__).parent / "fixtures"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    html = (FIX / "meetup_topic.html").read_text(encoding="utf-8")

    print("第 1 層 —— 裸陣列的 Event（Meetup 不是用 ItemList 包的）")
    nodes = find_all_events(html)
    check("拆出 6 筆", len(nodes) == 6, len(nodes))

    c = MeetupCollector()
    evs = [c._to_event(n) for n in nodes]
    evs = [e for e in evs if e is not None]
    check("6 筆都轉得成 Event", len(evs) == 6, len(evs))
    # 用 id 當索引，不要用標題 —— 同一個主題頁上有兩筆都叫 "Language Exchange…"
    by = {e.source_id: e for e in evs}

    print("\n身分與必要欄位")
    a = by["316644711"]
    check("source_id 用活動數字 id", a.source_id == "316644711", a.source_id)
    check("uid 帶來源前綴", a.uid == "meetup:316644711", a.uid)
    check("source_url 是活動頁", a.source_url.endswith("/events/316644711/"), a.source_url)
    check("主辦單位有拿到", a.organizer == "實體語言交換 Language Exchange Taipei NH", a.organizer)
    check("場地有拿到", bool(a.venue), a.venue)
    for e in evs:
        check(f"必要欄位齊全 {e.source_id}",
              bool(e.title and e.starts_at and e.source_url), e.title[:20])

    print("\n時間 —— 來源給 UTC，資料表一律 +08:00")
    check("UTC 01:15 換成台北 09:15", a.starts_at == "2026-09-27T09:15:00+08:00", a.starts_at)
    check("endDate 是空字串 → ends_at 未知（不猜）",
          all(e.ends_at is None for e in evs),
          [e.ends_at for e in evs if e.ends_at])

    print("\n線上／實體 —— 依來源自己宣告的欄位判定")
    online = [e for e in evs if "online" in e.tags]
    check("正好一筆線上", len(online) == 1, len(online))
    check("線上那筆沒有場地", online[0].venue is None, online[0].venue)
    check("其餘都沒有 online 標籤", all("online" not in e.tags for e in evs if e is not online[0]))

    print("\n分類 —— 走既有規則")
    check("語言交換分類正確",
          all(e.type == "language_exchange" for e in evs),
          [(e.title[:18], e.type) for e in evs if e.type != "language_exchange"])

    print("\n地理 —— 01 只保證不誤判，行政區解析是 issue 02")
    zhongli = by["316415672"]          # 中壢的那場，tw--taipei 半徑溢出來的
    check("中壢那筆沒有被當成雙北", zhongli.city not in ("臺北市", "新北市"), zhongli.city)
    resolved = sum(1 for e in evs if e.district)
    print(f"        （目前行政區解析 {resolved}/6，issue 02 會把它拉起來）")

    # 上面那條現在是靠「解析不出來」通過的，不是靠過濾器擋下來的。
    # 過濾器本身要另外釘住，否則 issue 02 把縣市解出來的那天才會發現它壞了。
    def node_with_city(city):
        return {"@type": "Event", "name": "測試用", "url": f"{c.name}/events/999/",
                "startDate": "2026-10-01T12:00:00.000Z",
                "location": {"@type": "Place", "name": "某處",
                             "address": {"@type": "PostalAddress",
                                         "streetAddress": f"{city}信義區測試路1號"}}}
    kept = list(c.select([node_with_city("臺北市")]))
    dropped = list(c.select([node_with_city("桃園市")]))
    check("縣市過濾器：雙北留下", len(kept) == 1 and kept[0].city == "臺北市",
          [e.city for e in kept])
    check("縣市過濾器：非雙北擋掉", dropped == [] and c.dropped["非目標縣市"] >= 1,
          dict(c.dropped))

    print("\n跨主題去重 —— 同一場活動會同時出現在好幾個主題頁")
    seen = set()
    first = list(c.select(nodes, seen))
    second = list(c.select(nodes, seen))
    check("第一次全留", len(first) == 6, len(first))
    check("同一批再跑一次全部被去重", second == [], len(second))

    print("\nrobots —— collector 產生的網址只走允許的形狀")
    url = topic_url("language-exchange")
    check("topic 頁是路徑式，不帶 ?location=", "?location=" not in url and "?" not in url, url)
    check("topic 頁指向雙北的台北", "tw--taipei" in url, url)

    print("\n整條管線 —— 解析 → 寫入 → upsert → 查詢")
    for e in evs:
        check(f"schema 驗證 {e.source_id}", validate(e) == [], validate(e))
    with tempfile.TemporaryDirectory() as d:
        store = EventStore(Path(d) / "events.jsonl")
        stats = store.upsert_many(evs)
        check("第一次寫入全部是新增", stats.new == 6, stats)
        store.save()
        again = EventStore(Path(d) / "events.jsonl")
        check("存檔後讀得回來", len(again.all()) == 6, len(again.all()))
        stats2 = again.upsert_many(evs)
        check("同樣的資料再跑一次都是未變", stats2.unchanged == 6, stats2)

        # 查詢那一段：不呼叫 query() 的話，上面全部只證明了「存得進去」，
        # 沒有證明「查得出來」—— 而三個使用情境靠的就是 query()。
        got = again.query(types=["language_exchange"])
        check("查得出語言交換", len(got) == 6, len(got))
        online_id = online[0].source_id
        visible = again.query(exclude_online=True, require_venue=True)
        check("線上活動被既有排除規則擋掉",
              online_id not in {e.source_id for e in visible},
              [e.source_id for e in visible])
        check("其餘五筆查得到", len(visible) == 5, len(visible))

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
