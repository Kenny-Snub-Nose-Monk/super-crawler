// 關於資料：活動從哪裡來、稅務原文快照的狀態、AI 助理怎麼接。
// 爬蟲做的事要看得到 —— 這頁就是它的成績單。

import { h } from "../lib/dom.js";
import { sourceLabel, shortDate, plural, publisherEn, sourceTitle } from "../lib/format.js";
import { chapter } from "./report.js";

const EVENT_SOURCES = {
  accupass: "Event pages' schema.org data (JSON-LD)",
  meetup: "Topic pages' schema.org data (JSON-LD)",
  anncr: "Monthly calendar, schema.org ItemList",
  travel_taipei: "Taipei City open-data API",
  taiwan_pathfinder: "The public sheet behind the site",
  trendy_taipei: "The site's own events API",
  talent_taiwan: "The site's own events API (bilingual)",
};

const TOOLS = [
  ["search_events", "Find events by date, type, keyword, price, language and city — the Events page shows the same list."],
  ["get_event", "Full details of one event, opening its page."],
  ["search_guides", "Search the tax and life guides; answers come with the official sources behind them."],
  ["get_guide", "Read a whole guide (or one section) as plain text."],
  ["check_tax_residency", "Days in Taiwan, or a list of trips, turned into resident or not, with the counting rule applied."],
  ["estimate_tax", "Run the calculator — residency first, then the tax — and open it with your inputs."],
  ["get_tax_calendar", "What's due next: filing, refunds, announcements."],
  ["get_tax_facts", "The figures themselves (rates, thresholds, amounts) with their verification status and the original quotes."],
];

function pill(status) {
  const ok = status === "ok" || status === "index";
  const label = { ok: "saved", index: "index", manual: "linked only", empty: "page empty", blocked: "bot wall", disallowed: "robots.txt", thin: "too short", error: "error", stale: "no longer linked" }[status] || status;
  return h("span", { class: `pill ${ok ? "ok" : status === "manual" ? "" : "bad"}` }, label);
}

export function render({ state }) {
  const tax = state.content.tax;
  const head = h("header", { class: "wrap page-head" },
    h("h1", null, "Where everything comes from"),
    h("p", { class: "lede" }, "Ma is a static site. A crawler runs every Thursday night on GitHub Actions, collects public event listings and official tax pages, and commits what it found — so every change is visible in the project's history."));

  // 活動來源
  const bySource = {};
  for (const e of state.events) {
    const s = (bySource[e.source_platform] ||= { total: 0, active: 0, last: "" });
    s.total++;
    if (e.status === "upcoming" || e.status === "ongoing") s.active++;
    if ((e.last_seen || "") > s.last) s.last = e.last_seen;
  }
  const eventsTable = h("div", { class: "table-wrap" }, h("table", { class: "status-table" },
    h("thead", null, h("tr", null, ["Source", "How we read it", "On now / upcoming", "In the table", "Last seen"].map((x) => h("th", null, x)))),
    h("tbody", null, Object.entries(bySource).sort((a, b) => b[1].active - a[1].active).map(([src, s]) =>
      h("tr", null, h("td", null, sourceLabel(src)), h("td", null, EVENT_SOURCES[src] || "—"), h("td", null, String(s.active)), h("td", null, String(s.total)), h("td", null, shortDate(s.last)))))));

  // 稅務來源（以起點分組）
  const roots = tax.sources.filter((s) => !s.parent);
  const childrenOf = (id) => tax.sources.filter((s) => s.parent === id);
  const allDesc = (id) => childrenOf(id).flatMap((c) => [c, ...allDesc(c.id)]);
  const counts = {};
  for (const s of tax.sources) counts[s.status] = (counts[s.status] || 0) + 1;
  const verified = Object.values(state.facts).filter((f) => f.status === "verified").length;
  const drifted = Object.values(state.facts).filter((f) => f.status === "drifted");

  const taxRows = roots.sort((a, b) => (a.kind || "").localeCompare(b.kind || "") || a.id.localeCompare(b.id)).map((s) => {
    const desc = allDesc(s.id).filter((d) => d.status !== "index");
    const okDesc = desc.filter((d) => d.status === "ok").length;
    const row = h("tr", null,
      h("td", null, h("a", { href: s.url, target: "_blank", rel: "noopener", title: s.title }, sourceTitle(s)), h("br"), h("span", { class: "muted", style: "font-size:13.5px" }, publisherEn(s.publisher))),
      h("td", null, pill(s.status), desc.length ? h("span", { class: "muted", style: "font-size:13.5px" }, ` + ${okDesc}/${desc.length} pages`) : null),
      h("td", null, /^\d{4}-\d{2}-\d{2}$/.test(s.page_updated || "") ? shortDate(`${s.page_updated}T12:00:00+08:00`) : s.page_updated || "—"),
      h("td", null, s.status === "manual" ? h("span", { class: "muted" }, s.note || "") : shortDate(s.last_ok || s.last_checked)));
    return row;
  });
  const taxTable = h("div", { class: "table-wrap" }, h("table", { class: "status-table" },
    h("thead", null, h("tr", null, ["Official source", "Status", "Page last updated", "Last good copy"].map((x) => h("th", null, x)))),
    h("tbody", null, taxRows)));

  // 指令帶入目前網站的網址：本機是 http://localhost:8765，GitHub Pages 上是 github.io
  const relayCmd = `claude mcp add -s user webmcp-relay -- npx -y @mcp-b/webmcp-local-relay@5.1.0 --widget-origin ${location.origin}`;

  // 手機上表格一列疊成一塊：每格帶著它的欄名
  for (const wrap of [eventsTable, taxTable]) {
    const heads = [...wrap.querySelectorAll("th")].map((th) => th.textContent);
    for (const tr of wrap.querySelectorAll("tbody tr")) [...tr.children].forEach((td, i) => { td.dataset.label = heads[i] || ""; });
    wrap.classList.add("stack-sm");
  }
  return {
    title: "About the data",
    node: h("div", null, head,
      chapter("Event sources", h("div", null,
        h("p", { class: "body-text" }, "Each source has its own collector, so one site redesigning breaks only that source. We prefer the data a site already publishes for machines — structured data and its own APIs — over scraping page layouts, and every request checks robots.txt first."),
        eventsTable)),
      chapter("Tax sources", h("div", null,
        h("p", { class: "body-text" },
          `${plural(counts.ok || 0, "page")} saved, ${counts.empty || 0} official pages that are currently empty, ${counts.manual || 0} linked but not crawled (a bot wall, or a tool). `,
          `${verified} of ${Object.keys(state.facts).length} tax figures matched their official sentence at the last check${drifted.length ? `; ${drifted.length} are under review` : ""}.`),
        taxTable)),
      chapter("Ask your AI assistant", h("div", null,
        h("p", { class: "body-text" },
          "The page registers its own tools with WebMCP. With the local relay running, Claude Code can call them — and because the tools drive this page, you see the same results Claude sees."),
        h("ol", { class: "steps" },
          h("li", null, h("span", { class: "t" }, "Add the relay to Claude Code (once)"), h("code", { style: "overflow-wrap:anywhere" }, relayCmd)),
          h("li", null, h("span", { class: "t" }, "Press “Connect Claude”"), "at the top of the page after starting a Claude Code session. It's off by default, so ordinary visitors' browsers never scan local ports."),
          h("li", null, h("span", { class: "t" }, "Ask"), "in plain language — “am I a tax resident if I arrived on 10 March?” or “free English events this weekend”.")),
        h("div", { class: "table-wrap" }, h("table", { class: "status-table" },
          h("thead", null, h("tr", null, h("th", null, "Tool"), h("th", null, "What it does"))),
          h("tbody", null, TOOLS.map(([n, d]) => h("tr", null, h("td", null, h("code", null, n)), h("td", null, d)))))))),
      chapter("Not tax advice", h("div", null,
        h("p", { class: "body-text" }, "The guides and calculator explain general rules for foreign professionals. Your situation may differ — confirm with the National Taxation Bureau, or a licensed accountant, before you file.")))),
  };
}
