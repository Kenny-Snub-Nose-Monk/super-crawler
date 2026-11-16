#!/usr/bin/env python3
"""把資料匯出成網站讀的兩個檔案：

    site/data/events.json    活動表（整張帶過去，過期的也帶，查詢時預設隱藏）
    site/data/content.json   指南、稅務 facts（含核對狀態）、試算參數、行事曆、來源索引

網站是純靜態頁，查詢與試算都在瀏覽器裡做（site/query.js、site/lib/tax.js），
所以這裡不計算稅 —— 只做三件事：

  1. 活動狀態以「匯出當下」重算一次，標題整句英文或有英文標題的補上 lang:en；
     場地欄整理成一個地名，而且有三種活動不放上網站（events.jsonl 照留）：
     地址明講在雙北以外的實體活動、期間長達兩年以上的「常駐刊登」
     （場地出租、一直掛著的線上課程 —— 2021 年開始到 2036 年的那種，掛著「On now」）、
     以及整批重抓的來源最近一次沒再列出的未來活動（見 delisted）。
     同一場活動的重複刊登（同標題、同開始時間）收成一筆，見 merge_duplicates
  2. 稅務 facts 對快照核對一次，把結果（已核對／待複核／未核對）一起帶過去
  3. 檢查指南裡的每一個引用都存在 —— {{fact:x}}、[[guide:y]]、來源 id。
     引用壞掉就失敗退出：網站上出現一個字面的 {{fact:x}} 比整頁沒更新更糟。
     畫面上會出現的來源也要有英文名稱（content/tax/source_names.yaml）。

用法：
    python scripts/export_site_data.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml

from crawler.normalize import clean_venue, now_iso, outside_target_area, script_language_tags
from crawler.schema import EventType
from crawler.store import EventStore
from crawler.tax.collect import SnapshotStore
from crawler.tax.facts import check_facts, load_facts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"
CONTENT = ROOT / "content"

_FACT_RE = re.compile(r"\{\{fact:([a-z0-9_]+)\}\}")
_GUIDE_RE = re.compile(r"\[\[guide:([a-z0-9-]+)(?:\|[^\]]*)?\]\]")
WORDS_PER_MINUTE = 220


def site_tags(ev) -> list[str]:
    """網站用的標籤：英文友善只看 lang:en 一個標籤（過濾、徽章、WebMCP 都是），
    標題整句英文、或來源另外給了英文標題的，在這裡補上。"""
    extra = script_language_tags(ev.title) + (["lang:en"] if (ev.title_en or "").strip() else [])
    return list(ev.tags) + [t for t in dict.fromkeys(extra) if t not in ev.tags]


# 超過這個天數的「活動」不是一場活動，是一則常駐的廣告。不用 90 天這種短門檻：
# 博物館的特展常常掛一年半（昆蟲特展 2025/10 → 2027/4），每週一次的語言交換也會一次刊登一年多。
STANDING_LISTING_DAYS = 730


def standing_listing(ev) -> bool:
    if not ev.starts_at or not ev.ends_at:
        return False
    span = datetime.fromisoformat(ev.ends_at) - datetime.fromisoformat(ev.starts_at)
    return span.days > STANDING_LISTING_DAYS


# 同一次抓取裡各個來源的時間戳差幾分鐘到半小時；隔超過這麼久才算下一次抓取
RUN_GAP_HOURS = 12


def crawl_runs(stamps) -> list[datetime]:
    """把 first_seen / last_seen 的時間戳分成一次一次的抓取，回傳每次抓取最早的時間（由舊到新）。"""
    times = sorted({datetime.fromisoformat(s) for s in stamps if s})
    starts: list[datetime] = []
    prev = None
    for t in times:
        if prev is None or (t - prev).total_seconds() > RUN_GAP_HOURS * 3600:
            starts.append(t)
        prev = t
    return starts


# 每次抓取都把「現在還列著的」整批重抓一遍的來源。這種來源的最近一次抓取沒再出現的活動，
# 就是來源下架了、或我們的 collector 現在會把它濾掉（例如 anncr 看了詳情頁才發現在高雄）。
#
# 只列抓法確實是「整批」的：Accupass 是關鍵字搜尋、Meetup 只看主題頁前幾頁，
# 這週沒搜到不代表活動沒了（2026-11 實測：Meetup 3 場 12 月的活動只是掉出主題頁）。
# 新增來源前先確認它的抓法是整批的。
RELISTS_EVERYTHING = {"anncr"}   # /calendar 一次給當月全部


def delisted(events) -> set[str]:
    """RELISTS_EVERYTHING 的來源裡，還沒開始、但該來源最近一次抓取沒再回傳的活動 uid。

    只看還沒開始的：進行中的跨月活動，下個月的月曆不一定還列著；過期的本來就預設不顯示。
    比的是「同一個來源」的最近一次抓取 —— 某個來源這次抓失敗，它的活動不能因此全部消失。
    """
    events = list(events)
    runs = crawl_runs([s for ev in events for s in (ev.first_seen, ev.last_seen)])
    if not runs:
        return set()

    def run_of(stamp: str) -> int:
        t = datetime.fromisoformat(stamp)
        return max(i for i, start in enumerate(runs) if start <= t)

    latest: dict[str, int] = {}
    for ev in events:
        if ev.source_platform in RELISTS_EVERYTHING and ev.last_seen:
            latest[ev.source_platform] = max(latest.get(ev.source_platform, 0), run_of(ev.last_seen))
    return {
        ev.uid for ev in events
        if ev.source_platform in RELISTS_EVERYTHING and ev.status == "upcoming"
        and ev.last_seen and run_of(ev.last_seen) < latest[ev.source_platform]
    }


def new_in_latest_run(events) -> tuple[set[str], str | None]:
    """網站上的「New」：最近一次抓取才第一次出現的活動。

    以抓取的批次為準，不看使用者的時鐘 —— 以前是「first_seen 在 7 天內」，抓取晚一天
    整批 New 就消失、一週多抓一次又兩批都算。另外，一個來源第一次被抓的那一批不算新：
    那是把它既有的刊登一次補進來（例如新接上的來源一次進來 40 幾筆），不是新公告的活動。

    回傳 (New 的 uid 集合, 最近一次抓取的開始時間)。
    """
    events = list(events)
    runs = crawl_runs([s for ev in events for s in (ev.first_seen, ev.last_seen)])
    if not runs:
        return set(), None
    latest = runs[-1]

    def run_of(stamp: str) -> int:
        t = datetime.fromisoformat(stamp)
        return max(i for i, start in enumerate(runs) if start <= t)

    first_run_of_source: dict[str, int] = {}
    for ev in events:
        if ev.first_seen:
            i = run_of(ev.first_seen)
            first_run_of_source[ev.source_platform] = min(i, first_run_of_source.get(ev.source_platform, i))
    last = len(runs) - 1
    fresh = {
        ev.uid for ev in events
        if ev.first_seen and datetime.fromisoformat(ev.first_seen) >= latest
        and first_run_of_source[ev.source_platform] < last
    }
    return fresh, latest.isoformat()


# --- 重複刊登：同一場活動被刊了不只一次 ---
#
# IMPLEMENTATION.md §2：資料表裡跨平台、同平台換 id 的重複都照留（合錯救不回來），
# 「在查詢時分組」。網站的查詢就是讀這份匯出，所以分組做在這裡：events.jsonl 一筆不刪，
# 網站上一場只出現一次，其他刊登掛在代表那筆的 also_listed 底下。
#
# 「同一場」= 標題正規化後相同 + 開始時間精確到分鐘相同。只比日期不行：
# 同一系列一天兩場（14:00、19:30）是兩場，網站要列成「其他場次」。
# 另外地點要對得上 —— 「Language Exchange」這種通用標題，不同主辦同一時間
# 在不同區辦是真的兩場。地點對不上但主辦相同，就是來源有一筆填錯了（同一個主辦
# 不會同時在兩個地方辦同一場）：照樣合併，但不挑邊，標 venue_conflict。

_LOCATION_FIELDS = ("venue", "address", "city", "district", "lat", "lon")
# 代表那筆沒有、其他刊登有的欄位就補上 —— 兩邊常常互補（一邊有票價、一邊有地址）
_FILL_FIELDS = ("title_en", "description", "organizer", "price_text", "is_free",
                "ends_at", "signup_deadline")


def _title_key(title) -> str:
    return re.sub(r"[\W_]+", "", (title or "").lower())   # Python 的 \W 認得中文


def _places_conflict(a: dict, b: dict) -> bool:
    """兩筆的地點明確對不上：行政區都有但不同，或縣市都有但不同。場地名不比 ——
    同一個地方各家寫法差很多（「SOMEWHERE 那裡」vs 一串英文地址）。"""
    for f in ("city", "district"):
        if a.get(f) and b.get(f) and a[f] != b[f]:
            return True
    return False


def _completeness(d: dict) -> tuple:
    """挑代表：資料最完整的；一樣完整就挑最早被抓到的。"""
    filled = sum(bool(d.get(f)) for f in ("address", "venue", "district", "lat", "price_text",
                                          "description", "signup_deadline", "organizer"))
    filled += d.get("is_free") is not None
    return (-filled, d.get("first_seen") or "9999", d["uid"])


def merge_duplicates(events: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """把同一場活動的多筆刊登合成一筆。回傳 (合併後的活動, {被收起來的 uid: 代表的 uid})。

    第二個回傳值讓舊連結與已收藏的 uid 還找得到活動。"""
    buckets: dict[tuple, list[dict]] = {}
    for d in events:
        if d.get("starts_at") and _title_key(d.get("title")):
            buckets.setdefault((_title_key(d["title"]), d["starts_at"][:16]), []).append(d)

    aliases: dict[str, str] = {}
    hidden: set[str] = set()
    for bucket in buckets.values():
        if len(bucket) < 2:
            continue
        # 一個 bucket 裡可能是好幾場（通用標題、不同地點）：逐筆放進第一個對得上的群
        groups: list[list[dict]] = []
        for d in sorted(bucket, key=_completeness):
            for g in groups:
                if all(not _places_conflict(d, m) or (d.get("organizer") and d.get("organizer") == m.get("organizer"))
                       for m in g):
                    g.append(d)
                    break
            else:
                groups.append([d])

        for g in groups:
            if len(g) < 2:
                continue
            rep, others = g[0], g[1:]
            conflict = any(_places_conflict(a, b) for a in g for b in g if a is not b)
            if conflict:
                rep["venue_conflict"] = list(dict.fromkeys(m.get("venue") or m.get("address") for m in g
                                                           if m.get("venue") or m.get("address")))
                cities = {m.get("city") for m in g}
                for f in _LOCATION_FIELDS:
                    rep[f] = None
                rep["city"] = cities.pop() if len(cities) == 1 else None
            for m in others:
                for f in _FILL_FIELDS + (() if conflict else _LOCATION_FIELDS):
                    if rep.get(f) is None and m.get(f) is not None:
                        rep[f] = m[f]
                rep["tags"] = list(dict.fromkeys(rep["tags"] + m["tags"]))
                aliases[m["uid"]] = rep["uid"]
                hidden.add(m["uid"])
            # 有一筆早就抓過，這場就不算新的
            rep["is_new"] = all(m["is_new"] for m in g)
            rep["first_seen"] = min((m["first_seen"] for m in g if m.get("first_seen")), default=rep.get("first_seen"))
            rep["also_listed"] = [{"uid": m["uid"], "source_platform": m["source_platform"],
                                   "source_url": m["source_url"]} for m in others]
    return [d for d in events if d["uid"] not in hidden], aliases


def export_events() -> dict:
    store = EventStore()
    store.refresh_status()           # 只改記憶體裡的狀態，不寫回 events.jsonl
    fresh, latest_crawl = new_in_latest_run(store.all())
    gone = delisted(store.all())
    events = []
    dropped = {"outside": 0, "standing": 0, "delisted": 0}
    for ev in store.all():
        if ev.uid in gone:
            dropped["delisted"] += 1
            continue
        if "online" not in ev.tags and outside_target_area(ev.city, ev.address):
            dropped["outside"] += 1
            continue
        if standing_listing(ev):
            dropped["standing"] += 1
            continue
        d = ev.to_dict()
        d["tags"] = site_tags(ev)
        # 舊資料是 clean_venue 出現前抓的；新抓的已經整理過，再整理一次也不會變
        d["venue"] = clean_venue(ev.venue)
        d["is_new"] = ev.uid in fresh
        events.append(d)
    events, aliases = merge_duplicates(events)
    events.sort(key=lambda e: (e["starts_at"] or "9999", e["uid"]))
    print(f"  活動：不放上網站 —— 雙北以外 {dropped['outside']} 筆、常駐刊登 {dropped['standing']} 筆、"
          f"來源已不再列出 {dropped['delisted']} 筆")
    conflicts = sum(1 for e in events if e.get("venue_conflict"))
    print(f"  活動：重複刊登收起 {len(aliases)} 筆（其中 {conflicts} 場各刊登的地點對不上）")
    print(f"  活動：最近一次抓取 {latest_crawl} 新增 {sum(e['is_new'] for e in events)} 筆（標 New）")
    return {"generated_at": now_iso(), "latest_crawl": latest_crawl,
            "types": [t.value for t in EventType], "events": events, "aliases": aliases}


def _strings(obj):
    """走過一個 YAML 結構，吐出所有字串（找引用用）。"""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _strings(v)


def _reading_minutes(guide: dict) -> int:
    words = sum(len(s.split()) for s in _strings(guide.get("sections", [])))
    return max(2, round(words / WORDS_PER_MINUTE))


def load_guides() -> list[dict]:
    guides = []
    for path in sorted((CONTENT / "guides").glob("*.yaml")):
        g = yaml.safe_load(path.read_text(encoding="utf-8"))
        g["reading_minutes"] = _reading_minutes(g)
        g["updated"] = str(g.get("updated") or "")
        guides.append(g)
    guides.sort(key=lambda g: (g.get("kind") != "tax", g.get("order", 99)))
    return guides


def load_source_names() -> dict[str, str]:
    path = CONTENT / "tax" / "source_names.yaml"
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def build_tax(snapshots: SnapshotStore) -> dict:
    facts = load_facts()
    checks = {r["id"]: r for r in check_facts(snapshots, facts)}
    index = snapshots.index
    names = load_source_names()

    def source_meta(sid: str) -> dict:
        row = index.get(sid) or {}
        return {k: row.get(k) for k in ("id", "title", "publisher", "kind", "url", "lang",
                                         "status", "page_updated", "last_ok", "note")} | {"id": sid, "title_en": names.get(sid)}

    out_facts = {}
    for fid, f in facts.items():
        c = checks[fid]
        srcs, seen = [], set()
        for ev in f.get("evidence") or []:
            if ev["source"] not in seen:
                seen.add(ev["source"])
                srcs.append(source_meta(ev["source"]))
        out_facts[fid] = {
            "id": fid, "label": f["label"], "value": f["value"], "display": f["display"],
            "year": f.get("year"), "topics": f.get("topics", []), "note": f.get("note"),
            "provisional": bool(f.get("provisional")),
            "status": c["status"], "checked_at": c["checked_at"], "detail": c["detail"],
            "sources": srcs,
            # 原文引述也帶過去：WebMCP 工具回答時可以附上「官方原文」
            "quotes": [{"source": ev["source"], "quote": ev["quote"]} for ev in f.get("evidence") or []],
        }

    params = yaml.safe_load((CONTENT / "tax" / "params.yaml").read_text(encoding="utf-8"))

    def resolve(mapping: dict) -> dict:
        out = {}
        for key, val in mapping.items():
            if key in ("label", "filed"):
                out[key] = val
                continue
            f = out_facts.get(val)
            if f is None:
                raise SystemExit(f"params.yaml 的 {key} 指到不存在的 fact：{val}")
            out[key] = {"value": f["value"], "fact": val, "display": f["display"],
                        "provisional": f["provisional"], "status": f["status"]}
        return out

    resolved = {
        "default_year": params["default_year"],
        "years": {str(y): resolve(m) for y, m in params["years"].items()},
        "shared": resolve(params["shared"]),
    }
    calendar = yaml.safe_load((CONTENT / "tax" / "calendar.yaml").read_text(encoding="utf-8"))["items"]
    for item in calendar:
        if item.get("fact") and item["fact"] not in out_facts:
            raise SystemExit(f"calendar.yaml 指到不存在的 fact：{item['fact']}")
    sources = sorted(index.values(), key=lambda r: r["id"])
    checked = [r["last_checked"] for r in sources if r.get("last_checked")]
    return {
        "facts": out_facts, "params": resolved, "calendar": calendar,
        "sources": [{k: r.get(k) for k in ("id", "parent", "title", "publisher", "kind", "url", "lang",
                                            "status", "page_updated", "last_checked", "last_ok",
                                            "changed_at", "chars", "note", "error")} | {"title_en": names.get(r["id"])}
                    for r in sources],
        "checked_at": max(checked) if checked else None,
    }


def validate(guides: list[dict], tax: dict) -> list[str]:
    problems = []
    slugs = {g["slug"] for g in guides}
    source_ids = {s["id"] for s in tax["sources"]}
    for g in guides:
        for s in _strings(g):
            for fid in _FACT_RE.findall(s):
                if fid not in tax["facts"]:
                    problems.append(f"{g['slug']}: 不存在的 fact {fid}")
            for slug in _GUIDE_RE.findall(s):
                if slug not in slugs:
                    problems.append(f"{g['slug']}: 不存在的指南 {slug}")
        for sid in g.get("sources", []):
            if sid not in source_ids:
                problems.append(f"{g['slug']}: 不存在的來源 {sid}")
        for slug in g.get("related", []):
            if slug not in slugs:
                problems.append(f"{g['slug']}: related 指到不存在的指南 {slug}")
        for sec in g.get("sections", []):
            for b in sec.get("blocks", []):
                for fid in b.get("facts", []) if isinstance(b, dict) else []:
                    if fid not in tax["facts"]:
                        problems.append(f"{g['slug']}: facts 區塊裡不存在的 fact {fid}")
                for sid in b.get("cite", []) if isinstance(b, dict) else []:
                    if sid not in source_ids:
                        problems.append(f"{g['slug']}: cite 區塊裡不存在的來源 {sid}")

    # 畫面上會出現的來源：指南與 cite 區塊引用的、fact 證據用到的、設定檔裡的起點
    shown = {s["id"] for s in tax["sources"] if not s.get("parent")}
    for g in guides:
        shown.update(g.get("sources", []))
        for sec in g.get("sections", []):
            for b in sec.get("blocks", []):
                shown.update(b.get("cite", []) if isinstance(b, dict) else [])
    for f in tax["facts"].values():
        shown.update(src["id"] for src in f["sources"])
    english = {s["id"] for s in tax["sources"] if s.get("title_en")}
    for sid in sorted(shown & source_ids - english):
        problems.append(f"來源 {sid} 沒有英文名稱（content/tax/source_names.yaml）")
    return problems


def main() -> int:
    events = export_events()
    snapshots = SnapshotStore()
    tax = build_tax(snapshots)
    guides = load_guides()
    problems = validate(guides, tax)
    if problems:
        print("指南的引用有問題，沒有匯出：")
        for p in problems:
            print(f"  ✗ {p}")
        return 1

    content = {"generated_at": now_iso(), "guides": guides, "tax": tax}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "events.json").write_text(json.dumps(events, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "content.json").write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    statuses = {}
    for f in tax["facts"].values():
        statuses[f["status"]] = statuses.get(f["status"], 0) + 1
    print(f"已匯出 {len(events['events'])} 筆活動、{len(guides)} 篇指南、{len(tax['facts'])} 筆稅務 facts "
          f"（{' / '.join(f'{k} {v}' for k, v in sorted(statuses.items()))}）、{len(tax['sources'])} 個稅務來源 → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
