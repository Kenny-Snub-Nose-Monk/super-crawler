// 分類瀏覽：#/topics 是六個主題的入口，#/topic/<id> 是單一主題頁
// （子分類分頁、快速過濾、本週精選、全部活動、相關閱讀）。

import { h, icon } from "../lib/dom.js";
import { queryEvents } from "../query.js";
import { windows } from "../lib/time.js";
import { TOPICS, topicById, applySub } from "../lib/topics.js";
import { plural } from "../lib/format.js";
import { sectionHead, eventCard, pagedRows, emptyState, guideRow } from "./components.js";
import { pickScore } from "./home.js";

const QUICK = [
  ["week", "This week"],
  ["weekend", "This weekend"],
  ["free", "Free"],
  ["english", "English-friendly"],
  ["inperson", "In person"],
  ["taipei", "Taipei City"],
  ["newtaipei", "New Taipei"],
];

function indexPage(state) {
  const w = windows();
  const head = h("header", { class: "wrap page-head" },
    h("p", { class: "eyebrow" }, "Browse"),
    h("h1", null, "Topics"),
    h("p", { class: "lede" }, "Six ways into the city's week. Counts are for the next 30 days."));
  const grid = h("div", { class: "topics" }, TOPICS.map((tp) => {
    const n = queryEvents(state.events, { types: tp.types, start_before: w.next30.end }).length;
    return h("a", { class: "topic", href: `#/topic/${tp.id}` },
      h("span", { class: `topic-icon tint-${tp.tint}` }, icon(tp.icon)),
      h("span", { class: "topic-name" }, tp.name),
      h("span", { class: "topic-count" }, `${n} upcoming`),
      h("p", { class: "topic-desc" }, tp.blurb));
  }));
  return { title: "Topics", node: h("div", null, head, h("div", { class: "wrap section", style: "padding-top:8px" }, grid)) };
}

export function render({ args, params, state }) {
  if (!args.length) return indexPage(state);
  const topic = topicById(args[0]);
  if (!topic) return { title: "Topic", node: h("div", { class: "wrap" }, emptyState("No such topic.")) };

  const w = windows();
  const sub = params.get("sub") || "";
  const quick = new Set((params.get("f") || "").split(",").filter(Boolean));
  let sort = params.get("sort") === "newest" ? "newest" : "soonest";

  const base = queryEvents(state.events, { types: topic.types });
  const counts = Object.fromEntries(topic.subs.map((s) => [s.id, applySub(base, topic, s.id).length]));

  const filtered = () => {
    const p = { types: topic.types };
    if (quick.has("week")) { p.start_after = w.week.start; p.start_before = w.week.end; }
    if (quick.has("weekend")) { p.start_after = w.weekend.start; p.start_before = w.weekend.end; }
    if (quick.has("free")) p.free_only = true;
    if (quick.has("english")) p.tags = ["lang:en"];
    if (quick.has("inperson")) p.exclude_online = true;
    if (quick.has("taipei")) p.city = "臺北市";
    if (quick.has("newtaipei")) p.city = "新北市";
    const rows = applySub(queryEvents(state.events, p), topic, sub);
    return sort === "newest" ? [...rows].sort((a, b) => (b.first_seen || "").localeCompare(a.first_seen || "")) : rows;
  };

  const listBox = h("div");
  const countEl = h("p", { class: "count" });
  const picksBox = h("div");

  const paint = () => {
    const rows = filtered();
    const picks = rows.filter((e) => e.status === "upcoming" && e.starts_at && e.starts_at <= w.next7.end)
      .map((e, i) => ({ e, s: pickScore(e) - i * 0.002 })).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.e);
    picksBox.replaceChildren(picks.length ? h("div", { class: "section" },
      sectionHead("Picks for the next 7 days"),
      h("div", { class: "cards three" }, picks.map((ev) => eventCard(ev)))) : "");
    countEl.textContent = `${plural(rows.length, "event")}${sub ? ` · ${topic.subs.find((s) => s.id === sub)?.name}` : ""}`;
    listBox.replaceChildren(rows.length ? pagedRows(rows, { pageSize: 25 }) : emptyState("Nothing here with these filters.", topic.icon));
  };

  // 分頁籤的連結要帶著目前的快速篩選與排序 —— 篩選改了就重算一次
  const tabHref = (id) => {
    const q = new URLSearchParams();
    if (id) q.set("sub", id);
    if (quick.size) q.set("f", [...quick].join(","));
    if (sort === "newest") q.set("sort", sort);
    return `#/topic/${topic.id}${q.toString() ? `?${q}` : ""}`;
  };
  let tabs = null;
  const sync = () => {
    window.site.navigate(`/topic/${topic.id}`, { sub: sub || null, f: [...quick].join(",") || null, sort: sort === "newest" ? sort : null }, { replace: true, render: false });
    if (tabs) for (const a of tabs.querySelectorAll("a.tab")) a.setAttribute("href", tabHref(a.dataset.sub));
  };
  const sortSel = h("select", { "aria-label": "Sort" },
    h("option", { value: "soonest" }, "Soonest first"),
    h("option", { value: "newest" }, "Newest found first"));
  sortSel.value = sort;
  sortSel.addEventListener("change", () => { sort = sortSel.value; sync(); paint(); });

  tabs = h("nav", { class: "tabs", "aria-label": `${topic.name} categories` },
    [["", "All", base.length], ...topic.subs.map((s) => [s.id, s.name, counts[s.id]])].map(([id, name, n]) => {
      return h("a", { class: "tab", href: tabHref(id), dataset: { sub: id }, "aria-current": String(id === sub) }, name, h("span", { class: "n" }, String(n)));
    }));

  const chips = h("div", { class: "filters", role: "group", "aria-label": "Quick filters" }, QUICK.map(([id, label]) => {
    const b = h("button", { type: "button", class: "chip", "aria-pressed": String(quick.has(id)) }, label);
    b.addEventListener("click", () => {
      if (quick.has(id)) quick.delete(id);
      else {
        quick.add(id);
        // 互斥的兩組：時間窗、城市
        if (id === "week") quick.delete("weekend");
        if (id === "weekend") quick.delete("week");
        if (id === "taipei") quick.delete("newtaipei");
        if (id === "newtaipei") quick.delete("taipei");
      }
      for (const c of chips.children) c.setAttribute("aria-pressed", String(quick.has(QUICK[[...chips.children].indexOf(c)][0])));
      sync();
      paint();
    });
    return b;
  }));

  paint();

  const related = state.guides.filter((g) => g.kind === "life");
  const head = h("header", { class: "wrap topic-head" },
    h("span", { class: `topic-icon tint-${topic.tint}` }, icon(topic.icon)),
    h("div", null,
      h("p", { class: "crumbs" }, h("a", { href: "#/topics" }, "Topics"), " / ", topic.name),
      h("h1", null, topic.name),
      h("p", null, topic.blurb)));

  return {
    title: topic.name,
    node: h("div", null, head,
      h("div", { class: "wrap" }, tabs, chips),
      h("div", { class: "wrap" }, picksBox),
      h("div", { class: "wrap section" },
        sectionHead("All events"),
        h("div", { class: "toolbar" }, countEl, h("label", { class: "sort" }, sortSel)),
        listBox),
      related.length && topic.id === "social" ? h("div", { class: "wrap section" },
        sectionHead("Guides"),
        h("ol", { class: "guide-list" }, related.map((g, i) => guideRow(g, i + 1)))) : null),
  };
}
