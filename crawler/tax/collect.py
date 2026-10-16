"""稅務來源的抓取、快照與變更偵測。

一個來源 = 一頁原文。設定在 config/tax_sources.yaml，產出：

    data/tax/snapshots/<id>.md   原文快照（只有內容真的變了才重寫）
    data/tax/sources.json        索引：每個來源的狀態、雜湊、最後檢查時間

快照跟 events.jsonl 一樣 commit 進 repo —— 財政部改了扣繳規定，
那週的 data commit 就是一段看得懂的 diff。

失敗的處理跟活動那條線一樣「隔離、不擴散」，而且多一條：
**抓失敗時保留上一次成功的快照。** 規則的原文不會因為對方伺服器
這週 502 就失效；網站上引用它的數字也不該跟著消失。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import requests
import yaml

from ..normalize import now_iso
from ..robots import RobotsGate
from .extract import (absolute_links, extract, find_updated, html_fragment_to_text,
                      looks_blocked)

ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG = ROOT / "config" / "tax_sources.yaml"
DATA_DIR = ROOT / "data" / "tax"

# 少於這個字數多半是 SPA 的空殼（Talent Taiwan 的文章頁靜態抓只有 15 個字）
THIN_CHARS = 200
TALENT_API = "https://talent.nat.gov.tw/backend"


@dataclass
class TaxSource:
    id: str
    title: str
    url: str
    publisher: str = ""
    kind: str = "government"          # government / law / non_government / tool
    lang: str = "zh"
    fetch: str = "html"               # html / talent_article / talent_faq / manual
    select: list[str] = field(default_factory=list)
    # 跟著頁面裡的連結往下抓：
    #   pattern        要跟的 href（正規表達式）
    #   index_pattern  符合的子頁本身也是目錄（只取連結、不存快照），會再往下跟
    #   depth          最多往下幾層（預設 1）
    #   names          子頁網址最後一段 → 好讀的 id；沒列到的用 <父 id>--<前 8 碼>
    follow: Optional[dict] = None
    index_only: bool = False          # 目錄頁：只用來找子頁，本身不存快照
    # 頁面標示的更新日期不在內容容器裡時（財政部的 etw-article 外面才有），另外指定去哪找
    date_select: list[str] = field(default_factory=list)
    note: Optional[str] = None
    parent: Optional[str] = None
    params: dict = field(default_factory=dict)   # 給 API 型來源的參數（slug、category）

    @classmethod
    def from_dict(cls, d: dict) -> "TaxSource":
        known = set(cls.__dataclass_fields__)
        extra = {k: v for k, v in d.items() if k not in known}
        obj = cls(**{k: v for k, v in d.items() if k in known})
        obj.params = {**extra, **obj.params}
        return obj


@dataclass
class FetchResult:
    status: str                       # ok / thin / blocked / disallowed / error / manual
    text: Optional[str] = None
    page_title: Optional[str] = None
    page_updated: Optional[str] = None
    http_status: Optional[int] = None
    error: Optional[str] = None
    children: list[TaxSource] = field(default_factory=list)
    selector_used: Optional[str] = None


def load_sources(path: Path = CONFIG) -> list[TaxSource]:
    cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return [TaxSource.from_dict(d) for d in cfg.get("sources") or []]


def content_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


class TaxCollector:
    """抓一批稅務來源。session 與 robots 檢查跟活動 collector 共用同一套。"""

    delay = 1.0     # 對政府網站禮貌一點，一週才跑一次

    def __init__(self, session: requests.Session, robots: Optional[RobotsGate] = None):
        self.session = session
        self.robots = robots or RobotsGate(session=session)

    # --- 單一來源 ---

    def fetch(self, src: TaxSource) -> FetchResult:
        if src.fetch == "manual":
            return FetchResult(status="manual", error=src.note)
        try:
            if src.fetch == "html":
                return self._fetch_html(src)
            if src.fetch == "talent_article":
                return self._fetch_talent_article(src)
            if src.fetch == "talent_faq":
                return self._fetch_talent_faq(src)
            return FetchResult(status="error", error=f"未知的 fetch 型態: {src.fetch}")
        except requests.RequestException as e:
            return FetchResult(status="error", error=f"{type(e).__name__}: {e}")

    def _get(self, url: str, accept: str) -> requests.Response:
        delay = self.robots.crawl_delay(url)
        time.sleep(max(self.delay, delay or 0))
        return self.session.get(url, timeout=30, headers={"Accept": accept})

    def _fetch_html(self, src: TaxSource) -> FetchResult:
        if not self.robots.allowed(src.url):
            return FetchResult(status="disallowed", error="robots.txt 禁止")
        r = self._get(src.url, "text/html")
        r.encoding = r.apparent_encoding if not r.encoding or r.encoding.lower() == "iso-8859-1" else r.encoding
        html = r.text
        if looks_blocked(r.status_code, html):
            return FetchResult(status="blocked", http_status=r.status_code,
                               error="bot 挑戰頁（Cloudflare），不繞過")
        if r.status_code != 200:
            return FetchResult(status="error", http_status=r.status_code,
                               error=f"HTTP {r.status_code}")
        text, links, page_title, used = extract(html, src.select)
        updated = find_updated(text)
        if updated is None and src.date_select:
            date_text, _, _, date_used = extract(html, src.date_select)
            updated = find_updated(date_text) if date_used else None
        res = FetchResult(status="ok", text=text, page_title=page_title,
                          page_updated=updated, http_status=r.status_code,
                          selector_used=used)
        if src.follow:
            res.children = self._children(src, links)
        if src.select and used is None:
            # 選擇器全部失效 → 對方改版了。整頁文字會混進導覽與頁尾，不要存。
            res.status = "error"
            res.error = f"內容容器找不到（{src.select}），對方可能改版"
            res.text = None
        elif src.index_only:
            res.status, res.text = "index", None
        elif not text:
            res.status, res.error = "empty", "容器是空的"
        elif used is None and len(text) < THIN_CHARS:
            # 只有「沒指定容器、整頁取文字」時才用字數判斷空殼。
            # 有命中容器就算數 —— 財政部「居留日數之計算」全文只有 70 個字，
            # 那是一條完整的規定，不是空殼。
            res.status = "thin"
            res.error = f"只有 {len(text)} 字，可能是 SPA 空殼"
        return res

    def _children(self, src: TaxSource, links: list[tuple[str, str]]) -> list[TaxSource]:
        rule = src.follow or {}
        names = rule.get("names") or {}
        depth = int(rule.get("depth", 1))
        index_rx = re.compile(rule["index_pattern"]) if rule.get("index_pattern") else None
        out = []
        for url, text in absolute_links(links, src.url, rule["pattern"])[: rule.get("max", 60)]:
            key = url.rstrip("/").rsplit("/", 1)[-1].split("?")[0]
            child_id = names.get(key) or f"{src.id}--{key[:8]}"
            is_index = bool(index_rx and index_rx.search(url))
            if is_index and depth <= 1:
                continue          # 再往下就超過深度了
            out.append(TaxSource(
                id=child_id, title=text or child_id, url=url, publisher=src.publisher,
                kind=src.kind, lang=src.lang, fetch="html",
                select=(rule.get("index_select") if is_index else None)
                or rule.get("select") or src.select,
                date_select=rule.get("date_select") or [],
                follow={**rule, "depth": depth - 1} if is_index else None,
                index_only=is_index, parent=src.id))
        return out

    def _fetch_talent_article(self, src: TaxSource) -> FetchResult:
        """Talent Taiwan 是 SPA，靜態抓只拿得到空殼。前端打的內部 API 才有內容
        （階梯第 2 層）：/backend/life_taiwan/articles/<slug>，中英文都在同一包。"""
        slug = src.params["slug"]
        api = f"{TALENT_API}/life_taiwan/articles/{slug}"
        if not self.robots.allowed(api):
            return FetchResult(status="disallowed", error="robots.txt 禁止")
        r = self._get(api, "application/json")
        if r.status_code != 200:
            return FetchResult(status="error", http_status=r.status_code, error=f"HTTP {r.status_code}")
        data = (r.json() or {}).get("data") or {}
        return talent_article_to_result(data, r.status_code)

    def _fetch_talent_faq(self, src: TaxSource) -> FetchResult:
        api = f"{TALENT_API}/faq"
        if not self.robots.allowed(api):
            return FetchResult(status="disallowed", error="robots.txt 禁止")
        r = self._get(api, "application/json")
        if r.status_code != 200:
            return FetchResult(status="error", http_status=r.status_code, error=f"HTTP {r.status_code}")
        return talent_faq_to_result((r.json() or {}).get("data") or [],
                                    src.params.get("category", ""), r.status_code)


def talent_article_to_result(data: dict, http_status: int = 200) -> FetchResult:
    title = data.get("title") or {}
    contents = data.get("contents") or {}
    parts = []
    for lang, label in (("en", "English"), ("zh", "中文")):
        body = html_fragment_to_text(contents.get(lang) or "")
        if body:
            parts.append(f"## {label}：{title.get(lang) or ''}\n\n{body}")
    text = "\n\n".join(parts)
    updated = (data.get("updated_time") or "")[:10] or None
    res = FetchResult(status="ok", text=text, page_title=title.get("en") or title.get("zh"),
                      page_updated=updated, http_status=http_status)
    if len(text) < THIN_CHARS:
        res.status, res.error = "thin", f"只有 {len(text)} 字"
    return res


def talent_faq_to_result(categories: list, category: str, http_status: int = 200) -> FetchResult:
    """FAQ 一包回全部分類；只留指定的那一類（例如 Taxation and Customs）。"""
    wanted = category.lower()
    cat = next((c for c in categories
                if wanted in ((c.get("title") or {}).get("en") or "").lower()
                or wanted == (c.get("slug") or "").lower()), None)
    if cat is None:
        return FetchResult(status="error", http_status=http_status,
                           error=f"FAQ 裡找不到分類 {category!r}")
    blocks = []
    for item in sorted(cat.get("contents") or [], key=lambda x: x.get("sequence_no") or 0):
        t = item.get("title") or {}
        c = item.get("contents") or {}
        en = html_fragment_to_text(c.get("en") or "")
        zh = html_fragment_to_text(c.get("zh") or "")
        blocks.append(f"## Q: {t.get('en') or ''}\n\n{en}\n\n### 問：{t.get('zh') or ''}\n\n{zh}")
    text = "\n\n".join(blocks)
    return FetchResult(status="ok" if len(text) >= THIN_CHARS else "thin", text=text,
                       page_title=f"Talent Taiwan FAQ — {(cat.get('title') or {}).get('en')}",
                       http_status=http_status)


# --- 快照與索引 -------------------------------------------------------

class SnapshotStore:
    """data/tax/ 底下的快照與索引。"""

    def __init__(self, root: Path = DATA_DIR):
        self.root = Path(root)
        self.snap_dir = self.root / "snapshots"
        self.index_path = self.root / "sources.json"
        self.index: dict[str, dict[str, Any]] = {}
        # 快照的寫入延到 save()：--dry-run 不呼叫 save，就不能在磁碟上留下任何痕跡
        self._pending: dict[str, str] = {}
        self._removed: set[str] = set()
        if self.index_path.exists():
            rows = json.loads(self.index_path.read_text(encoding="utf-8"))
            self.index = {r["id"]: r for r in rows}

    def snapshot_path(self, sid: str) -> Path:
        return self.snap_dir / f"{sid}.md"

    def read_snapshot(self, sid: str) -> Optional[str]:
        if sid in self._pending:
            return self._pending[sid]
        if sid in self._removed:
            return None
        p = self.snapshot_path(sid)
        return p.read_text(encoding="utf-8") if p.exists() else None

    def record(self, src: TaxSource, res: FetchResult, stamp: Optional[str] = None) -> str:
        """寫入一次抓取的結果，回傳 "new" / "changed" / "unchanged" / 狀態字串。"""
        stamp = stamp or now_iso()
        prev = self.index.get(src.id, {})
        row = {
            "id": src.id, "parent": src.parent, "title": src.title,
            "publisher": src.publisher, "kind": src.kind, "lang": src.lang,
            "url": src.url, "note": src.note,
            "first_seen": prev.get("first_seen"),
            "content_hash": prev.get("content_hash"),
            "page_title": prev.get("page_title"),
            "page_updated": prev.get("page_updated"),
            "chars": prev.get("chars"),
            "changed_at": prev.get("changed_at"),
            "last_ok": prev.get("last_ok"),
            "last_checked": stamp,
            "status": res.status,
            "http_status": res.http_status,
            "error": res.error,
        }
        outcome = res.status
        if res.status == "ok" and res.text:
            h = content_hash(res.text)
            row["last_ok"] = stamp
            row["page_title"] = res.page_title
            row["page_updated"] = res.page_updated
            row["chars"] = len(res.text)
            if h != prev.get("content_hash"):
                self._pending[src.id] = self._render_snapshot(src, res)
                outcome = "new" if not prev.get("content_hash") else "changed"
                row["content_hash"] = h
                row["changed_at"] = stamp
                row["first_seen"] = row["first_seen"] or stamp
            else:
                outcome = "unchanged"
        # 失敗時什麼都不動：上一次成功的快照與雜湊原樣留著
        self.index[src.id] = row
        return outcome

    @staticmethod
    def _render_snapshot(src: TaxSource, res: FetchResult) -> str:
        header = [f"# {src.title}", "", f"- 來源：{src.url}"]
        if res.page_title and res.page_title != src.title:
            header.append(f"- 頁面標題：{res.page_title}")
        if res.page_updated:
            header.append(f"- 頁面標示更新：{res.page_updated}")
        return "\n".join(header) + "\n\n---\n\n" + res.text.strip() + "\n"

    def mark_stale(self, visited: set[str]) -> list[str]:
        """完整跑完一輪後呼叫：這一輪沒走到的列標成 stale。

        子頁是跟著連結找到的。對方拿掉連結、或改了目錄結構，那一頁就不會再被抓 ——
        但它的舊快照還在，引用它的 facts 會一直顯示「已核對」。標成 stale 之後
        facts 會降成「未核對」，網站與工具都看得到。快照留著，--prune 才刪。
        只能在沒有 -s 過濾的完整一輪之後呼叫，否則沒跑到的來源會全部被誤標。
        """
        stale = []
        for sid, row in self.index.items():
            if sid not in visited and row.get("status") != "stale":
                row["status"] = "stale"
                row["error"] = "這一輪沒有走到這一頁（連結不見了，或 id 換了）"
                stale.append(sid)
        return stale

    def prune(self) -> list[str]:
        """刪掉 stale 的列與它們的快照（save() 時才真的刪檔）。"""
        gone = [sid for sid, row in self.index.items() if row.get("status") == "stale"]
        for sid in gone:
            del self.index[sid]
            self._pending.pop(sid, None)
            self._removed.add(sid)
        return gone

    def save(self) -> None:
        for sid, body in self._pending.items():
            _atomic_write(self.snapshot_path(sid), body)
        for sid in self._removed:
            self.snapshot_path(sid).unlink(missing_ok=True)
        self._pending.clear()
        self._removed.clear()
        rows = sorted(self.index.values(), key=lambda r: r["id"])
        _atomic_write(self.index_path,
                      json.dumps(rows, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


def _atomic_write(path: Path, text: str) -> None:
    """跟 events.jsonl 一樣先寫暫存檔再換上，中途被砍不會留下半個檔案。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise
