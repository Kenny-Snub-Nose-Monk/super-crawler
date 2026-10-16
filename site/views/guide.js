// 指南頁（靜態資訊頁）。內容來自 content/guides/*.yaml，由匯出腳本帶進 content.json。
//
// 文章裡的每一個稅務數字都可以點：會打開一張小卡，寫著這個數字出自哪份官方文件、
// 哪天核對過，以及那一句官方原文。讀者不必相信我們，可以直接看原文。

import { h, html, frag, icon } from "../lib/dom.js";
import { inline } from "../lib/guides.js";
import { queryEvents } from "../query.js";
import { windows } from "../lib/time.js";
import { shortDate, plural, publisherEn, sourceTitle, sourceLabelLine } from "../lib/format.js";
import { motif } from "../lib/motifs.js";
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

const CALLOUT_ICONS = { tip: "bulb", warn: "alert", law: "scale", note: "info" };

let popover = null;

function closePopover() {
  if (popover) { popover.remove(); popover = null; }
}

function showFact(fid, anchor, state) {
  closePopover();
  const fact = state.facts[fid];
  if (!fact) return;
  const quote = fact.quotes && fact.quotes[0];
  const src = fact.sources.find((s) => quote && s.id === quote.source) || fact.sources[0];
  popover = h("div", { class: "fact-pop", role: "dialog", "aria-label": fact.label },
    h("p", { class: "eyebrow" }, fact.status === "verified" ? "Checked against the official text" : fact.status === "drifted" ? "Under review — the official page changed" : "Not automatically checked"),
    h("p", { class: "fact-pop-v" }, fact.display),
    h("p", { class: "fact-pop-l" }, fact.label),
    fact.note ? h("p", { class: "fact-pop-note" }, fact.note) : null,
    quote ? h("p", { class: "quote-label" }, /[一-鿿]/.test(quote.quote) ? "Official text (in Chinese)" : "Official text") : null,
    quote ? h("blockquote", { lang: /[一-鿿]/.test(quote.quote) ? "zh-Hant" : "en" }, `“${quote.quote}”`) : null,
    src ? h("p", { class: "fact-pop-src" },
      h("a", { href: src.url, target: "_blank", rel: "noopener", title: src.title }, `${publisherEn(src.publisher)} — ${sourceTitle(src)} ↗`),
      fact.checked_at ? h("span", null, ` · checked ${shortDate(fact.checked_at)}`) : null) : null);
  document.body.append(popover);
  const r = anchor.getBoundingClientRect();
  const top = window.scrollY + r.bottom + 10;
  const left = Math.min(Math.max(16, window.scrollX + r.left - 20), window.scrollX + document.documentElement.clientWidth - popover.offsetWidth - 16);
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

// 一個全域的監聽就好：點小卡以外、也不是點另一個數字時關掉
document.addEventListener("click", (e) => {
  if (popover && !popover.contains(e.target) && !e.target.closest("[data-fact]")) closePopover();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });
window.addEventListener("hashchange", closePopover);

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
    spec.title ? h("p", { class: "eyebrow" }, spec.title) : null,
    rows.length ? h("ol", { class: "rows" }, rows.map((ev) => eventRow(ev))) : emptyState("Nothing listed in this window right now."));
}

function block(b, ctx, state) {
  if (b.p) return h("p", null, inline(b.p, ctx));
  if (b.list) return h("ul", null, b.list.map((i) => h("li", null, inline(i, ctx))));
  if (b.steps) return h("ol", { class: "steps" }, b.steps.map((s) => h("li", null, h("span", { class: "t" }, s.title), inline(s.text || "", ctx))));
  if (b.callout) {
    const kind = b.callout.kind || "tip";
    return h("div", { class: `callout ${kind}` }, icon(CALLOUT_ICONS[kind] || "info"),
      h("div", null,
        b.callout.title ? h("p", { class: "callout-title" }, b.callout.title) : null,
        h("p", null, inline(b.callout.text || "", ctx))));
  }
  if (b.stats) return h("div", { class: "stats" }, b.stats.map((s) => h("div", { class: "stat" }, h("div", { class: "v" }, inline(String(s.value), ctx)), h("div", { class: "l" }, s.label))));
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

  const hero = h("header", { class: "band" },
    h("div", { class: "wrap guide-hero" },
      h("div", null,
        h("p", { class: "crumbs", style: "margin-bottom:12px" },
          g.kind === "tax" ? h("a", { href: "#/tax" }, "Tax") : h("a", { href: "#/topics" }, "Life in Taipei"), " / Guide"),
        h("h1", null, g.title),
        g.subtitle ? h("p", { class: "subtitle" }, g.subtitle) : null,
        h("div", { class: "meta-chips" },
          h("span", { class: "meta-chip" }, icon("clock"), `${g.reading_minutes} min read`),
          h("span", { class: "meta-chip" }, icon("calendar"), `Updated ${shortDate(`${g.updated}T12:00:00+08:00`)}`),
          g.sources ? h("span", { class: "meta-chip" }, icon("file"), plural(g.sources.length, "official source")) : null,
          h("span", { class: "guide-save" }, saveButton("guides", g.slug, g.title)))),
      html("div", { class: "guide-art", "aria-hidden": "true" }, motif(g.kind === "tax" ? "tax" : "social", g.slug, { w: 520, h: 360 }))));

  if (fromAgent) article.append(h("p", { class: "agent-banner" }, "Opened by your AI assistant"));
  if (g.takeaways) {
    article.append(h("aside", { class: "keypoints" },
      h("h2", null, "Key points"),
      g.summary ? h("p", { class: "lead" }, inline(g.summary, ctx)) : null,
      h("ul", null, g.takeaways.map((t) => h("li", null, icon("check"), h("span", null, inline(t, ctx)))))));
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
      h("h2", null, h("span", { class: "num" }, icon("file")), "Sources"),
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
      h("span", { class: "ask-icon" }, icon("chat")),
      h("div", null,
        h("h3", null, "Still have a question?"),
        h("p", null, "Press “Connect Claude” at the top of the page, then ask in your own words. Claude answers from these guides and figures, runs the calculator and opens the page it used. Click a prompt to copy it."),
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
    h("p", { class: "eyebrow" }, "On this page"), h("ol", null, tocLinks));

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
