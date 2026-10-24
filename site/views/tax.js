// 稅務首頁：從哪裡開始讀、試算、行事曆、今年的關鍵數字、說明會、聯絡窗口、來源新鮮度。

import { h, icon } from "../lib/dom.js";
import { taipeiParts, daysBetween } from "../lib/time.js";
import { shortDate, plural } from "../lib/format.js";
import { inline } from "../lib/guides.js";
import { guideRow, factCard, eventRow } from "./components.js";
import { factMark, chapter } from "./report.js";
import { residencyAsk } from "./residency.js";

/** 行事曆裡今天之後的第一件事 */
export function nextCalendarItem(items, todayYmd) {
  const upcoming = items.filter((it) => (it.end || it.date) >= todayYmd).sort((a, b) => a.date.localeCompare(b.date));
  const item = upcoming[0];
  if (!item) return null;
  const inside = item.end && item.date <= todayYmd;
  const d = daysBetween(todayYmd, item.date);
  const whenLabel = inside ? "Happening now" : d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 60 ? `In ${d} days` : shortDate(`${item.date}T00:00:00+08:00`);
  return { item, whenLabel, days: d };
}

/** 行事曆：日期一欄、事情一欄。compact 時只放下一件與之後的事，說明拿掉 */
export function calendarList(items, todayYmd, ctx, { compact = false } = {}) {
  const next = nextCalendarItem(items, todayYmd);
  const fmt = (ymd, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${ymd}T00:00:00Z`));
  const shown = compact ? items.filter((it) => (it.end || it.date) >= todayYmd).slice(0, 5) : items;
  return h("ol", { class: `timeline${compact ? " compact" : ""}` }, shown.map((it) => {
    const past = (it.end || it.date) < todayYmd;
    const isNext = next && next.item === it;
    const day = fmt(it.date, { day: "numeric", month: "short" });
    const end = it.end ? fmt(it.end, { day: "numeric", month: "short" }) : null;
    return h("li", { class: [past ? "past" : "", isNext ? "next" : ""].join(" ").trim() || null },
      h("span", { class: "when" }, `${it.approx ? "~ " : ""}${day}${end ? ` – ${end}` : ""}`, h("small", null, fmt(it.date, { year: "numeric" }))),
      h("div", null,
        h("p", { class: "what" }, it.title, it.fact ? factMark(it.fact, ctx) : null),
        compact ? null : h("p", { class: "why" }, inline(it.text, ctx)),
        isNext ? h("span", { class: "next-pill" }, next.whenLabel) : null));
  }));
}

/** 今年的關鍵數字：一行一個，數字靠右對齊在同一欄 */
export function keyFigures(state, year) {
  const ids = ["residency_days", `exemption_${year}`, `salary_deduction_${year}`, `standard_single_${year}`, "nr_salary_rate", `nr_threshold_${year}`, "special_talent_threshold"]
    .filter((fid) => state.facts[fid]);
  return h("table", { class: "figures-table" },
    h("tbody", null, ids.map((fid) => {
      const f = state.facts[fid];
      return h("tr", { class: f.status },
        h("th", { scope: "row" }, f.label),
        h("td", null, f.display, factMark(fid, state)));
    })));
}

export function render({ state, params }) {
  const today = taipeiParts().ymd;
  const year = Number(today.slice(0, 4));
  const ctx = { facts: state.facts };
  const taxGuides = state.guides.filter((g) => g.kind === "tax");
  const start = taxGuides.find((g) => g.start_here) || taxGuides[0];
  const tax = state.content.tax;
  const head = h("header", { class: "wrap page-head" },
    h("h1", null, "Tax in Taiwan"),
    h("p", { class: "lede" },
      "Whether you file, how much you pay and which rules apply all start with one question: how many days you spend here. ",
      "Every figure is traced to an official source and re-checked every week."));
  // 天數工具（原本在首頁）：問題、格子、身分與下一個期限
  const ask = residencyAsk({ state, params, route: "/tax" });

  const reading = chapter("Guides",
    h("ol", { class: "guide-list" }, taxGuides.map((g, i) => guideRow(g, i + 1, { start: g === start }))),
    { aside: h("p", { class: "chapter-note desktop-only" }, "On a computer, connect Claude Code or Claude Desktop (see the home page) and ask. Claude answers from the same guides, figures and calculator, and shows where each answer comes from.") });

  const calendar = chapter("Tax calendar",
    h("div", { class: "split" },
      calendarList(tax.calendar, today, ctx),
      h("div", null, h("h3", { class: "sub-h" }, `Key figures, tax year ${year}`), keyFigures(state, year))),
    { id: "calendar" });

  // Talent Taiwan 的稅務說明會（爬蟲標 topic:tax）
  const seminars = state.events.filter((e) => (e.tags || []).includes("topic:tax")).sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""));
  const upcomingSem = seminars.filter((e) => e.status === "upcoming" || e.status === "ongoing");
  const lastSem = seminars.find((e) => e.status === "expired");
  const seminarSection = chapter("Tax seminars",
    upcomingSem.length
      ? h("ol", { class: "rows" }, upcomingSem.map((ev) => eventRow(ev)))
      : h("p", { class: "body-text" },
        "No tax seminars are scheduled right now. ",
        lastSem ? [`Talent Taiwan's last one, “${lastSem.title_en || lastSem.title}”, was on ${shortDate(lastSem.starts_at)}. `, "They tend to run in the weeks before the May filing season; new ones appear here as soon as the weekly crawl finds them."] : "They tend to run before the May filing season."));

  const help = chapter("Getting help",
    h("div", null,
      h("div", { class: "fact-cards" }, ["ntb_taipei_desk", "ntb_phone"].map((fid) => factCard(state.facts[fid], ctx))),
      h("p", { class: "body-text" },
        "The National Taxation Bureau of Taipei publishes an English site and a bilingual filing handbook each year: ",
        h("a", { href: "https://www.ntbt.gov.tw/English/htmlList/0862921c90af4c398eb037f8afe4e796", target: "_blank", rel: "noopener" }, "NTB Taipei in English", icon("external")), ".")));

  const ok = tax.sources.filter((s) => s.status === "ok").length;
  const verified = Object.values(state.facts).filter((f) => f.status === "verified").length;
  const fresh = chapter("How we keep this current",
    h("div", null,
      h("p", { class: "body-text" },
        `Every week the crawler re-reads ${plural(ok, "official page")} (the Ministry of Finance, the National Taxation Bureau of Taipei, the gazette, the law database and Talent Taiwan) and checks that the sentence behind each of our ${verified} tax figures is still there, word for word. `,
        `If a page changes, the figures that depend on it are marked “needs review” until a person re-checks them. Last check: ${shortDate(tax.checked_at)}.`),
      h("a", { class: "chapter-link", href: "#/about" }, "See every source and its status", icon("arrow"))));

  return { title: "Tax", node: h("div", null, head, ask.node, reading, calendar, seminarSection, help, fresh), after: ask.after };
}
