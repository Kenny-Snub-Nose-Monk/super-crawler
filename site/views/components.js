// 各頁共用的元件：活動卡片與清單列、指南列、fact 卡片、收藏鈕、試算比較。
//
// 一目瞭然的規則：每張活動卡都用同一個順序回答同樣的問題 ——
// 什麼時候（大號的日期數字＋時間）、在哪裡、要不要錢、聽得懂嗎。
// 年報的版面不放插圖：日期本身就是視覺，清單照日子分組，像年報的行事曆那一頁。

import { h, icon, icons } from "../lib/dom.js";
import { taipeiParts, addDays } from "../lib/time.js";
import {
  formatWhen, formatPrice, isEnglishFriendly, isOnline, isNew, placeName, areaName,
  typeMeta, sourceLabel, dateParts, money, pct, publisherEn, shortDate,
} from "../lib/format.js";
import { isSaved, toggleSaved } from "../lib/saved.js";
import { factTitle, inline } from "../lib/guides.js";
import { estimate, resolveParams } from "../lib/tax.js";

export const eventHref = (ev) => `#/event/${encodeURIComponent(ev.uid)}`;

/** 卡片上顯示的標題：有英文標題就用英文（對象是外國人），沒有就用原文 */
export const displayTitle = (ev) => ev.title_en || ev.title;

export function saveButton(kind, id, label) {
  const on = isSaved(kind, id);
  const btn = h("button", {
    type: "button", class: "save-btn", "aria-pressed": String(on),
    "aria-label": `${on ? "Remove from saved" : "Save"}: ${label || ""}`.trim(),
  });
  btn.innerHTML = icons.bookmark;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = toggleSaved(kind, id);
    btn.setAttribute("aria-pressed", String(now));
    btn.setAttribute("aria-label", `${now ? "Remove from saved" : "Save"}: ${label || ""}`.trim());
  });
  return btn;
}

/** 價格、語言、線上、新增 —— 每張卡固定這幾種標籤，固定這個順序 */
export function tags(ev, { now = Date.now() } = {}) {
  const out = [];
  const p = formatPrice(ev);
  if (p.cls === "free") out.push(h("span", { class: "tag free" }, "Free"));
  else if (p.known) out.push(h("span", { class: "tag price" }, shortPrice(p.text)));
  else out.push(h("span", { class: "tag unknown", title: "The listing doesn't say — that isn't the same as free" }, "Price not listed"));
  if (isEnglishFriendly(ev)) out.push(h("span", { class: "tag en" }, "English-friendly"));
  if (isOnline(ev)) out.push(h("span", { class: "tag online" }, "Online"));
  if (ev.status === "expired") out.push(h("span", { class: "tag unknown" }, "Ended"));
  else if (ev.status === "cancelled") out.push(h("span", { class: "tag unknown" }, "Cancelled"));
  else if (isNew(ev, now)) out.push(h("span", { class: "tag new", title: "Found by this week's crawl" }, "New"));
  return h("div", { class: "tags" }, out);
}

function shortPrice(text) {
  const t = String(text).trim();
  return t.length > 18 ? `${t.slice(0, 17)}…` : t;
}

function whenLine(ev) {
  const s = dateParts(ev.starts_at);
  const when = formatWhen(ev);
  if (!s) return "Date not listed";
  if (ev.status === "ongoing") return when.end ? `Until ${when.end.dayMonth}` : "On now";
  return `${s.weekday} ${s.day} ${s.month}${s.time ? ` · ${s.time}` : ""}`;
}

/** 清單上的地點：英文的行政區放前面（截斷時留下的是讀得懂的那一半），場地原文在後 */
function whereLine(ev) {
  if (isOnline(ev)) return "Online";
  const parts = [areaName(ev), placeName(ev)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Location not listed";
}

function metaLines(ev, { when = true } = {}) {
  return h("p", { class: "meta" },
    when ? h("span", null, icon("clock"), h("span", { class: "t" }, whenLine(ev))) : null,
    h("span", null, icon(isOnline(ev) ? "globe" : "pin"), h("span", { class: "t", title: whereLine(ev) }, whereLine(ev))));
}

/** 日期數字：星期、大號的日、月。進行中的活動寫「On now / to 3 Nov」 */
function dateFigure(ev, cls) {
  const s = dateParts(ev.starts_at);
  const when = formatWhen(ev);
  if (ev.status === "ongoing") {
    return h("div", { class: `${cls} on` }, h("span", { class: "w" }, "On now"), h("span", { class: "d" }, when.end ? `to ${when.end.dayMonth}` : "Daily"));
  }
  if (!s) return h("div", { class: cls }, h("span", { class: "w" }, "Date"), h("span", { class: "m" }, "TBC"));
  return h("div", { class: cls }, h("span", { class: "w" }, s.weekday), h("span", { class: "d" }, s.day), h("span", { class: "m" }, s.month));
}

/** 時間欄（行事曆分組裡用：日期已經在組的標題上了） */
function timeFigure(ev) {
  const s = dateParts(ev.starts_at);
  const when = formatWhen(ev);
  if (ev.status === "ongoing") return h("div", { class: "row-time on" }, h("span", { class: "t" }, "Until"), h("span", { class: "s" }, when.end ? when.end.dayMonth : "further notice"));
  return h("div", { class: "row-time" }, h("span", { class: "t" }, s && s.time ? s.time : "All day"));
}

export function eventCard(ev, opts = {}) {
  const s = dateParts(ev.starts_at);
  return h("article", { class: "card", dataset: { uid: ev.uid } },
    h("a", { class: "card-link", href: eventHref(ev) },
      h("div", { class: "card-top" },
        dateFigure(ev, "card-date"),
        s && ev.status !== "ongoing" ? h("span", { class: "card-time" }, s.time || "All day") : null),
      h("div", { class: "card-body" },
        h("p", { class: "card-type" }, typeMeta(ev.type).en),
        h("h3", { class: "card-title" }, displayTitle(ev)),
        metaLines(ev, { when: false }),
        tags(ev, opts))),
    saveButton("events", ev.uid, displayTitle(ev)));
}

export function eventRow(ev, opts = {}) {
  const t = typeMeta(ev.type);
  return h("li", { class: `row${opts.timeOnly ? " timed" : ""}`, dataset: { uid: ev.uid } },
    h("a", { class: "row-link", href: eventHref(ev) },
      opts.timeOnly ? timeFigure(ev) : dateFigure(ev, "row-date"),
      h("div", { class: "row-main" },
        h("p", { class: "row-type" }, t.en, " · ", sourceLabel(ev.source_platform)),
        h("h3", { class: "row-title" }, displayTitle(ev)),
        metaLines(ev, { when: !opts.timeOnly }),
        tags(ev, opts))),
    saveButton("events", ev.uid, displayTitle(ev)));
}

/** 活動開始那天（台北時間）；進行中的活動歸到「On now」 */
function dayKey(ev) {
  if (ev.status === "ongoing") return "ongoing";
  return ev.starts_at ? taipeiParts(new Date(ev.starts_at)).ymd : "tbc";
}

function dayHead(key, sample) {
  if (key === "ongoing") return h("h3", { class: "day-head" }, h("span", { class: "day-d" }, "On now"), h("span", { class: "day-w" }, "Running today, until their end dates"));
  if (key === "tbc") return h("h3", { class: "day-head" }, h("span", { class: "day-d" }, "TBC"), h("span", { class: "day-w" }, "Date not listed"));
  const today = taipeiParts().ymd;
  const s = dateParts(sample.starts_at);
  const rel = key === today ? "Today" : key === addDays(today, 1) ? "Tomorrow" : null;
  const long = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", weekday: "long", month: "long" }).formatToParts(new Date(sample.starts_at));
  const weekday = long.find((p) => p.type === "weekday").value;
  const month = long.find((p) => p.type === "month").value;
  return h("h3", { class: "day-head" },
    h("span", { class: "day-d" }, s.day),
    h("span", { class: "day-w" }, `${weekday}, ${month}`, rel ? h("span", { class: "day-rel" }, rel) : null));
}

/**
 * 照日子分組的行事曆：每一天一個大號的日期，底下是那天的活動（只寫時間）。
 * 分批顯示：先畫 pageSize 筆，按鈕再追加 —— 追加的第一筆跟上一批同一天時，接在同一組裡。
 */
export function agenda(events, { pageSize = 30, now } = {}) {
  const wrap = h("div", { class: "agenda" });
  let shown = 0, lastKey = null, lastMonth = null, list = null;
  const btn = h("button", { type: "button", class: "more-btn" });
  const more = () => {
    for (const ev of events.slice(shown, shown + pageSize)) {
      const key = dayKey(ev);
      if (key !== lastKey) {
        // 換月的地方加一條月份線，31 之後接 8 才不會看起來像倒退
        const month = /^\d{4}-\d{2}/.test(key) ? key.slice(0, 7) : null;
        if (month && lastMonth && month !== lastMonth) {
          const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", month: "long", year: "numeric" }).format(new Date(ev.starts_at));
          wrap.insertBefore(h("h3", { class: "month-head" }, label), btn);
        }
        if (month) lastMonth = month;
        list = h("ol", { class: "rows" });
        wrap.insertBefore(h("section", { class: "day" }, dayHead(key, ev), list), btn);
        lastKey = key;
      }
      list.append(eventRow(ev, { now, timeOnly: key !== "tbc" }));
    }
    shown = Math.min(events.length, shown + pageSize);
    btn.hidden = shown >= events.length;
    btn.textContent = `Show more (${events.length - shown} left)`;
  };
  wrap.append(btn);
  btn.addEventListener("click", more);
  more();
  return wrap;
}

/** 不分組的清單（混了不同日子、而且數量少的地方用） */
export function pagedRows(events, { pageSize = 30, row = eventRow, now } = {}) {
  const list = h("ol", { class: "rows" });
  const wrap = h("div", null, list);
  let shown = 0;
  const btn = h("button", { type: "button", class: "more-btn" });
  const more = () => {
    const next = events.slice(shown, shown + pageSize);
    list.append(...next.map((ev) => row(ev, { now })));
    shown += next.length;
    btn.hidden = shown >= events.length;
    btn.textContent = `Show more (${events.length - shown} left)`;
  };
  btn.addEventListener("click", more);
  more();
  wrap.append(btn);
  return wrap;
}

export function emptyState(text, _icon, action) {
  return h("div", { class: "empty" }, h("p", null, text), action || null);
}

export function guideRow(g, n, { start = false } = {}) {
  return h("li", { class: start ? "start" : null },
    h("a", { href: `#/guide/${g.slug}` },
      h("span", { class: "t" }, g.title, start ? h("span", { class: "start-label" }, "Start here") : null),
      h("span", { class: "s" }, g.subtitle),
      h("span", { class: "r" }, `${g.reading_minutes} min`)));
}

export function verifyBadge(fact) {
  if (!fact) return null;
  const src = fact.sources && fact.sources[0];
  const text = fact.status === "verified"
    ? `Checked ${fact.checked_at ? shortDate(fact.checked_at) : ""}${src ? ` · ${publisherEn(src.publisher)}` : ""}`
    : fact.status === "drifted" ? "Official page changed — under review" : "Not automatically checked";
  const el = h("span", { class: `verify ${fact.status}`, title: factTitle(fact) });
  if (src && src.url) el.append(h("a", { href: src.url, target: "_blank", rel: "noopener", title: src.title_en || src.title }, text));
  else el.append(text);
  return el;
}

export function factCard(fact, ctx) {
  if (!fact) return null;
  const i = ctx && ctx.facts ? Object.keys(ctx.facts).indexOf(fact.id) : -1;
  return h("div", { class: "fact-card" },
    h("div", { class: "v" }, fact.display, i >= 0 ? h("span", { class: "fact-no" }, `F${i + 1}`) : null),
    h("div", { class: "l" }, fact.label),
    fact.note ? h("div", { class: "note" }, inline(fact.note, ctx)) : null,
    verifyBadge(fact));
}

/** 指南裡的試算範例：同一支 estimate()，跟試算頁的數字永遠一致；用長條一眼看出差多少 */
export function calcBlock(spec, state) {
  const items = spec.compare || [{ label: spec.label || "Estimated tax", input: spec.input }];
  const results = items.map((item) => ({ item, r: estimate(item.input, resolveParams(state.content.tax, item.input.year)) }));
  const max = Math.max(...results.map((x) => x.r.total), 1);
  const min = Math.min(...results.map((x) => x.r.total));
  // 只有一個結果時不畫長條 —— 沒有可以比的對象，滿格的長條只是裝飾
  const single = results.length === 1;
  const rows = results.map(({ item, r }) =>
    h("div", { class: `compare-row${single ? " single" : r.total === min ? " better" : ""}` },
      h("span", { class: "compare-label" }, item.label),
      single ? null : h("span", { class: "compare-bar", "aria-hidden": "true" }, h("span", { style: `width:${Math.max(3, (r.total / max) * 100)}%` })),
      h("span", { class: "compare-value" }, money(r.total), h("small", null, `${pct(r.effectiveRate, 1)} of income`))));
  const q = new URLSearchParams();
  const last = items[items.length - 1].input;
  for (const [k, v] of Object.entries(last)) q.set(k, v === true ? "1" : String(v));
  const diff = results.length === 2 ? Math.abs(results[0].r.total - results[1].r.total) : 0;
  return h("figure", { class: "compare" },
    spec.title ? h("figcaption", { class: "compare-title" }, spec.title) : null,
    rows,
    h("p", { class: "compare-foot" },
      diff ? h("span", { class: "muted" }, `Difference: ${money(diff)} a year. `) : null,
      h("a", { href: `#/tax/calculator?${q}` }, "Try it with your numbers", icon("arrow"))));
}
