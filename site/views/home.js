// 首頁：一句話說清楚這是什麼、搜尋、三個一眼就懂的數字，然後是這個週末、主題、稅務。

import { h, html, icon } from "../lib/dom.js";
import { queryEvents } from "../query.js";
import { taipeiParts, windows } from "../lib/time.js";
import { heroLight } from "../lib/motifs.js";
import { TOPICS } from "../lib/topics.js";
import { isEnglishFriendly, isOnline, formatPrice } from "../lib/format.js";
import { sectionHead, eventCard, eventRow, guideRow } from "./components.js";
import { nextCalendarItem } from "./tax.js";

const HINTS = [
  ["calendar", "This weekend", "this weekend"],
  ["chat", "Free & in English", "free english"],
  ["scale", "Am I a tax resident?", "183 days resident"],
  ["card", "Gold Card tax break", "gold card tax"],
  ["mountain", "Climbing", "climbing"],
  ["music", "Jazz tonight", "jazz tonight"],
];

/** 給「精選」用的分數：英文友善、實體、資訊完整的排前面。沒有熱門度資料，所以不叫「最熱門」。 */
export function pickScore(ev) {
  let s = 0;
  if (isEnglishFriendly(ev)) s += 2;
  if (!isOnline(ev)) s += 1;
  if (formatPrice(ev).known) s += 0.5;
  if (ev.venue || ev.address) s += 0.5;
  if (ev.description) s += 0.25;
  return s;
}

export function weekendPicks(events, now = new Date(), limit = 6) {
  const w = windows(now);
  let rows = queryEvents(events, { start_after: w.weekend.start, start_before: w.weekend.end }, now.getTime());
  rows = rows.filter((e) => e.status === "upcoming" || e.status === "ongoing");
  let label = "This weekend";
  if (rows.filter((e) => e.status === "upcoming").length < 3) {
    rows = queryEvents(events, { start_after: w.next7.start, start_before: w.next7.end }, now.getTime());
    label = "The next seven days";
  }
  // 首頁的週末精選只放實體活動 —— 線上課程多半是補習班的行銷，不是「出門」
  const upcoming = rows.filter((e) => e.status === "upcoming" && !isOnline(e));
  const ranked = upcoming
    .map((e, i) => ({ e, s: pickScore(e) - i * 0.002 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
  return { label, total: upcoming.length, events: ranked.slice(0, limit), window: label === "This weekend" ? w.weekend : w.next7 };
}

function glanceItem({ href, iconName, tint, num, label }) {
  return h("a", { class: "glance-item", href },
    h("span", { class: `glance-icon tint-${tint}` }, icon(iconName)),
    h("div", null, h("div", { class: "glance-num" }, num), h("div", { class: "glance-label" }, label)));
}

export function render({ state }) {
  const now = new Date();
  const t = taipeiParts(now);
  const w = windows(now);
  const dateLine = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", weekday: "long", day: "numeric", month: "long" }).format(now);

  // --- 主視覺 ---
  const input = h("input", { type: "search", name: "q", placeholder: "Search events and tax", "aria-label": "Search", autocomplete: "off", enterkeyhint: "search" });
  const form = h("form", { class: "searchbar", role: "search" }, icon("search"), input, h("button", { type: "submit" }, "Search"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    window.site.navigate("/search", { q: input.value.trim() });
  });
  const hero = h("section", { class: "hero" },
    html("div", { class: "hero-light", "aria-hidden": "true" }, heroLight()),
    h("div", { class: "hero-inner" },
      h("p", { class: "hero-date" }, `${dateLine} · Taipei`),
      h("h1", null, "Life in Taipei,", h("br"), "made clear."),
      h("p", { class: "hero-sub" }, "What's on this week — in English where possible — and straight answers on tax for people who just moved here."),
      form,
      h("div", { class: "hints" }, HINTS.map(([ic, label, q]) =>
        h("a", { class: "hint", href: `#/search?q=${encodeURIComponent(q)}` }, icon(ic), label)))));

  // --- 一眼看完：三個數字 ---
  const picks = weekendPicks(state.events, now);
  const weekendWord = picks.label === "This weekend" ? "this weekend" : "in the next 7 days";
  const englishCount = queryEvents(state.events, { start_after: picks.window.start, start_before: picks.window.end, tags: ["lang:en"] }, now.getTime())
    .filter((e) => e.status === "upcoming").length;
  const next = nextCalendarItem(state.content.tax.calendar, t.ymd);
  // 週末不夠三場時改成「接下來七天」—— 連結也要跟著換，不能連到一個空的搜尋
  const allHref = picks.label === "This weekend"
    ? `#/search?q=${encodeURIComponent("this weekend")}`
    : `#/events?start_after=${picks.window.start.slice(0, 10)}&start_before=${picks.window.end.slice(0, 10)}&exclude_online=1`;
  const glance = h("div", { class: "wrap" }, h("div", { class: "glance-strip" },
    glanceItem({ href: allHref, iconName: "calendar", tint: "sun", num: String(picks.total), label: `events ${weekendWord}` }),
    glanceItem({
      href: `#/search?q=${encodeURIComponent(picks.label === "This weekend" ? "english this weekend" : "english")}`,
      iconName: "chat", tint: "sky", num: String(englishCount), label: `English-friendly ${weekendWord}`,
    }),
    glanceItem({
      href: "#/tax", iconName: "file", tint: "leaf",
      num: next ? next.whenLabel : "Nothing due",
      label: next ? next.item.title : "Tax calendar",
    })));

  // --- 這個週末 ---
  const weekend = h("section", { class: "wrap section" },
    sectionHead(picks.label, { href: allHref, more: `See all ${picks.total}` }),
    picks.events.length ? h("div", { class: "cards three" }, picks.events.map((ev) => eventCard(ev, { now: now.getTime() })))
      : h("p", { class: "muted" }, "Nothing listed yet — the next crawl runs on Thursday night."));

  // --- 主題 ---
  const topicCounts = TOPICS.map((tp) => queryEvents(state.events, { types: tp.types, start_before: w.next30.end }, now.getTime()).length);
  const topics = h("section", { class: "wrap section" },
    sectionHead("Browse by topic", { href: "#/topics", more: "All topics" }),
    h("div", { class: "topics" }, TOPICS.map((tp, i) =>
      h("a", { class: "topic", href: `#/topic/${tp.id}` },
        h("span", { class: `topic-icon tint-${tp.tint}` }, icon(tp.icon)),
        h("span", { class: "topic-name" }, tp.name),
        h("span", { class: "topic-count" }, `${topicCounts[i]} in the next 30 days`)))));

  // --- 稅務 ---
  const taxGuides = state.guides.filter((g) => g.kind === "tax");
  const verified = Object.values(state.facts).filter((f) => f.status === "verified").length;
  const taxSection = h("section", { class: "wrap section" },
    sectionHead("Tax, made clear", { href: "#/tax", more: "Tax overview" }),
    h("p", { class: "section-sub" }, "Plain-English guides for foreign professionals. Every figure links to the official sentence behind it."),
    h("div", { class: "tax-grid" },
      h("ol", { class: "guide-list" }, taxGuides.map((g, i) => guideRow(g, i + 1, { start: g.start_here }))),
      h("div", { style: "display:grid;gap:16px" },
        h("a", { class: "tool-card", href: "#/tax/calculator" },
          h("div", null,
            h("h3", null, "Estimate your tax"),
            h("p", null, "Residency first, then the numbers. Takes about a minute.")),
          h("span", { class: "tool-icon" }, icon("calculator"))),
        h("div", { class: "notice" },
          h("span", { class: "glance-icon tint-leaf" }, icon("checkCircle")),
          h("div", null,
            h("h3", null, `${verified} figures checked this week`),
            h("p", null, "Rates, thresholds and deadlines are re-read from official pages every Thursday.")),
          null))));

  // --- 這週新抓到的 ---
  const fresh = state.events
    .filter((e) => e.status === "upcoming" && e.first_seen && now - Date.parse(e.first_seen) < 7 * 86400000)
    .sort((a, b) => pickScore(b) - pickScore(a))
    .slice(0, 5);
  const freshSection = fresh.length ? h("section", { class: "wrap section" },
    sectionHead("Just found", { href: "#/events?new=1", more: "Everything new" }),
    h("p", { class: "section-sub" }, "Added by this week's crawl."),
    h("ol", { class: "rows" }, fresh.map((ev) => eventRow(ev, { now: now.getTime() })))) : null;

  const life = state.guides.find((g) => g.kind === "life");
  const lifeSection = life ? h("section", { class: "wrap section" },
    sectionHead("Finding your people"),
    h("ol", { class: "guide-list" }, guideRow(life, 1))) : null;

  const page = h("div", null, hero, glance, weekend, topics, taxSection, freshSection, lifeSection);
  return { title: null, node: page };
}
