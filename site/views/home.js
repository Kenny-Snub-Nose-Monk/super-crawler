// 首頁：一進來就問「今年在台灣待了幾天」，格子跟著填，馬上說出居住者與否。
// 下面是今年的稅務時程與關鍵數字、指南，最後才是這個週末的活動。

import { h, icon } from "../lib/dom.js";
import { queryEvents } from "../query.js";
import { taipeiParts, windows, addDays } from "../lib/time.js";
import { isEnglishFriendly, isOnline, formatPrice, shortDate } from "../lib/format.js";
import { residency, resolveParams } from "../lib/tax.js";
import { eventRow, guideRow } from "./components.js";
import { nextCalendarItem, calendarList, keyFigures } from "./tax.js";
import { yearGrid, dayOfYear, factMark, chapter, figure } from "./report.js";

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

/** 天數 → 首頁的身分說明。今年還沒過完，所以要說「還差幾天、待到哪天就夠」。 */
export function statusFor(days, { year, todayYmd, P, total }) {
  const res = residency(days, P);
  const line = P.residency_days.value;
  const left = Math.max(0, total - dayOfYear(todayYmd));
  if (res.resident) {
    return { word: "Resident", tone: "red", text: `Past ${line} days, so you're taxed like a local: progressive rates on net income, and you file each May.` };
  }
  const need = line - res.days;
  if (need <= left) {
    const by = addDays(todayYmd, need);
    return { word: "Not yet", tone: null, text: `${need} more days in Taiwan makes you a resident for ${year}. Staying without a break, that's ${shortDate(`${by}T12:00:00+08:00`)}.` };
  }
  return { word: "Non-resident", tone: null, text: `Fewer than ${line} days are possible in ${year} now. Your Taiwan salary is taxed by flat withholding.` };
}

export function render({ state, params }) {
  const now = new Date();
  const t = taipeiParts(now);
  const tax = state.content.tax;
  const year = Number(t.ymd.slice(0, 4));
  const P = resolveParams(tax, year);
  const grid = yearGrid({ year, todayYmd: t.ymd, line: P.residency_days.value });

  // 預設：從 1 月 1 日起每天都在（入境當天不算，所以是今天是第幾天減一）
  const elapsed = Math.max(0, dayOfYear(t.ymd) - 1);
  const fromUrl = params.get("days");
  const start = fromUrl !== null && fromUrl !== "" ? Math.max(0, Number(fromUrl) || 0) : elapsed;

  const input = h("input", {
    id: "days", class: "days-input", type: "number", inputmode: "numeric", min: "0", max: String(grid.total),
    value: String(start), "aria-describedby": "days-hint",
  });
  const unit = h("span", { class: "days-unit" });
  const sizer = h("span", { class: "days-input days-sizer", "aria-hidden": "true" });
  const hint = h("p", { class: "days-hint", id: "days-hint" });

  const statusSlot = h("div", { class: "fig" });
  const estimateLink = h("a", { class: "fig link" });

  const paint = (days, { sync = true } = {}) => {
    const d = Math.max(0, Math.min(grid.total, Math.floor(Number(days) || 0)));
    grid.update(d);
    // 欄寬跟著數字的實際寬度走，「days」才會緊貼在數字後面（用同字型的影子量）
    sizer.textContent = String(input.value || d);
    if (sizer.offsetWidth) input.style.width = `${sizer.offsetWidth + 6}px`;
    unit.textContent = d === 1 ? "day" : "days";
    hint.textContent = String(d) === String(elapsed) && fromUrl === null
      ? "Filled in as if you've been here since 1 January. Change it to your own count."
      : "Arrival days don't count; departure days do.";
    const s = statusFor(d, { year, todayYmd: t.ymd, P, total: grid.total });
    statusSlot.replaceChildren(
      h("p", { class: "fig-l" }, `Your status for ${year}`),
      h("p", { class: `fig-v${s.tone ? ` ${s.tone}` : ""}` }, s.word, factMark("residency_days", state)),
      h("p", { class: "fig-t" }, s.text));
    estimateLink.href = `#/tax/calculator?year=${year}&days=${d}`;
    estimateLink.replaceChildren(
      h("p", { class: "fig-v" }, "Estimate your tax", h("span", { class: "arrow" }, icon("arrow"))),
      h("p", { class: "fig-t" }, `Uses your ${d} days. Every line shows the official source it comes from.`));
    if (sync) window.site.navigate("/", { days: d }, { replace: true, render: false });
  };
  input.addEventListener("input", () => paint(input.value));

  const next = nextCalendarItem(tax.calendar, t.ymd);
  const deadline = next
    ? h("div", { class: "fig" },
      h("p", { class: "fig-l" }, "Next on the tax calendar"),
      h("p", { class: "fig-v" }, next.whenLabel, next.item.fact ? factMark(next.item.fact, state) : null),
      h("p", { class: "fig-t" }, next.item.title))
    : figure({ label: "Next on the tax calendar", value: "Nothing due", text: "The calendar for next year appears once it's announced." });

  const ask = h("section", { class: "wrap ask" },
    h("div", { class: "ask-q" },
      h("label", { for: "days" }, h("h1", null, `How many days have you been in Taiwan in ${year}?`)),
      h("div", { class: "days-field" }, input, unit, sizer),
      hint,
      h("p", { class: "days-alt" }, "Not sure? ", h("a", { href: `#/tax/calculator?year=${year}&mode=trips` }, "Count from your trips instead"), ": add each arrival and departure and we'll do the counting.")),
    h("div", { class: "ask-grid" }, grid.el),
    h("div", { class: "figs" }, statusSlot, deadline, estimateLink));

  paint(start, { sync: false });

  // --- 今年的稅務 ---
  const year2 = chapter(`Tax year ${year}`,
    h("div", { class: "split" },
      h("div", null, h("h3", { class: "sub-h" }, "Calendar"), calendarList(tax.calendar, t.ymd, { facts: state.facts }, { compact: true })),
      h("div", null, h("h3", { class: "sub-h" }, "Key figures"), keyFigures(state, year))),
    { aside: h("p", { class: "chapter-note" }, `Figures re-read from official pages every Thursday. Last check ${shortDate(tax.checked_at)}.`) });

  // --- 指南 ---
  const taxGuides = state.guides.filter((g) => g.kind === "tax");
  const guides = chapter("Guides",
    h("ol", { class: "guide-list" }, taxGuides.map((g, i) => guideRow(g, i + 1, { start: g.start_here }))),
    { aside: h("a", { class: "chapter-link", href: "#/tax" }, "Tax overview", icon("arrow")) });

  // --- 這個週末 ---
  const picks = weekendPicks(state.events, now, 5);
  const allHref = picks.label === "This weekend"
    ? `#/search?q=${encodeURIComponent("this weekend")}`
    : `#/events?start_after=${picks.window.start.slice(0, 10)}&start_before=${picks.window.end.slice(0, 10)}&exclude_online=1`;
  const life = state.guides.find((g) => g.kind === "life");
  const weekend = chapter(picks.label,
    picks.events.length ? h("ol", { class: "rows" }, picks.events.map((ev) => eventRow(ev, { now: now.getTime() })))
      : h("p", { class: "muted" }, "Nothing listed yet. The next crawl runs on Thursday night."),
    { aside: h("div", null,
      h("p", { class: "chapter-note" }, `${picks.total} events in Taipei and New Taipei, collected from public listings.`),
      h("a", { class: "chapter-link", href: allHref }, `See all ${picks.total}`, icon("arrow")),
      life ? h("a", { class: "chapter-link", href: `#/guide/${life.slug}` }, life.title, icon("arrow")) : null) });

  return { title: null, node: h("div", { class: "home" }, ask, year2, guides, weekend), after: () => paint(input.value, { sync: false }) };
}
