// 全部活動 + 完整的過濾列。原本那個網站的過濾功能都在這裡（關鍵字、日期、城市、類型、
// 免費、還能報名、排除線上），多了「英文友善」與「本週新增」。
//
// 過濾條件同步到網址；WebMCP 的 search_events 也是把條件放進網址再打開這一頁，
// 所以 AI 助理查到的就是畫面上的這份清單。

import { h, icon, dateInput } from "../lib/dom.js";
import { queryEvents, normalizeParams } from "../query.js";
import { windows } from "../lib/time.js";
import { TYPE_META, plural } from "../lib/format.js";
import { pagedRows, emptyState } from "./components.js";

const FLAGS = ["free_only", "signup_open", "exclude_online", "english", "new"];
// 日期先給常用的時間窗；要自訂才露出日期欄（日期欄本身見 lib/dom.js 的 dateInput）
const WHEN = [["", "Any time"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["weekend", "This weekend"],
  ["next7", "Next 7 days"], ["next30", "Next 30 days"], ["custom", "Pick dates…"]];
const day = (iso) => (iso || "").slice(0, 10);
const TEXT = ["keyword", "start_after", "start_before", "city"];

/** 網址參數 → 查詢條件。english / new 是網站這一層的條件，不是共用查詢語意的一部分。 */
export function paramsFromUrl(sp) {
  const raw = { types: (sp.get("types") || "").split(",").filter(Boolean) };
  for (const k of TEXT) raw[k] = sp.get(k) || "";
  for (const k of ["free_only", "signup_open", "exclude_online"]) raw[k] = sp.get(k) === "1";
  const params = normalizeParams(raw);
  return { params, english: sp.get("english") === "1", fresh: sp.get("new") === "1", sort: sp.get("sort") || "soonest" };
}

export function runQuery(events, { params, english, fresh, sort }, now = Date.now()) {
  const p = { ...params };
  if (english) p.tags = [...(p.tags || []), "lang:en"];
  let rows = queryEvents(events, p, now);
  if (fresh) rows = rows.filter((e) => e.first_seen && now - Date.parse(e.first_seen) < 7 * 86400000);
  if (sort === "newest") rows = [...rows].sort((a, b) => (b.first_seen || "").localeCompare(a.first_seen || ""));
  return rows;
}

export function render({ params: sp, state, fromAgent }) {
  const q = paramsFromUrl(sp);
  const results = h("div");
  const count = h("p", { class: "count", "aria-live": "polite" });

  const field = (name, label, el) => h("label", { class: "field" }, h("span", null, label), el);
  const kw = h("input", { type: "search", name: "keyword", value: q.params.keyword || "", placeholder: "e.g. jazz, market, climbing" });
  const after = dateInput({ name: "start_after", value: (q.params.start_after || "").slice(0, 10) });
  const before = dateInput({ name: "start_before", value: (q.params.start_before || "").slice(0, 10) });
  const w = windows();
  const curAfter = day(q.params.start_after), curBefore = day(q.params.start_before);
  const initialWhen = !curAfter && !curBefore ? ""
    : (WHEN.find(([k]) => w[k] && day(w[k].start) === curAfter && day(w[k].end) === curBefore) || ["custom"])[0];
  const when = h("select", { "aria-label": "When" }, WHEN.map(([k, label]) => h("option", { value: k }, label)));
  when.value = initialWhen;
  const range = h("div", { class: "wide date-range" }, field("start_after", "From", after), field("start_before", "To", before));
  range.hidden = initialWhen !== "custom";
  // 用 input 事件：比表單冒泡上來的 input 監聽先跑，重算時日期已經換好
  when.addEventListener("input", () => {
    const k = when.value;
    range.hidden = k !== "custom";
    if (k === "") { after.value = ""; before.value = ""; }
    else if (w[k]) { after.value = day(w[k].start); before.value = day(w[k].end); }
  });
  const city = h("select", { name: "city" },
    h("option", { value: "" }, "Taipei & New Taipei"),
    h("option", { value: "臺北市" }, "Taipei City"),
    h("option", { value: "新北市" }, "New Taipei City"));
  city.value = q.params.city || "";
  const types = new Set(q.params.types || []);
  const typeChips = h("div", { class: "filters", role: "group", "aria-label": "Types" },
    Object.entries(TYPE_META).map(([t, m]) => {
      const box = h("input", { type: "checkbox", name: "types", value: t });
      box.checked = types.has(t);
      return h("label", { class: "chip" }, box, icon(m.icon), m.en);
    }));
  const flag = (name, label, on) => {
    const el = h("input", { type: "checkbox", name });
    el.checked = on;
    return h("label", { class: "toggle" }, el, label);
  };
  const sort = h("select", { name: "sort", "aria-label": "Sort" },
    h("option", { value: "soonest" }, "Soonest first"),
    h("option", { value: "newest" }, "Newest found first"));
  sort.value = q.sort;
  const reset = h("button", { type: "button", class: "linkish" }, "Clear filters");

  const form = h("form", { class: "filter-panel", autocomplete: "off" },
    field("keyword", "Keyword", kw), h("label", { class: "field" }, h("span", null, "When"), when), field("city", "City", city),
    range,
    h("div", { class: "wide" }, typeChips),
    h("div", { class: "wide toggles" },
      flag("english", "English-friendly", q.english),
      flag("free_only", "Free only", Boolean(q.params.free_only)),
      flag("signup_open", "Still open for sign-up", Boolean(q.params.signup_open)),
      flag("exclude_online", "In person only", Boolean(q.params.exclude_online)),
      flag("new", "Found this week", q.fresh),
      reset));

  const read = () => {
    const fd = new FormData(form);
    const raw = { types: fd.getAll("types") };
    for (const k of TEXT) raw[k] = fd.get(k) || "";
    for (const k of ["free_only", "signup_open", "exclude_online"]) raw[k] = fd.get(k) === "on";
    return { params: normalizeParams(raw), english: fd.get("english") === "on", fresh: fd.get("new") === "on", sort: sort.value };
  };

  const paint = (cur, { sync = true } = {}) => {
    const rows = runQuery(state.events, cur);
    count.textContent = rows.length ? `${plural(rows.length, "event")} · soonest first, then ongoing` : "";
    results.replaceChildren(rows.length ? pagedRows(rows, { pageSize: 40 }) : emptyState("Nothing matches these filters. Try removing one."));
    if (sync) {
      const url = { ...cur.params, english: cur.english, new: cur.fresh, sort: cur.sort === "soonest" ? null : cur.sort };
      if (url.start_after && url.start_after.endsWith("T00:00:00+08:00")) url.start_after = url.start_after.slice(0, 10);
      if (url.start_before && url.start_before.endsWith("T23:59:59+08:00")) url.start_before = url.start_before.slice(0, 10);
      window.site.navigate("/events", url, { replace: true, render: false });
    }
  };

  form.addEventListener("input", () => paint(read()));
  form.addEventListener("change", () => paint(read()));
  sort.addEventListener("change", () => paint(read()));
  form.addEventListener("submit", (e) => e.preventDefault());
  reset.addEventListener("click", () => {
    form.reset();
    for (const b of form.querySelectorAll("input[type=checkbox]")) b.checked = false;
    kw.value = ""; after.value = ""; before.value = ""; city.value = ""; when.value = ""; range.hidden = true;
    paint(read());
  });
  paint(q, { sync: false });

  const head = h("header", { class: "wrap page-head" },
    h("p", { class: "eyebrow" }, "Taipei & New Taipei"),
    h("h1", null, "All events"),
    h("p", { class: "lede" }, "Collected every week from public listings. Your filters stay in the address bar, so you can share exactly this view."));

  return {
    title: "Events",
    node: h("div", null, head, h("div", { class: "wrap" },
      fromAgent ? h("p", { class: "agent-banner" }, "These filters were set by your AI assistant") : null,
      form, h("h2", { class: "sr-only" }, "Results"), h("div", { class: "toolbar" }, count, h("label", { class: "sort" }, sort)), results)),
  };
}
