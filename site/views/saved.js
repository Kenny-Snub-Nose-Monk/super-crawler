// 收藏：這個瀏覽器裡存的活動與指南。

import { h } from "../lib/dom.js";
import { savedIds } from "../lib/saved.js";
import { agenda, eventRow, guideRow, emptyState } from "./components.js";
import { chapter } from "./report.js";

export function render({ state }) {
  const ids = savedIds();
  const events = ids.events.map((uid) => state.events.find((e) => e.uid === uid)).filter(Boolean);
  // 照時間排：行事曆分組要同一天的排在一起
  const upcoming = events.filter((e) => e.status !== "expired").sort((a, b) => (a.status === "ongoing") - (b.status === "ongoing") || (a.starts_at || "").localeCompare(b.starts_at || ""));
  const past = events.filter((e) => e.status === "expired");
  const guides = ids.guides.map((s) => state.guidesBySlug[s]).filter(Boolean);

  const head = h("header", { class: "wrap page-head" },
    h("h1", null, "Saved"),
    h("p", { class: "lede" }, "Saved in this browser only. Nothing leaves your device."));

  if (!events.length && !guides.length) {
    return {
      title: "Saved",
      node: h("div", null, head, h("div", { class: "wrap" }, emptyState("Nothing saved yet. Press the bookmark on any event or guide and it shows up here.", null,
        h("a", { class: "chapter-link", href: "#/events" }, "Browse events")))),
    };
  }
  const n = (k) => h("span", { class: "chapter-count" }, String(k));
  return {
    title: "Saved",
    node: h("div", null, head,
      upcoming.length ? chapter(h("span", null, "Coming up", n(upcoming.length)), agenda(upcoming, { pageSize: 50 })) : null,
      guides.length ? chapter(h("span", null, "Guides", n(guides.length)), h("ol", { class: "guide-list" }, guides.map((g, i) => guideRow(g, i + 1)))) : null,
      past.length ? chapter(h("span", null, "Already happened", n(past.length)), h("ol", { class: "rows past-rows" }, past.map((e) => eventRow(e)))) : null),
  };
}
