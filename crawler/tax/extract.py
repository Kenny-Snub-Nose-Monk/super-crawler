"""把政府網頁轉成可以 diff、可以比對引述的純文字。

為什麼不用 BeautifulSoup：專案的依賴只有 requests 與 pyyaml，
而這裡要的只是「某個容器底下的文字，保留段落與清單」—— 標準庫的
HTMLParser 夠用。多一個依賴就多一個 CI 版本問題。

容器要指定，不要整頁取文字。財政部的頁面主內容只有幾千字，
導覽列與頁尾卻有兩千字，而且頁尾帶著「更新日期:今天」—— 整頁取文字
的話每週都會是一大片假變更，「這週規則改了什麼」就看不出來了。
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from html.parser import HTMLParser
from typing import Iterable, Optional
from urllib.parse import urljoin

_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}
_SKIP = {"script", "style", "noscript", "svg", "template", "button", "select"}
_BLOCK = {"p", "div", "section", "article", "main", "ul", "ol", "dl", "dt", "dd",
          "table", "thead", "tbody", "tr", "blockquote", "figure", "figcaption",
          "form", "fieldset", "header", "footer", "nav", "aside", "pre"}
_HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def _parse_selector(sel: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """'div.etw-article' / '.left-content-text' / '#main' / 'article' → (tag, class, id)。

    只支援單一元素的選擇器 —— 這裡不是要實作 CSS，是要說「從哪個容器開始」。
    """
    m = re.fullmatch(r"([a-zA-Z0-9]*)(?:\.([\w-]+))?(?:#([\w-]+))?", sel.strip())
    if not m:
        raise ValueError(f"不支援的選擇器: {sel!r}")
    tag, cls, ident = m.groups()
    return (tag or None), cls, ident


def _matches(tag: str, attrs: dict, sel: tuple) -> bool:
    want_tag, want_cls, want_id = sel
    if want_tag and tag != want_tag:
        return False
    if want_cls and want_cls not in (attrs.get("class") or "").split():
        return False
    if want_id and attrs.get("id") != want_id:
        return False
    return True


class _Capture(HTMLParser):
    """擷取第一個符合選擇器的元素底下的文字與連結。

    HTML 允許省略 </p>、</li>，所以不能只數深度 —— 少一個結尾標籤，
    深度就永遠回不到 0，擷取會一路吃到頁尾。改用一個開啟中標籤的堆疊：
    遇到結尾標籤就往下彈到同名的那一層，容器本身被彈掉時擷取結束。
    """

    def __init__(self, selector: Optional[str]):
        super().__init__(convert_charrefs=True)
        self.sel = _parse_selector(selector) if selector else None
        self.capturing = selector is None
        self.done = False
        self.found = selector is None
        self.stack: list[str] = []
        self.skip_depth = 0
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._link_href: Optional[str] = None
        self._link_text: list[str] = []
        self.title: Optional[str] = None
        self._in_title = False
        self._title_buf: list[str] = []

    # --- 輸出 ---

    def _newline(self, prefix: str = "") -> None:
        self.parts.append("\n" + prefix)

    # --- HTMLParser 事件 ---

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title" and self.title is None:
            self._in_title = True
        if self.done:
            return
        if not self.capturing:
            if self.sel and _matches(tag, attrs, self.sel):
                self.capturing = True
                self.found = True
                if tag not in _VOID:
                    self.stack.append(tag)
            return
        if tag not in _VOID:
            self.stack.append(tag)
        if self.skip_depth or tag in _SKIP:
            if tag not in _VOID:
                self.skip_depth += 1
            return
        if tag == "br":
            self._newline()
        elif tag == "li":
            self._newline("- ")
        elif tag in _HEADINGS:
            self._newline("## ")
        elif tag in ("td", "th"):
            self.parts.append(" | ")
        elif tag in _BLOCK or tag == "hr":
            self._newline()
        if tag == "a":
            self._link_href = attrs.get("href")
            self._link_text = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in _VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
            if self.title is None:
                self.title = re.sub(r"\s+", " ", "".join(self._title_buf)).strip() or None
        if not self.capturing or self.done or tag in _VOID:
            return
        if tag not in self.stack:
            return          # 多出來的結尾標籤，不理它
        while self.stack:
            top = self.stack.pop()
            if self.skip_depth:
                self.skip_depth -= 1
            elif top == "a" and self._link_href is not None:
                text = re.sub(r"\s+", " ", "".join(self._link_text)).strip()
                self.links.append((self._link_href, text))
                self._link_href = None
            elif top in _BLOCK or top in _HEADINGS or top in ("li", "tr"):
                self._newline()
            if top == tag:
                break
        if self.sel is not None and not self.stack:
            self.done = True     # 容器本身關掉了

    def handle_data(self, data):
        if self._in_title:
            self._title_buf.append(data)
        if not self.capturing or self.done or self.skip_depth:
            return
        self.parts.append(data)
        if self._link_href is not None:
            self._link_text.append(data)


def _tidy(raw: str) -> str:
    """整理空白：每行內部壓成一個空格，空行最多留一行。"""
    lines = []
    for line in raw.replace("　", " ").replace("\xa0", " ").split("\n"):
        line = re.sub(r"[ \t\r\f\v]+", " ", line).strip()
        line = re.sub(r"^(\| )+", "", line)          # 表格列開頭的分隔線
        if line in ("-", "##", "|"):
            line = ""
        lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract(html: str, selectors: Iterable[str] = ()) -> tuple[str, list[tuple[str, str]], Optional[str], Optional[str]]:
    """回傳 (文字, 連結, 頁面 <title>, 用到的選擇器)。

    selectors 依序試，第一個找得到的容器勝出；全部都找不到才退回整頁 ——
    退回整頁時第四個回傳值是 None，呼叫端應該把它當成「選擇器失效」的警訊。
    """
    title = None
    for sel in selectors:
        p = _Capture(sel)
        p.feed(html)
        p.close()
        title = title or p.title
        if p.found:
            return _tidy("".join(p.parts)), p.links, title, sel
    p = _Capture(None)
    p.feed(html)
    p.close()
    return _tidy("".join(p.parts)), p.links, title or p.title, None


def html_fragment_to_text(fragment: str) -> str:
    """API 回傳的 HTML 片段（例如 Talent Taiwan 的文章內容）轉成文字。"""
    text, _, _, _ = extract(f"<div>{fragment}</div>", ["div"])
    return text


def absolute_links(links: Iterable[tuple[str, str]], base_url: str,
                   pattern: str) -> list[tuple[str, str]]:
    """篩出 href 符合 pattern 的連結，轉成絕對網址，去重但保留順序。"""
    rx = re.compile(pattern)
    out, seen = [], set()
    for href, text in links:
        if not href or href.startswith(("javascript:", "#", "mailto:")):
            continue
        if not rx.search(href):
            continue
        url = urljoin(base_url, href)
        if url in seen:
            continue
        seen.add(url)
        out.append((url, text))
    return out


# --- 更新日期 ---------------------------------------------------------
# 政府網站用民國紀年（115-01-19），民間網站用西元。兩種都認。

_ROC_DATE = re.compile(
    r"(?:更新日期|修改日期|發布日期|發佈日期|公告日期|資料更新|最後更新)\s*[：:]?\s*"
    r"(\d{2,4})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})")
_EN_DATE = re.compile(
    r"(?:Last updated|Updated|Post published|Published)\s*[：:]?\s*"
    r"(\d{4})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})", re.IGNORECASE)


def find_updated(text: str) -> Optional[str]:
    """抓頁面自己標的更新日期，回傳 ISO 日期。找不到回 None。

    只該拿容器裡的文字來找 —— 國稅局的頁尾有一個「更新日期:115-10-14」，
    那是整個網站今天的日期，不是這一頁的。
    """
    for rx in (_ROC_DATE, _EN_DATE):
        m = rx.search(text)
        if not m:
            continue
        y, mo, d = (int(g) for g in m.groups())
        if y < 1911:
            y += 1911          # 民國紀年
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            continue
    return None


# --- 封鎖偵測 ---------------------------------------------------------

def looks_blocked(status: int, html: str) -> bool:
    """Cloudflare 之類的挑戰頁。這種頁面不繞過 —— 標記成 blocked 就好。"""
    head = html[:4000]
    return status in (403, 503) and (
        "Just a moment" in head or "challenges.cloudflare.com" in head or "cf-chl" in head)


# --- 引述比對 ---------------------------------------------------------

def match_key(text: str) -> str:
    """比對引述用的正規化：NFKC（全形轉半形）後拿掉所有空白。

    網頁的斷行位置會變、全形與半形會混用（「300萬」與「300 萬」），
    這些都不是規則變了。拿掉空白後比對，只有字真的變了才會對不上。
    """
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text or ""))
