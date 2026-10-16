"""網站匯出的離線測試：英文標題補標、指南引用檢查、稅務參數解析、facts 全數有佐證。

跑法： python3 tests/test_site_export.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.normalize import script_language_tags
from crawler.tax.collect import SnapshotStore, load_sources
from crawler.tax.facts import load_facts
from crawler.schema import Event
from scripts.export_site_data import build_tax, load_guides, site_tags, validate


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print("1. 標題整句英文 → lang:en")
    check("Meetup 的英文標題", script_language_tags("Winding Down With Chai (Make friends over fresh cooked tea)") == ["lang:en"])
    check("中英混排不靠這條", script_language_tags("週三英文中文語言交換 Wednesday Language Exchange") == [])
    check("品牌名＋中文的標題不算", script_language_tags("EnJoin' x JECHO 活動空間") == [])
    check("太短的不算", script_language_tags("TPF Day") == [])
    check("空標題", script_language_tags(None) == [])

    print("\n1b. 有英文標題的活動也補 lang:en —— 英文友善只看這一個標籤，徽章與過濾才一致")
    ev = Event(source_platform="taiwan_pathfinder", source_id="x", source_url="https://x", title="TPF社群攀岩日",
               title_en="TPF Community Climb Day", tags=["src:openForBooking"])
    check("有 title_en → 補 lang:en", "lang:en" in site_tags(ev), site_tags(ev))
    check("原本的標籤保留", "src:openForBooking" in site_tags(ev))
    ev2 = Event(source_platform="accupass", source_id="y", source_url="https://y", title="手沖咖啡市集", tags=["lang:en"])
    check("已經有的不重複", site_tags(ev2).count("lang:en") == 1, site_tags(ev2))
    ev3 = Event(source_platform="accupass", source_id="z", source_url="https://z", title="手沖咖啡市集")
    check("中文標題、沒有英文標題 → 不補", "lang:en" not in site_tags(ev3))

    print("\n2. 稅務資料：參數全部解析成 fact，數字只在 facts.yaml 出現一次")
    store = SnapshotStore()
    tax = build_tax(store)
    years = tax["params"]["years"]
    check("2025 與 2026 兩個年度", sorted(years) == ["2025", "2026"], sorted(years))
    check("2026 免稅額 101,000，指到 exemption_2026",
          years["2026"]["exemption"]["value"] == 101000 and years["2026"]["exemption"]["fact"] == "exemption_2026")
    check("2026 基本生活費標成暫定", years["2026"]["basic_living"]["provisional"] is True)
    check("共用參數有 183 天門檻", tax["params"]["shared"]["residency_days"]["value"] == 183)
    check("級距是五段", len(years["2026"]["brackets"]["value"]) == 5)

    print("\n3. 每一筆 fact 都有佐證，而且佐證的來源在設定檔裡")
    facts = load_facts()
    configured = {s.id for s in load_sources()}
    known = configured | set(store.index)
    missing_ev = [fid for fid, f in facts.items() if not f.get("evidence")]
    check("沒有任何 fact 缺 evidence", not missing_ev, missing_ev)
    unknown_src = sorted({ev["source"] for f in facts.values() for ev in f.get("evidence", []) if ev["source"] not in known})
    check("evidence 指到的來源都存在", not unknown_src, unknown_src)
    check("label / display 都有", all(f.get("label") and f.get("display") for f in facts.values()))

    print("\n4. 指南引用檢查會擋下壞掉的引用")
    guides = load_guides()
    check("現有指南沒有壞引用", validate(guides, tax) == [], validate(guides, tax)[:3])
    broken = [{"slug": "x", "sources": ["no_such_source"], "related": ["no-such-guide"],
               "sections": [{"id": "a", "heading": "A", "blocks": [{"p": "看 {{fact:no_such_fact}} 與 [[guide:nope|這篇]]"}]}]}]
    problems = validate(guides + broken, tax)
    check("不存在的 fact 被抓到", any("no_such_fact" in p for p in problems))
    check("不存在的指南被抓到", any("nope" in p for p in problems))
    check("不存在的來源被抓到", any("no_such_source" in p for p in problems))
    check("related 指錯被抓到", any("no-such-guide" in p for p in problems))

    print("\n4b. 畫面上會出現的來源都要有英文名稱 —— 介面不中英夾雜")
    check("被引用的來源都有 title_en", all(s.get("title_en") for s in tax["sources"]
                                          if any(s["id"] in g.get("sources", []) for g in guides)))
    cited = guides[0]["sources"][0]
    unnamed = {**tax, "sources": [{**s, "title_en": None} if s["id"] == cited else s for s in tax["sources"]]}
    check("少了英文名稱會被抓到", any(cited in p and "英文名稱" in p for p in validate(guides, unnamed)))

    print("\n5. 指南：稅務指南照 PDF 建議的架構（1 篇總覽 + 5 篇深度）")
    tax_guides = [g for g in guides if g["kind"] == "tax"]
    check("六篇稅務指南", len(tax_guides) == 6, [g["slug"] for g in tax_guides])
    check("總覽排第一且標 start_here", tax_guides[0]["slug"] == "tax-in-taiwan" and tax_guides[0].get("start_here"))
    check("每篇都有出處", all(g.get("sources") for g in tax_guides))

    print(f"\n{len(failures)} 個失敗" if failures else "\n全部通過")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
