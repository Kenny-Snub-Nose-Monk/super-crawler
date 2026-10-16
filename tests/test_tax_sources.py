"""稅務來源（原文快照）的離線測試。

樣本是 2026-10-15 錄下來再刪減的真實頁面：臺北國稅局、財政部稅務入口網、Cloudflare 挑戰頁，
以及 Talent Taiwan 的內部 API 回傳。不碰網路。

跑法： python3 tests/test_tax_sources.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.tax.collect import (FetchResult, SnapshotStore, TaxCollector, TaxSource,
                                 talent_article_to_result, talent_faq_to_result)
from crawler.tax.extract import absolute_links, extract, find_updated, looks_blocked, match_key
from crawler.tax.facts import check_facts

FIX = Path(__file__).parent / "fixtures"


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print("1. 抽取：只要內容容器，不要導覽列與頁尾")
    html = (FIX / "tax_ntbt_page.html").read_text(encoding="utf-8")
    text, links, title, used = extract(html, [".left-content-text"])
    check("命中指定的容器", used == ".left-content-text", used)
    check("頁面 <title> 拿到了", title and title.startswith("租稅優惠簡介"), title)
    check("內文在", "半數免予計入綜合所得總額課稅" in text)
    check("導覽列不在", "重大政策" not in text)
    check("頁尾不在（省略 </p>、</li> 也沒有一路吃到頁尾）", "總局電話" not in text and "新聞稿" not in text)
    check("<script> 裡的字不在", "不該出現在快照裡" not in text)
    check("<head> 裡 script 字串中的假容器沒被當成容器", "假的" not in text)
    check("清單項目變成 - 開頭", "- 申報地點" in text, text[-80:])
    check("頁面標示的更新日期（民國）→ 西元", find_updated(text) == "2026-01-19", find_updated(text))
    full, _, _, used_none = extract(html, [".not-there"])
    check("選擇器全部失效時回報 None（呼叫端應當成改版警訊）", used_none is None)
    check("整頁文字裡會撈到頁尾的「今天」—— 所以不能整頁找日期", find_updated(full.split("115-01-19")[1]) == "2026-10-14")

    print("\n2. 連結：只跟內容區裡、符合樣式的")
    kids = absolute_links(links, "https://www.ntbt.gov.tw/htmlList/x", r"^/multiplehtml/[0-9a-f]{32}$")
    check("找到一個子頁", len(kids) == 1, kids)
    check("轉成絕對網址", kids and kids[0][0] == "https://www.ntbt.gov.tw/multiplehtml/0ca502ebb0ef44fcaafb4519b444616f")
    check("javascript: 與 /download/ 不跟", all("download" not in u and "javascript" not in u for u, _ in kids))

    print("\n3. 財政部條目：更新日期在容器外面，另外指定 date_select")
    et = (FIX / "tax_etax_article.html").read_text(encoding="utf-8")
    t2, _, _, u2 = extract(et, ["div.etw-article"])
    check("第一個 etw-article 是內文", "始日不計末日計" in t2, t2[:40])
    check("容器裡沒有日期", find_updated(t2) is None)
    d, _, _, du = extract(et, ["div.text-brown"])
    check("date_select 抓到頁面自己的更新日期", du and find_updated(d) == "2026-04-27", d)

    print("\n4. bot 挑戰頁不繞過")
    cf = (FIX / "tax_cloudflare.html").read_text(encoding="utf-8")
    check("403 + Cloudflare 挑戰 → blocked", looks_blocked(403, cf))
    check("一般 403 不算挑戰頁", not looks_blocked(403, "<html><title>Forbidden</title></html>"))
    check("200 不算", not looks_blocked(200, cf))

    print("\n5. 引述比對：忽略空白與全半形，字變了才算變")
    snap = "外國專業人才延攬及僱用法第22條\n規定，薪資所得超過３００萬元部分之半數"
    check("跨行、全形數字都對得上", match_key("第22條規定，薪資所得超過300萬元") in match_key(snap))
    check("改一個數字就對不上", match_key("超過200萬元") not in match_key(snap))

    print("\n6. Talent Taiwan：SPA 的內部 API（第 2 層），中英文同一包")
    art = json.loads((FIX / "talent_taiwan_article.json").read_text(encoding="utf-8"))["data"]
    r = talent_article_to_result(art)
    check("狀態 ok", r.status == "ok", r.status)
    check("英文與中文都在", "## English" in r.text and "## 中文" in r.text)
    check("HTML 轉成文字（沒有標籤殘留）", "<p>" not in r.text and "<figure" not in r.text)
    check("更新日期取 updated_time 的日期", r.page_updated == art["updated_time"][:10], r.page_updated)
    faq = json.loads((FIX / "talent_taiwan_faq.json").read_text(encoding="utf-8"))["data"]
    f = talent_faq_to_result(faq, "Taxation")
    check("只留 Taxation 分類", f.status == "ok" and "Q:" in f.text and "foreign specialist" in f.text.lower())
    check("其他分類不混進來", "Foreign Specialist Professional?" not in f.text.split("## Q:")[0])
    check("找不到分類時回報錯誤，不默默給空的", talent_faq_to_result(faq, "Nope").status == "error")

    print("\n7. 快照與索引：只有內容真的變了才重寫；失敗時保留上一份")
    root = Path(tempfile.mkdtemp())
    store = SnapshotStore(root)
    src = TaxSource(id="demo", title="示範", url="https://example.gov.tw/a")
    ok = FetchResult(status="ok", text="規定一\n規定二", page_title="示範頁", page_updated="2026-01-19", http_status=200)
    check("第一次 → new", store.record(src, ok, "2026-10-15T00:00:00+08:00") == "new")
    first_hash = store.index["demo"]["content_hash"]
    store.save()
    check("save 之後快照檔寫出來", (root / "snapshots" / "demo.md").exists())
    check("同樣內容 → unchanged", store.record(src, ok, "2026-10-22T00:00:00+08:00") == "unchanged")
    check("changed_at 沒動", store.index["demo"]["changed_at"] == "2026-10-15T00:00:00+08:00")
    check("last_checked 有動", store.index["demo"]["last_checked"] == "2026-10-22T00:00:00+08:00")
    changed = FetchResult(status="ok", text="規定一\n規定三", http_status=200)
    check("內容變了 → changed", store.record(src, changed, "2026-10-29T00:00:00+08:00") == "changed")
    check("雜湊換了", store.index["demo"]["content_hash"] != first_hash)
    broken = FetchResult(status="error", error="HTTP 502", http_status=502)
    store.record(src, broken, "2026-11-05T00:00:00+08:00")
    row = store.index["demo"]
    check("失敗時狀態記下來", row["status"] == "error" and row["error"] == "HTTP 502")
    check("失敗時上一份快照與雜湊都留著", "規定三" in store.read_snapshot("demo") and row["content_hash"])
    check("last_ok 還是上一次成功的時間", row["last_ok"] == "2026-10-29T00:00:00+08:00", row["last_ok"])
    store.save()
    reloaded = SnapshotStore(root)
    check("索引存檔後讀得回來", reloaded.index["demo"]["content_hash"] == row["content_hash"])

    print("\n8. facts 核對：verified / drifted / unchecked")
    facts = {
        "good": {"evidence": [{"source": "demo", "quote": "規定 三"}]},
        "gone": {"evidence": [{"source": "demo", "quote": "規定二"}]},
        "nosnap": {"evidence": [{"source": "missing", "quote": "x"}]},
        "noevidence": {},
    }
    res = {r["id"]: r for r in check_facts(reloaded, facts)}
    check("引述還在 → verified", res["good"]["status"] == "verified", res["good"])
    check("verified 帶著最後一次成功的時間", res["good"]["checked_at"] == "2026-10-29T00:00:00+08:00")
    check("引述不見了 → drifted", res["gone"]["status"] == "drifted", res["gone"])
    check("沒有快照 → unchecked", res["nosnap"]["status"] == "unchecked")
    check("沒附 evidence → unchecked", res["noevidence"]["status"] == "unchecked")

    print("\n8b. --dry-run 不能留下痕跡：快照延到 save() 才寫")
    dry_root = Path(tempfile.mkdtemp())
    dry = SnapshotStore(dry_root)
    dry.record(TaxSource(id="d", title="d", url="https://example.gov.tw/d"),
               FetchResult(status="ok", text="新規定", http_status=200), "2026-10-15T00:00:00+08:00")
    check("record 之後還沒有檔案", not (dry_root / "snapshots" / "d.md").exists())
    check("但同一次執行裡讀得到（核對用）", dry.read_snapshot("d") and "新規定" in dry.read_snapshot("d"))
    check("沒呼叫 save 就沒有索引檔", not (dry_root / "sources.json").exists())

    print("\n8c. 這一輪沒走到的頁 → stale；引用它的數字降成未核對；--prune 才刪")
    st_root = Path(tempfile.mkdtemp())
    st = SnapshotStore(st_root)
    for sid in ("kept", "gone"):
        st.record(TaxSource(id=sid, title=sid, url=f"https://example.gov.tw/{sid}"),
                  FetchResult(status="ok", text=f"{sid} 的規定", http_status=200), "2026-10-15T00:00:00+08:00")
    st.save()
    stale = st.mark_stale({"kept"})
    check("沒走到的那一頁被標 stale", stale == ["gone"] and st.index["gone"]["status"] == "stale", stale)
    check("走到的不受影響", st.index["kept"]["status"] == "ok")
    res2 = {r["id"]: r for r in check_facts(st, {
        "a": {"evidence": [{"source": "kept", "quote": "kept 的規定"}]},
        "b": {"evidence": [{"source": "gone", "quote": "gone 的規定"}]}})}
    check("引用 stale 來源的數字 → unchecked（快照裡雖然還有那句話）", res2["b"]["status"] == "unchecked", res2["b"])
    check("其他數字照常 verified", res2["a"]["status"] == "verified")
    check("再標一次不會重複回報", st.mark_stale({"kept"}) == [])
    gone = st.prune()
    check("prune 回報刪了哪些", gone == ["gone"])
    check("save 之前檔案還在", (st_root / "snapshots" / "gone.md").exists())
    st.save()
    check("save 之後 stale 的快照與列都不見了", not (st_root / "snapshots" / "gone.md").exists() and "gone" not in st.index)
    check("其他快照留著", (st_root / "snapshots" / "kept.md").exists())

    print("\n9. 手動來源不發請求")
    class NoNet:
        def get(self, *a, **k):
            raise AssertionError("不該發請求")
    col = TaxCollector(session=NoNet(), robots=type("R", (), {"allowed": lambda s, u: True, "crawl_delay": lambda s, u: None})())
    m = col.fetch(TaxSource(id="m", title="m", url="https://x", fetch="manual", note="Cloudflare"))
    check("manual → 狀態 manual、不抓", m.status == "manual" and m.error == "Cloudflare")

    print(f"\n{len(failures)} 個失敗" if failures else "\n全部通過")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
