// 稅務首頁：從哪裡開始讀、試算、行事曆、今年的關鍵數字、說明會、聯絡窗口、來源新鮮度。

import { h, icon } from "../lib/dom.js";
import { taipeiParts, daysBetween } from "../lib/time.js";
import { shortDate, plural } from "../lib/format.js";
import { inline } from "../lib/guides.js";
import { sectionHead, guideRow, factCard, eventRow } from "./components.js";

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

export function calendarList(items, todayYmd, ctx) {
  const next = nextCalendarItem(items, todayYmd);
  const fmt = (ymd, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${ymd}T00:00:00Z`));
  return h("ol", { class: "timeline" }, items.map((it) => {
    const past = (it.end || it.date) < todayYmd;
    const isNext = next && next.item === it;
    const day = fmt(it.date, { day: "numeric", month: "short" });
    const end = it.end ? fmt(it.end, { day: "numeric", month: "short" }) : null;
    return h("li", { class: [past ? "past" : "", isNext ? "next" : ""].join(" ").trim() || null },
      h("span", { class: "when" }, `${it.approx ? "~ " : ""}${day}${end ? ` – ${end}` : ""}`, h("small", null, fmt(it.date, { year: "numeric" }))),
      h("div", null,
        h("p", { class: "what" }, it.title),
        h("p", { class: "why" }, inline(it.text, ctx)),
        isNext ? h("span", { class: "next-pill" }, next.whenLabel) : null));
  }));
}

export function render({ state }) {
  const today = taipeiParts().ymd;
  const ctx = { facts: state.facts };
  const taxGuides = state.guides.filter((g) => g.kind === "tax");
  const start = taxGuides.find((g) => g.start_here) || taxGuides[0];
  const rest = taxGuides.filter((g) => g !== start);
  const tax = state.content.tax;

  const next = nextCalendarItem(tax.calendar, today);
  const head = h("header", { class: "band" },
    h("div", { class: "wrap page-head" },
      h("p", { class: "eyebrow" }, "Tax for foreign professionals"),
      h("h1", null, "Tax in Taiwan, made clear"),
      h("p", { class: "lede" },
        "Whether you file, how much you pay and which rules apply all start with one question: how many days you spend here. ",
        "Every figure is traced to an official source and re-checked every week."),
      h("div", { class: "glance-strip", style: "margin-top:28px" },
        h("a", { class: "glance-item", href: "#/tax/calculator" },
          h("span", { class: "glance-icon tint-sun" }, icon("calculator")),
          h("div", null, h("div", { class: "glance-num" }, "Estimate"), h("div", { class: "glance-label" }, "Residency and tax in a minute"))),
        h("a", { class: "glance-item", href: `#/guide/${start.slug}` },
          h("span", { class: "glance-icon tint-sky" }, icon("compass")),
          h("div", null, h("div", { class: "glance-num" }, "Start here"), h("div", { class: "glance-label" }, start.title))),
        h("a", { class: "glance-item", href: "#/tax", onclick: (e) => { e.preventDefault(); document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth" }); } },
          h("span", { class: "glance-icon tint-leaf" }, icon("calendar")),
          h("div", null, h("div", { class: "glance-num" }, next ? next.whenLabel : "Nothing due"), h("div", { class: "glance-label" }, next ? next.item.title : "Tax calendar"))))));

  const reading = h("section", { class: "wrap section" },
    sectionHead("Guides"),
    h("div", { class: "tax-grid" },
      h("ol", { class: "guide-list" },
        guideRow(start, 1, { start: true }),
        rest.map((g, i) => guideRow(g, i + 2))),
      h("div", { style: "display:grid;gap:16px" },
        h("a", { class: "tool-card", href: "#/tax/calculator" },
          h("div", null,
            h("h3", null, "Am I a resident? What will I owe?"),
            h("p", null, "Count your days, then estimate the tax — each number linked to its source.")),
          h("span", { class: "tool-icon" }, icon("calculator"))),
        h("div", { class: "ask-card", style: "margin:0" },
          h("span", { class: "ask-icon" }, icon("chat")),
          h("div", null,
            h("h3", null, "Ask Claude"),
            h("p", { style: "margin:0" }, "Press “Connect Claude” at the top of the page. Claude answers from the same guides, figures and calculator — and shows you where each answer comes from."))))));

  const calendar = h("section", { class: "wrap section", id: "calendar" },
    sectionHead("Tax calendar"),
    h("div", { class: "tax-grid" },
      calendarList(tax.calendar, today, ctx),
      h("div", null,
        h("h3", { class: "eyebrow" }, "Key figures · tax year 2026"),
        h("div", { class: "fact-cards", style: "grid-template-columns:1fr;margin-top:0" },
          ["residency_days", "nr_salary_rate", "nr_threshold_2026", "exemption_2026", "salary_deduction_2026", "special_talent_threshold"]
            .map((fid) => factCard(state.facts[fid], ctx))))));

  // Talent Taiwan 的稅務說明會（爬蟲標 topic:tax）
  const seminars = state.events.filter((e) => (e.tags || []).includes("topic:tax")).sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""));
  const upcomingSem = seminars.filter((e) => e.status === "upcoming" || e.status === "ongoing");
  const lastSem = seminars.find((e) => e.status === "expired");
  const seminarSection = h("section", { class: "wrap section" },
    sectionHead("Tax seminars"),
    upcomingSem.length
      ? h("ol", { class: "rows" }, upcomingSem.map((ev) => eventRow(ev)))
      : h("p", { class: "muted", style: "max-width:680px" },
        "No tax seminars are scheduled right now. ",
        lastSem ? [`Talent Taiwan's last one — “${lastSem.title_en || lastSem.title}” — was on ${shortDate(lastSem.starts_at)}. `, "They tend to run in the weeks before the May filing season; new ones appear here as soon as the weekly crawl finds them."] : "They tend to run before the May filing season."));

  const help = h("section", { class: "wrap section" },
    sectionHead("Getting help"),
    h("div", { class: "fact-cards" }, ["ntb_taipei_desk", "ntb_phone"].map((fid) => factCard(state.facts[fid], ctx))),
    h("p", { class: "muted", style: "font-size:15px" },
      "The National Taxation Bureau of Taipei publishes an English site and a bilingual filing handbook each year — ",
      h("a", { href: "https://www.ntbt.gov.tw/English/htmlList/0862921c90af4c398eb037f8afe4e796", target: "_blank", rel: "noopener" }, "NTB Taipei in English"), "."));

  const ok = tax.sources.filter((s) => s.status === "ok").length;
  const verified = Object.values(state.facts).filter((f) => f.status === "verified").length;
  const fresh = h("section", { class: "wrap section" },
    sectionHead("How we keep this current"),
    h("p", { style: "max-width:720px;color:var(--ink-2)" },
      `Every week the crawler re-reads ${plural(ok, "official page")} — the Ministry of Finance, the National Taxation Bureau of Taipei, the gazette, the law database and Talent Taiwan — and checks that the sentence behind each of our ${verified} tax figures is still there, word for word. `,
      `If a page changes, the figures that depend on it are flagged here as under review until a person re-checks them. Last check: ${shortDate(tax.checked_at)}.`),
    h("a", { class: "linkish", href: "#/about" }, "See every source and its status →"));

  return { title: "Tax", node: h("div", null, head, reading, calendar, seminarSection, help, fresh) };
}
