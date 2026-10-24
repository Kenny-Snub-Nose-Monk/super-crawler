// 指南頁（靜態資訊頁）。內容來自 content/guides/*.yaml，由匯出腳本帶進 content.json。
//
// 文章裡的每一個稅務數字都可以點：會打開一張小卡，寫著這個數字出自哪份官方文件、
// 哪天核對過，以及那一句官方原文。讀者不必相信我們，可以直接看原文。

import { h, frag } from "../lib/dom.js";
import { inline } from "../lib/guides.js";
import { queryEvents } from "../query.js";
import { windows } from "../lib/time.js";
import { shortDate, plural, sourceTitle, sourceLabelLine } from "../lib/format.js";
import { showFact } from "./report.js";
import { eventRow, factCard, calcBlock, guideRow, saveButton, emptyState } from "./components.js";

const PROMPTS = {
  "tax-in-taiwan": ["I moved to Taipei in March 2026 on a Gold Card. Do I file a tax return next May?", "What changes if I leave Taiwan for good in November?"],
  "183-day-rule": ["I arrived on 10 March 2026 and spent 3 weeks abroad in August. Am I a tax resident for 2026?", "What is the latest date I can arrive this year and still be a resident?"],
  "tax-rates": ["Estimate my 2026 tax on a NT$4.2M salary as a resident, single, no dependants.", "How much more would I pay as a non-resident?"],
  "how-to-file": ["What documents do I need to file in May, and when do refunds arrive?", "Can someone file for me if I've already left Taiwan?"],
  "employer-withholding": ["My employer withheld 18% from January to June. Will I get it back?", "I'm paid by my company in Singapore while working in Taipei — what do I report?"],
  "tax-benefits": ["Do I qualify for the special professional tax incentive with a NT$5M salary and a Gold Card?", "How are stock options from my US parent company taxed in Taiwan?"],
  "english-friendly-taipei": ["Find English-friendly events this weekend in Taipei.", "Are there language exchanges on Wednesday evenings?"],
};

const CALLOUT_LABELS = { tip: "Tip", warn: "Watch out", law: "The law", note: "Note" };

function liveStats(keys, state) {
  const w = windows();
  const q = (p) => queryEvents(state.events, p).filter((e) => e.status === "upcoming");
  const defs = {
    english_week: () => ({ v: q({ tags: ["lang:en"], start_after: w.next7.start, start_before: w.next7.end }).length, l: "English-friendly, next 7 days" }),
    exchange_month: () => ({ v: q({ types: ["language_exchange"], start_after: w.next30.start, start_before: w.next30.end }).length, l: "Language exchanges, next 30 days" }),
    free_week: () => ({ v: q({ free_only: true, start_after: w.next7.start, start_before: w.next7.end }).length, l: "Free, next 7 days" }),
    sources: () => ({ v: new Set(state.events.filter((e) => e.status !== "expired").map((e) => e.source_platform)).size, l: "Sources collected weekly" }),
  };
  return h("div", { class: "stats" }, keys.filter((k) => defs[k]).map((k) => {
    const s = defs[k]();
    return h("div", { class: "stat" }, h("div", { class: "v" }, String(s.v)), h("div", { class: "l" }, s.l));
  }));
}

function eventsBlock(spec, state) {
  const w = windows()[spec.window || "next30"];
  const rows = queryEvents(state.events, {
    types: spec.types, tags: spec.tags, start_after: w.start, start_before: w.end, exclude_online: spec.exclude_online,
  }).filter((e) => e.status === "upcoming").slice(0, spec.limit || 4);
  return h("div", { style: "margin:20px 0 26px" },
    spec.title ? h("h3", { class: "sub-h" }, spec.title) : null,
    rows.length ? h("ol", { class: "rows" }, rows.map((ev) => eventRow(ev))) : emptyState("Nothing listed in this window right now."));
}

function block(b, ctx, state) {
  if (b.p) return h("p", null, inline(b.p, ctx));
  if (b.list) return h("ul", null, b.list.map((i) => h("li", null, inline(i, ctx))));
  if (b.steps) return h("ol", { class: "steps" }, b.steps.map((s) => h("li", null, h("span", { class: "t" }, s.title), inline(s.text || "", ctx))));
  if (b.callout) {
    const kind = b.callout.kind || "tip";
    return h("div", { class: `callout ${kind}` }, h("span", { class: "callout-kind" }, CALLOUT_LABELS[kind] || "Note"),
      h("div", null,
        b.callout.title ? h("p", { class: "callout-title" }, b.callout.title) : null,
        h("p", null, inline(b.callout.text || "", ctx))));
  }
  if (b.stats) {
    // 數字是整句（「NT$100 at a service station」）時，數字留在數字的位置，後半句移到說明
    return h("div", { class: "stats" }, b.stats.map((s) => {
      const v = h("div", { class: "v" }, inline(String(s.value), ctx));
      let rest = "";
      const m = v.textContent.match(/^(\S*\d\S*)\s+(.+)$/);
      const fact = v.querySelector(".fact");
      if (m && v.textContent.length > 14) {
        if (fact && fact.textContent === v.textContent) fact.textContent = m[1];
        else v.textContent = m[1];
        rest = m[2];
      }
      return h("div", { class: "stat" }, v, h("div", { class: "l" }, rest ? `${s.label}, ${rest}` : s.label));
    }));
  }
  if (b.table) {
    return h("div", { class: "table-wrap" }, h("table", { class: "g-table" },
      h("thead", null, h("tr", null, b.table.head.map((c) => h("th", { scope: "col" }, inline(c, ctx))))),
      // 詞彙表裡的中文欄標上語言，字型與螢幕閱讀器才會用對
      h("tbody", null, b.table.rows.map((r) => h("tr", null, r.map((c) => h("td", /[一-鿿]/.test(String(c)) ? { lang: "zh-Hant" } : null, inline(String(c), ctx))))))));
  }
  if (b.faq) return h("div", { class: "faq" }, b.faq.map((q) => h("details", null, h("summary", null, q.q), h("div", { class: "a" }, h("p", null, inline(q.a, ctx))))));
  if (b.facts) return h("div", { class: "fact-cards" }, b.facts.map((fid) => factCard(state.facts[fid], ctx)));
  if (b.calc) return calcBlock(b.calc, state);
  if (b.compare) return calcBlock({ compare: b.compare }, state);
  if (b.cite) {
    const srcs = b.cite.map((sid) => state.content.tax.sources.find((s) => s.id === sid)).filter(Boolean);
    return h("p", { class: "muted", style: "font-size:14px;margin-top:-6px" }, srcs.length > 1 ? "Sources: " : "Source: ",
      srcs.map((s, i) => frag(i ? " · " : "", h("a", { href: s.url, target: "_blank", rel: "noopener", title: s.title }, sourceTitle(s)))));
  }
  if (b.events) return eventsBlock(b.events, state);
  if (b.live) return liveStats(b.live, state);
  return null;
}

function sourceStatus(s) {
  if (s.status === "ok") return { cls: "verified", text: `Checked ${shortDate(s.last_ok)}` };
  if (s.status === "empty") return { cls: "drifted", text: "The official page currently has no text" };
  if (s.status === "manual") return { cls: "unchecked", text: "Linked, not crawled" };
  return { cls: "drifted", text: s.error || s.status };
}

export function render({ args, params, state, fromAgent }) {
  const g = state.guidesBySlug[args[0]];
  if (!g) return { title: "Guide not found", node: h("div", { class: "wrap" }, emptyState("That guide doesn't exist.")) };
  const ctx = { facts: state.facts, onFact: null };
  const article = h("article", { class: "guide-body" });
  ctx.onFact = (fid, el) => {
    const anchor = el || article.querySelector(`[data-fact="${fid}"]`);
    if (anchor) showFact(fid, anchor, state);
  };
  // 點同一個 fact 的不同出現位置時，卡片要開在被點的那一個旁邊
  article.addEventListener("click", (e) => {
    const el = e.target.closest("[data-fact]");
    if (el) { e.stopPropagation(); showFact(el.dataset.fact, el, state); }
  }, true);

  const hero = h("header", { class: "wrap guide-hero" },
    h("p", { class: "crumbs" },
      g.kind === "tax" ? h("a", { href: "#/tax" }, "Tax") : h("a", { href: "#/topics" }, "Life in Taipei"), " / Guide"),
    h("h1", null, g.title),
    g.subtitle ? h("p", { class: "subtitle" }, g.subtitle) : null,
    h("div", { class: "guide-meta" },
      h("span", null, `${g.reading_minutes} min read`),
      h("span", null, `Updated ${shortDate(`${g.updated}T12:00:00+08:00`)}`),
      g.sources ? h("span", null, plural(g.sources.length, "official source")) : null,
      h("span", { class: "guide-save" }, saveButton("guides", g.slug, g.title))));

  if (fromAgent) article.append(h("p", { class: "agent-banner" }, "Opened by your AI assistant"));
  if (g.takeaways) {
    article.append(h("aside", { class: "keypoints" },
      h("h2", null, "Key points"),
      g.summary ? h("p", { class: "lead" }, inline(g.summary, ctx)) : null,
      h("ul", null, g.takeaways.map((t) => h("li", null, inline(t, ctx))))));
  }
  g.sections.forEach((sec, i) => {
    article.append(h("section", { class: "g-section", id: `s-${sec.id}`, dataset: { section: sec.id } },
      h("h2", null, h("span", { class: "num" }, String(i + 1)), sec.heading),
      sec.blocks.map((b) => block(b, ctx, state))));
  });

  // 出處
  if (g.sources && g.sources.length) {
    const srcs = g.sources.map((sid) => state.content.tax.sources.find((s) => s.id === sid)).filter(Boolean);
    article.append(h("section", { class: "g-section", id: "s-sources" },
      h("h2", null, "Sources"),
      h("p", null, "We keep a copy of each page and re-read it every week. Click any underlined figure above to see the exact official sentence behind it."),
      h("ul", { class: "sources-list" }, srcs.map((s) => {
        const st = sourceStatus(s);
        return h("li", null,
          h("span", null,
            h("a", { class: "src-name", href: s.url, target: "_blank", rel: "noopener", title: s.title }, sourceTitle(s)),
            h("span", { class: "src-sub" }, sourceLabelLine(s))),
          h("span", { class: `verify ${st.cls}` }, st.text));
      }))));
  }

  // 問 AI
  const prompts = PROMPTS[g.slug] || [];
  if (prompts.length) {
    article.append(h("aside", { class: "ask-card" },
      h("div", null,
        h("h3", null, "Still have a question?"),
        h("p", null, "On a computer with Claude Code, press “Connect Claude” at the top of the page, then ask in your own words. Claude answers from these guides and figures, runs the calculator and opens the page it used. Click a prompt to copy it."),
        h("div", { class: "prompt-chips" }, prompts.map((p) => {
          const b = h("button", { type: "button", class: "prompt-chip" }, p);
          b.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(p); b.textContent = "Copied — paste it to Claude"; setTimeout(() => { b.textContent = p; }, 1800); } catch { /* 剪貼簿不可用 */ }
          });
          return b;
        })))));
  }

  // 相關閱讀
  const related = (g.related || []).map((s) => state.guidesBySlug[s]).filter(Boolean);
  if (related.length) {
    article.append(h("section", { class: "g-section", style: "margin-top:44px" },
      h("h2", null, "Read next"),
      h("ol", { class: "guide-list" }, related.map((rg, i) => guideRow(rg, i + 1)))));
  }

  const tocLinks = g.sections.map((sec) => {
    const a = h("a", { href: `#/guide/${g.slug}?s=${sec.id}`, dataset: { target: sec.id } }, sec.heading);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(`s-${sec.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `${location.pathname}${location.search}#/guide/${g.slug}?s=${sec.id}`);
    });
    return h("li", null, a);
  });
  const toc = h("nav", { class: "toc", "aria-label": "On this page" },
    h("h2", { class: "toc-h" }, "On this page"), h("ol", null, tocLinks));

  const node = h("div", null, hero, h("div", { class: "wrap guide-layout" }, toc, article));

  const after = () => {
    const target = params.get("s");
    if (target) document.getElementById(`s-${target}`)?.scrollIntoView({ behavior: fromAgent ? "smooth" : "auto", block: "start" });
    // 目錄標出「讀到哪一節」：頂端已經捲過視窗 30% 高度的最後一節。
    // 用捲動位置算，不用 IntersectionObserver —— 一次跳過好幾節時觀察者不會觸發，標示會停在舊的那節
    const sections = [...article.querySelectorAll("[data-section]")];
    const links = [...toc.querySelectorAll("a")];
    let ticking = false;
    const mark = () => {
      ticking = false;
      if (!toc.isConnected) { window.removeEventListener("scroll", onScroll); return; }
      const line = window.innerHeight * 0.3;
      let current = null;
      for (const sec of sections) if (sec.getBoundingClientRect().top <= line) current = sec.dataset.section;
      for (const a of links) a.setAttribute("aria-current", String(a.dataset.target === current));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    mark();
  };
  return { title: g.title, node, after, keepScroll: Boolean(params.get("s")) };
}
