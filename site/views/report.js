// 年報版面共用的零件：一年一格一天的格子、數字旁的註記號、點註記號打開的原文小卡。
//
// 設計是「把你的課稅年度排成一份年報」：大數字、嚴格的格線、每個數字都有註腳。
// 註記號 F12 是 fact 在 facts.yaml 裡的順序 —— 同一個數字在每一頁都是同一個號碼。

import { h, icon } from "../lib/dom.js";
import { shortDate, publisherEn, sourceTitle } from "../lib/format.js";
import { factTitle } from "../lib/guides.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLengths(year) {
  return MONTHS.map((_, m) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate());
}

/** 某天是一年中的第幾天（1 起算） */
export function dayOfYear(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

export function daysInYear(year) {
  return monthLengths(year).reduce((a, b) => a + b, 0);
}

/**
 * 一年一格一天：12 列（月）× 31 欄。update(days) 依序填滿前 N 格，
 * 第 183 格框起來（居住者的線），今天之後的格子是「推估到年底」的淺色。
 * 格子按順序填，不代表哪幾天 —— 實際日期要在試算頁用入出境紀錄算。
 */
export function yearGrid({ year, todayYmd, line = 183, compact = false }) {
  const lengths = monthLengths(year);
  const total = lengths.reduce((a, b) => a + b, 0);
  const today = todayYmd && todayYmd.startsWith(String(year)) ? dayOfYear(todayYmd) : todayYmd && todayYmd > `${year}` ? total : 0;
  const cells = [];
  let n = 0;
  const rows = lengths.map((len, m) => {
    const row = h("div", { class: "yg-row" }, h("span", { class: "yg-m" }, MONTHS[m]));
    for (let d = 1; d <= 31; d++) {
      if (d > len) { row.append(h("i", { class: "yg-c void" })); continue; }
      n++;
      const c = h("i", { class: `yg-c${n > today ? " future" : ""}${n === today ? " today" : ""}${n === line ? " line" : ""}` });
      cells.push(c);
      row.append(c);
    }
    return row;
  });
  const count = h("span", { class: "yg-count" });
  const lineDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(Date.UTC(year, 0, line)));
  const lineKey = h("span", { class: "yg-linekey" });
  const el = h("figure", { class: `year-grid${compact ? " compact" : ""}`, role: "img" },
    h("figcaption", { class: "yg-head" }, h("span", null, `${year}, one cell per day`), count),
    h("div", { class: "yg-rows" }, rows),
    h("p", { class: "yg-key" },
      h("span", null, h("i", { class: "yg-c line" }), lineKey),
      today && today < total ? h("span", null, h("i", { class: "yg-c today" }), "Today") : null));

  let shown = 0;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const update = (days) => {
    const next = Math.max(0, Math.min(total, Math.floor(Number(days) || 0)));
    const lo = Math.min(shown, next), hi = Math.max(shown, next);
    const span = hi - lo || 1;
    for (let i = lo; i < hi; i++) {
      const c = cells[i];
      // 一格一格往前填（或往回退），整段最多 260ms
      const k = next > shown ? i - lo : hi - 1 - i;
      c.style.transitionDelay = reduce ? "0ms" : `${Math.round((k / span) * 260)}ms`;
      c.classList.toggle("on", i < next);
    }
    shown = next;
    count.textContent = `${next} of ${total}`;
    el.setAttribute("aria-label", `${next} of ${total} days in ${year}; ${next >= line ? "past" : "short of"} the ${line}-day line`);
    el.classList.toggle("crossed", next >= line);
    lineKey.textContent = next >= line ? `Day ${line} (${lineDate}) crossed: resident` : `Day ${line} (${lineDate}): the resident line`;
  };
  return { el, update, total, today };
}

/** fact id → 註記號（F 加上它在 facts.yaml 的順序） */
export function factNumber(fid, facts) {
  const i = Object.keys(facts).indexOf(fid);
  return i === -1 ? null : `F${i + 1}`;
}

/** 數字旁邊的註記號；按下去打開那一句官方原文 */
export function factMark(fid, state) {
  const fact = state.facts[fid];
  const no = factNumber(fid, state.facts);
  if (!fact || !no) return null;
  const b = h("button", {
    type: "button", class: `note-mark ${fact.status}`, dataset: { fact: fid },
    title: factTitle(fact), "aria-label": `Source for this figure (${no})`,
  }, fact.status === "verified" ? no : h("span", null, no, h("span", { class: "note-status" }, fact.status === "drifted" ? " needs review" : " not checked")));
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); showFact(fid, b, state); });
  return b;
}

let popover = null;

export function closePopover() {
  if (popover) { popover.remove(); popover = null; }
}

export function showFact(fid, anchor, state) {
  closePopover();
  const fact = state.facts[fid];
  if (!fact) return;
  const quote = fact.quotes && fact.quotes[0];
  const src = fact.sources.find((s) => quote && s.id === quote.source) || fact.sources[0];
  const zh = quote && /[一-鿿]/.test(quote.quote);
  const status = fact.status === "verified" ? "Checked against the official text"
    : fact.status === "drifted" ? "Needs review: the official page changed" : "Not automatically checked";
  popover = h("div", { class: "fact-pop", role: "dialog", "aria-label": fact.label },
    h("p", { class: `fact-pop-status ${fact.status}` }, h("span", { class: "no" }, factNumber(fid, state.facts)), status),
    h("p", { class: "fact-pop-v" }, fact.display),
    h("p", { class: "fact-pop-l" }, fact.label),
    fact.note ? h("p", { class: "fact-pop-note" }, fact.note) : null,
    quote ? h("p", { class: "quote-label" }, zh ? "Official text (in Chinese)" : "Official text") : null,
    quote ? h("blockquote", { lang: zh ? "zh-Hant" : "en" }, `“${quote.quote}”`) : null,
    src ? h("p", { class: "fact-pop-src" },
      h("a", { href: src.url, target: "_blank", rel: "noopener", title: src.title }, `${publisherEn(src.publisher)}, ${sourceTitle(src)}`, icon("external")),
      fact.checked_at ? h("span", null, ` · checked ${shortDate(fact.checked_at)}`) : null) : null);
  document.body.append(popover);
  const r = anchor.getBoundingClientRect();
  const top = window.scrollY + r.bottom + 10;
  const left = Math.min(Math.max(16, window.scrollX + r.left - 20), window.scrollX + document.documentElement.clientWidth - popover.offsetWidth - 16);
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

// 一個全域的監聽就好：點小卡以外、也不是點另一個數字時關掉。
// node 測試會 import 試算頁（進而 import 這支），那裡沒有 document
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (popover && !popover.contains(e.target) && !e.target.closest("[data-fact]")) closePopover();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });
  window.addEventListener("hashchange", closePopover);
}

/** 左欄標題、右欄內容的一節（年報的章） */
export function chapter(title, body, { id, aside } = {}) {
  return h("section", { class: "wrap chapter", id },
    h("div", { class: "chapter-head" }, h("h2", null, title), aside || null),
    h("div", { class: "chapter-body" }, body));
}

/** 年報式的一個數字：標籤、數字（可帶註記號）、一行說明 */
export function figure({ label, value, mark, text, href, tone }) {
  const inner = [
    label ? h("p", { class: "fig-l" }, label) : null,
    h("p", { class: `fig-v${tone ? ` ${tone}` : ""}` }, value, mark || null),
    text ? h("p", { class: "fig-t" }, text) : null,
  ];
  return href ? h("a", { class: "fig link", href }, inner) : h("div", { class: "fig" }, inner);
}
