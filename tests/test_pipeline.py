"""離線端對端測試：不需要網路，用錄下來的樣本跑完整條管線。

跑法： python3 tests/test_pipeline.py
"""
import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.collectors.travel_taipei import TravelTaipeiCollector
from crawler.normalize import TAIPEI
from crawler.schema import Event
from crawler.store import EventStore

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture_events():
    c = TravelTaipeiCollector()
    raw = json.loads((FIXTURES / "travel_taipei_activity.json").read_text(encoding="utf-8"))
    return [e for e in (c._to_event(r, "Activity") for r in c.unwrap(raw, "data")) if e]


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    events = load_fixture_events()
    print("1. 對應")
    check("兩筆都轉出來", len(events) == 2, f"got {len(events)}")
    check("音樂節分類正確", events[0].type == "music", events[0].type)
    check("英文角分類正確", events[1].type == "language_exchange", events[1].type)
    check("英文標記正確", "lang:en" in events[1].tags, str(events[1].tags))
    check("結束日補到 23:59", events[0].ends_at.endswith("23:59:59+08:00"), events[0].ends_at)
    check("空 url 有 fallback", events[1].source_url.startswith("https://x/"), events[1].source_url)
    check("免費判斷正確", events[0].is_free is True and events[1].is_free is False)

    print("2. 寫入與 upsert")
    tmp = Path(tempfile.mkdtemp()) / "events.jsonl"
    store = EventStore(tmp)
    s1 = store.upsert_many(load_fixture_events())
    store.save()
    check("第一次全新增", s1.new == 2 and s1.invalid == 0, str(s1))

    store2 = EventStore(tmp)
    check("存檔後讀得回來", len(store2.all()) == 2)
    s2 = store2.upsert_many(load_fixture_events())
    check("重跑不重複", s2.new == 0 and s2.unchanged == 2, str(s2))

    print("3. 使用者標記不會被洗掉")
    store2._events["travel_taipei:activity-12345"].feedback = "went"
    store2.save()
    store3 = EventStore(tmp)
    store3.upsert_many(load_fixture_events())
    check("feedback 保住", store3._events["travel_taipei:activity-12345"].feedback == "went")
    check("first_seen 保住", store3._events["travel_taipei:activity-12345"].first_seen is not None)

    print("4. 三個情境的查詢")
    now = datetime.now(TAIPEI)
    # 把樣本時間搬到未來，才測得到 upcoming 過濾
    for i, ev in enumerate(store3.all()):
        ev.starts_at = (now + timedelta(days=3 + i)).isoformat(timespec="seconds")
        ev.ends_at = (now + timedelta(days=3 + i, hours=3)).isoformat(timespec="seconds")
    store3.refresh_status()

    lang = store3.query(types=["language_exchange"], tags=["lang:en"], signup_open=True)
    check("情境2 拿到英文交流", len(lang) == 1 and lang[0].type == "language_exchange", str([e.title for e in lang]))
    chill = store3.query(types=["music", "market", "exhibition", "food"])
    check("情境3 拿到 chill", len(chill) == 1, str([e.title for e in chill]))
    challenge = store3.query(types=["outdoor_challenge"])
    check("情境1 樣本裡沒有戶外，回空", challenge == [])

    print("5. 標記過 not_my_thing 就不再出現")
    lang[0].feedback = "not_my_thing"
    check("已排除", store3.query(types=["language_exchange"]) == [])

    print("6. 排除規則（用 2026-09-15 真實資料裡的雜訊標題）")
    noise = EventStore(Path(tempfile.mkdtemp()) / "n.jsonl")
    future = (now + timedelta(days=5)).isoformat(timespec="seconds")
    mk2 = lambda i, title, **kw: Event(
        source_platform="accupass", source_id=str(i), source_url="http://x",
        title=title, type=kw.pop("type", "language_exchange"),
        starts_at=future, **kw)
    noise.upsert_many([
        mk2(1, "英文線上課程免費體驗－零基礎怎麼學英文？菁英生活英文課程",
            tags=["online"], venue=None, address=None),
        mk2(2, "職場英文會話技巧：菁英商用英文會話課程免費體驗",
            venue=None, address=None),
        mk2(3, "圓山花博市集招商 - 好享市集", type="market",
            venue="花博公園", address="臺北市中山區"),
        mk2(4, "Galaxy 國際英語演講會 Toastmasters",
            venue="犇亞會議中心", address="臺北市中山區復興北路99號"),
        mk2(5, "週五小酌英文夜 Toastmasters", venue="Fly Bar",
            address="臺北市萬華區成都路10巷"),
    ])
    noise.refresh_status()
    cfg = dict(exclude_online=True, require_venue=True,
               exclude_keywords=["線上課程", "免費體驗", "招商"])
    kept = [e.source_id for e in noise.query(**cfg)]
    check("線上活動被排除（有 online 標籤）", "1" not in kept, kept)
    check("沒有地址的被排除", "2" not in kept, kept)
    check("招商被關鍵字排除", "3" not in kept, kept)
    check("真的 Toastmasters 留下來", {"4", "5"} <= set(kept), kept)
    check("五筆剩兩筆", len(kept) == 2, len(kept))
    check("不開排除時五筆都在", len(noise.query()) == 5)

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
