// 各頁共用的元件：活動卡片與清單列、指南列、fact 卡片、收藏鈕、試算比較。
//
// 一目瞭然的規則：每張活動卡都用同一個順序回答同樣的問題 ——
// 什麼時候（日期徽章＋時間）、在哪裡、要不要錢、聽得懂嗎。

import { h, html, icon, icons } from "../lib/dom.js";
import { motif } from "../lib/motifs.js";
import {
  formatWhen, formatWhere, formatPrice, isEnglishFriendly, isOnline, isNew,
  typeMeta, sourceLabel, dateParts, money, pct, publisherEn, shortDate,
} from "../lib/format.js";
import { isSaved, toggleSaved } from "../lib/saved.js";
import { factTitle, inline } from "../lib/guides.js";
import { estimate, resolveParams } from "../lib/tax.js";

export const eventHref = (ev) => `#/event/${encodeURIComponent(ev.uid)}`;

/** 卡片上顯示的標題：有英文標題就用英文（對象是外國人），沒有就用原文 */
export const displayTitle = (ev) => ev.title_en || ev.title;

export const GUIDE_ICONS = {
  "tax-in-taiwan": "compass",
  "183-day-rule": "calendar",
  "tax-rates": "percent",
  "how-to-file": "file",
  "employer-withholding": "briefcase",
  "tax-benefits": "card",
  "english-friendly-taipei": "people",
};

export function sectionHead(title, { href, more = "View all", count } = {}) {
  return h("div", { class: "section-head" },
    h("h2", null, title),
    count != null ? h("span", { class: "count-pill" }, String(count)) : null,
    href ? h("a", { class: "more", href }, more, icon("arrow")) : null);
}

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

function dateBadge(ev) {
  const s = dateParts(ev.starts_at);
  const when = formatWhen(ev);
  if (ev.status === "ongoing") {
    return h("span", { class: "date-badge on" }, h("span", { class: "w" }, "On now"),
      h("span", { class: "d" }, when.end ? `to ${when.end.dayMonth}` : "Daily"));
  }
  if (!s) return null;
  return h("span", { class: "date-badge" }, h("span", { class: "w" }, s.weekday), h("span", { class: "d" }, s.day), h("span", { class: "m" }, s.month));
}

function whenLine(ev) {
  const s = dateParts(ev.starts_at);
  const when = formatWhen(ev);
  if (!s) return "Date not listed";
  if (ev.status === "ongoing") return when.end ? `Until ${when.end.dayMonth}` : "On now";
  return `${s.weekday} ${s.day} ${s.month}${s.time ? ` · ${s.time}` : ""}`;
}

function metaLines(ev) {
  return h("p", { class: "meta" },
    h("span", null, icon("clock"), h("span", { class: "t" }, whenLine(ev))),
    h("span", null, icon(isOnline(ev) ? "globe" : "pin"), h("span", { class: "t" }, formatWhere(ev))));
}

export function eventCard(ev, opts = {}) {
  return h("article", { class: "card", dataset: { uid: ev.uid } },
    h("a", { class: "card-link", href: eventHref(ev) },
      html("div", { class: "card-media" }, motif(ev.type, ev.uid)),
      h("div", { class: "card-body" },
        h("h3", { class: "card-title" }, displayTitle(ev)),
        metaLines(ev),
        tags(ev, opts))),
    // 日期徽章疊在圖上，但不在連結裡面也沒關係 —— 它只是資訊
    (() => { const b = dateBadge(ev); if (b) b.setAttribute("aria-hidden", "true"); return b; })(),
    saveButton("events", ev.uid, displayTitle(ev)));
}

export function eventRow(ev, opts = {}) {
  const s = dateParts(ev.starts_at);
  const t = typeMeta(ev.type);
  const ongoing = ev.status === "ongoing";
  const when = formatWhen(ev);
  const dateTile = ongoing
    ? h("div", { class: "row-date on" }, h("span", { class: "w" }, "On now"), h("span", { class: "d" }, when.end ? `to ${when.end.dayMonth}` : "Daily"))
    : s ? h("div", { class: "row-date" }, h("span", { class: "w" }, s.weekday), h("span", { class: "d" }, s.day), h("span", { class: "m" }, s.month))
      : h("div", { class: "row-date" }, h("span", { class: "w" }, "Date"), h("span", { class: "m" }, "TBC"));
  return h("li", { class: "row", dataset: { uid: ev.uid } },
    h("a", { class: "row-link", href: eventHref(ev) },
      dateTile,
      h("div", { class: "row-main" },
        h("p", { class: "row-type" }, icon(t.icon), t.en, " · ", sourceLabel(ev.source_platform)),
        h("h3", { class: "row-title" }, displayTitle(ev)),
        metaLines(ev),
        tags(ev, opts)),
      html("div", { class: "row-thumb", "aria-hidden": "true" }, motif(ev.type, ev.uid))),
    saveButton("events", ev.uid, displayTitle(ev)));
}

/** 分批顯示的清單：先畫 pageSize 筆，按鈕再追加 */
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

export function emptyState(text, iconName = "search") {
  return h("div", { class: "empty" }, icon(iconName), h("p", { style: "margin:0" }, text));
}

export function guideRow(g, n, { start = false } = {}) {
  return h("li", { class: start ? "start" : null },
    h("a", { href: `#/guide/${g.slug}` },
      h("span", { class: "n" }, icon(GUIDE_ICONS[g.slug] || "file")),
      h("span", null, h("span", { class: "t" }, g.title), h("span", { class: "s" }, g.subtitle)),
      h("span", { class: "r" }, `${g.reading_minutes} min read`)));
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
  return h("div", { class: "fact-card" },
    h("div", { class: "v" }, fact.display),
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
      h("a", { href: `#/tax/calculator?${q}` }, "Try it with your numbers →")));
}
