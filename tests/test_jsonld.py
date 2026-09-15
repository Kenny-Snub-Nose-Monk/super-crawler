"""JSON-LD 解析的測試，用 2026-09-15 從 Accupass 取得的真實樣本。

這支測的是「跨網站共用」的那一層 —— 下一個有 JSON-LD 的來源會直接受惠。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.jsonld import event_from_jsonld, find_event
from crawler.schema import validate

FIXTURE = Path(__file__).parent / "fixtures" / "accupass_event.html"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    html = FIXTURE.read_text(encoding="utf-8")
    node = find_event(html)
    check("找得到 Event 節點", node is not None)

    ev = event_from_jsonld(node, source_platform="accupass",
                           source_id="2601141826081482281011",
                           source_url="https://www.accupass.com/event/2601141826081482281011",
                           extra_tags=["kw:語言交換"])
    print()
    for f in ("title", "type", "starts_at", "ends_at", "venue", "city",
              "district", "organizer", "is_free", "status", "tags"):
        print(f"    {f:14} {getattr(ev, f)}")
    print()

    check("分類是語言交換", ev.type == "language_exchange", ev.type)
    check("開始時間帶時區", ev.starts_at == "2026-01-16T20:00:00+08:00", ev.starts_at)
    check("結束時間正確", ev.ends_at == "2026-01-16T23:00:00+08:00", ev.ends_at)
    check("場地名有抓到", ev.venue == "紅樓旁邊", ev.venue)
    check("縣市解析正確", ev.city == "臺北市", ev.city)
    check("行政區解析正確", ev.district == "萬華區", ev.district)
    check("主辦單位有抓到", ev.organizer and "台北國際交流會" in ev.organizer, ev.organizer)
    check("標到英文", "lang:en" in ev.tags, ev.tags)
    check("關鍵字標籤有帶", "kw:語言交換" in ev.tags, ev.tags)
    check("沒有 offers → is_free 是 None(未知) 不是 False",
          ev.is_free is None, repr(ev.is_free))
    check("status 對應正確", ev.status == "upcoming", ev.status)
    check("schema 驗證通過", validate(ev) == [], validate(ev))

    print("\n沒有 Event 的頁面應該安全地回 None")
    check("空 HTML", find_event("<html></html>") is None)
    check("壞掉的 JSON-LD 不會炸",
          find_event('<script type="application/ld+json">{壞掉</script>') is None)
    check("非 Event 的 JSON-LD 會跳過",
          find_event('<script type="application/ld+json">'
                     '{"@type":"Organization","name":"x"}</script>') is None)

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
