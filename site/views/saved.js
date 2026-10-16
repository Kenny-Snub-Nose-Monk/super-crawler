// 收藏：這個瀏覽器裡存的活動與指南。

import { h } from "../lib/dom.js";
import { savedIds } from "../lib/saved.js";
import { eventRow, guideRow, emptyState, sectionHead } from "./components.js";

export function render({ state }) {
  const ids = savedIds();
  const events = ids.events.map((uid) => state.events.find((e) => e.uid === uid)).filter(Boolean);
  const upcoming = events.filter((e) => e.status !== "expired");
  const past = events.filter((e) => e.status === "expired");
  const guides = ids.guides.map((s) => state.guidesBySlug[s]).filter(Boolean);

  const head = h("header", { class: "wrap page-head" },
    h("p", { class: "eyebrow" }, "Your list"),
    h("h1", null, "Saved"),
    h("p", { class: "lede" }, "Saved in this browser only — nothing leaves your device."));

  if (!events.length && !guides.length) {
    return { title: "Saved", node: h("div", null, head, h("div", { class: "wrap" }, emptyState("Nothing saved yet. Tap the bookmark on any event or guide.", "bookmark"))) };
  }
  return {
    title: "Saved",
    node: h("div", null, head,
      upcoming.length ? h("section", { class: "wrap section" }, sectionHead("Coming up", { count: upcoming.length }), h("ol", { class: "rows" }, upcoming.map((e) => eventRow(e)))) : null,
      guides.length ? h("section", { class: "wrap section" }, sectionHead("Guides", { count: guides.length }), h("ol", { class: "guide-list" }, guides.map((g, i) => guideRow(g, i + 1)))) : null,
      past.length ? h("section", { class: "wrap section" }, sectionHead("Already happened", { count: past.length }), h("ol", { class: "rows" }, past.map((e) => eventRow(e)))) : null),
  };
}
