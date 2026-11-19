// 搜尋結果：一個搜尋框，同時找活動與指南。
// 頂端顯示「我們怎麼理解這句話」（可移除的標籤）與一段計算出來的摘要 —— 不是 AI 寫的，
// 所以標題寫「At a glance」，不寫「AI summary」。

import { h, icon } from "../lib/dom.js";
import { parseQuery, searchEvents, searchGuides, glance, withoutChip } from "../lib/search.js";
import { plural, formatWhen, DISTRICT_EN } from "../lib/format.js";
import { agenda, pagedRows, emptyState } from "./components.js";

function highlight(text, tokens) {
  const frag = document.createDocumentFragment();
  if (!tokens.length) { frag.append(text); return frag; }
  const rx = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  for (const part of text.split(rx)) {
    if (!part) continue;
    if (tokens.some((t) => t.toLowerCase() === part.toLowerCase())) frag.append(h("mark", null, part));
    else frag.append(part);
  }
  return frag;
}

export function render({ params, state, fromAgent }) {
  const q = params.get("q") || "";
  const scope = params.get("scope") || "all";
  const parsed = parseQuery(q);
  const events = q ? searchEvents(state.events, parsed) : [];
  // 稅務問題：指南是答案，排在前面、多給幾筆；找活動時指南只當補充
  const answers = q ? searchGuides(state.guideIndex, parsed, parsed.tax ? 6 : 2) : [];

  const input = h("input", { type: "search", value: q, placeholder: "Try “free english this weekend” or “183 days”", "aria-label": "Search", enterkeyhint: "search" });
  const form = h("form", { class: "searchbar", role: "search" }, icon("search"), input, h("button", { type: "submit" }, "Search"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    window.site.navigate("/search", { q: input.value.trim() });
  });

  // 「我們怎麼理解這句話」每次都顯示，不管有沒有解析出條件 —— 不然「hiking」有一列、
  // 「tax」沒有，看起來像兩種不同的頁面。稅務問題本身也是一種理解（會把指南排前面），
  // 所以給一個不能移除的標籤；剩下拿去比對的字用引號列在後面。
  const interpreted = q ? h("div", { class: "interpreted" }, "Searching for",
    parsed.tax ? h("span", { class: "chip on", title: "Tax questions show guide answers first" }, "Tax question") : null,
    parsed.chips.map((c) => h("a", { class: "chip on", href: `#/search?q=${encodeURIComponent(withoutChip(parsed, c.key))}`, title: "Remove" }, c.label, h("span", { class: "x", "aria-hidden": "true" }, " ×"))),
    parsed.text ? h("span", null, `${parsed.tax || parsed.chips.length ? "+ " : ""}“${parsed.text}”`) : null) : null;

  const head = h("header", { class: "wrap search-head" },
    h("h1", null, q ? h("span", null, "Results for ", h("span", { class: "q-term" }, `“${q}”`)) : "Search events and guides"),
    form,
    interpreted);

  if (!q) {
    return {
      title: "Search",
      node: h("div", null, head, h("div", { class: "wrap section" },
        h("p", { class: "body-text" }, "Search understands dates (tonight, this weekend, November), “free”, “English”, neighbourhoods and topics, and tax questions too."),
        h("h2", { class: "sub-h" }, "Try"),
        h("div", { class: "hints" }, ["this weekend english", "free markets", "climbing", "jazz tonight", "183 days", "rsu stock options", "leaving taiwan tax", "refund"].map((s) =>
          h("a", { class: "hint", href: `#/search?q=${encodeURIComponent(s)}` }, s))))),
      after: () => input.focus(),
    };
  }

  // 一眼看完：有結果就一定有一行標題，依下面區塊的順序數出找到什麼
  // （之前只有找到活動才有標題，稅務問題只剩一個孤零零的項目符號）
  const g = glance(events);
  const eventBits = [];
  if (g) {
    eventBits.push(`${plural(g.total, "event")}${parsed.when ? ` ${parsed.when.label.toLowerCase()}` : ""}`);
    if (g.english) eventBits.push(`${g.english} English-friendly`);
    if (g.free) eventBits.push(`${g.free} free`);
    if (g.online) eventBits.push(`${g.online} online`);
  } else {
    eventBits.push("no events");
  }
  const guideBit = answers.length ? plural(answers.length, "guide answer") : null;
  const summaryBits = (parsed.tax ? [guideBit || "no guide answers", ...eventBits] : [...eventBits, guideBit]).filter(Boolean);
  const summaryLine = summaryBits.join(" · ").replace(/^n/, "N") + ".";
  const top = answers[0];
  const glanceItems = [
    g && g.first ? h("li", null, "Soonest: ", h("a", { href: `#/event/${encodeURIComponent(g.first.uid)}` }, g.first.title_en || g.first.title), ` — ${formatWhen(g.first).line}`) : null,
    g && g.topDistrict && g.topDistrict.n >= 2 ? h("li", null, `Most are in ${DISTRICT_EN[g.topDistrict.name] || g.topDistrict.name} (${g.topDistrict.n}).`) : null,
    g && g.unknownPrice ? h("li", null, `${g.unknownPrice} don't list a price — that isn't the same as free.`) : null,
    top ? h("li", null, "Best guide match: ", h("a", { href: `#/guide/${top.slug}?s=${top.sectionId}` }, `${top.guideTitle} — ${top.heading}`)) : null,
  ].filter(Boolean);
  // 稅務問題指南排前面，「最佳指南」也放第一個
  if (parsed.tax && top) glanceItems.unshift(glanceItems.pop());
  const glanceBox = (g || answers.length) ? h("section", { class: "summary" },
    h("div", null,
      h("h2", { class: "summary-line" }, summaryLine),
      glanceItems.length ? h("ul", null, glanceItems) : null)) : null;

  const tabs = h("nav", { class: "tabs", "aria-label": "Result type" },
    [["all", "All", events.length + answers.length], ["events", "Events", events.length], ["guides", "Guides", answers.length]].map(([id, label, n]) =>
      h("a", { class: "tab", href: `#/search?q=${encodeURIComponent(q)}${id === "all" ? "" : `&scope=${id}`}`, "aria-current": String(scope === id) }, label, h("span", { class: "n" }, String(n)))));

  const guideList = answers.length ? h("section", { class: "result-block" },
    h("h2", { class: "sub-h" }, "From the guides"),
    h("div", { class: "answers" }, answers.map((a) => h("div", { class: "answer" },
      h("h3", null, h("a", { href: `#/guide/${a.slug}?s=${a.sectionId}` }, a.heading)),
      h("p", { class: "answer-src" }, `In “${a.guideTitle}”`),
      h("p", null, highlight(a.snippet, parsed.tokens.length ? parsed.tokens : parsed.guideTokens)))))) : null;

  const eventList = events.length ? h("section", { class: "result-block" },
    h("h2", { class: "sub-h" }, plural(events.length, "event")),
    // 有關鍵字時結果按相關度排，不能照日子分組；只有日期／類型條件時才用行事曆
    (parsed.tokens || []).length ? pagedRows(events, { pageSize: 25 }) : agenda(events, { pageSize: 25 }))
    : scope === "events" || (!parsed.tax && scope !== "guides") ? emptyState("No events match. Try removing a filter above.") : null;

  const sections = parsed.tax ? [guideList, eventList] : [eventList, guideList];
  const body = h("div", { class: "wrap" },
    fromAgent ? h("p", { class: "agent-banner" }, "Searched by your AI assistant") : null,
    glanceBox, tabs,
    sections.filter((sec) => sec && (scope === "all" || (scope === "events" ? sec === eventList : sec === guideList))),
    scope === "guides" && !answers.length ? emptyState("No guide covers this yet.") : null);

  return { title: `“${q}”`, node: h("div", null, head, body) };
}
