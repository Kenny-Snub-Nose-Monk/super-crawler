// Ma —— 啟動、路由、共用狀態。
//
// 單頁應用、hash 路由：GitHub Pages 沒有伺服器端改寫，而且換頁不重新載入，
// WebMCP 工具就不會在使用者點來點去時消失又出現（見 docs/adr/0002）。
// 網址的 ?relay=1 在 hash 之外，路由不碰它。
//
// window.site 是給 webmcp.js 的介面：AI 助理呼叫工具時，走的是跟畫面同一條路，
// 所以它查到的就是畫面上的，而且畫面會跟著換到那個結果。

import { refreshStatus } from "./query.js";
import { buildGuideIndex } from "./lib/search.js";
import { plain } from "./lib/guides.js";
import { shortDate, plural } from "./lib/format.js";
import * as home from "./views/home.js";
import * as events from "./views/events.js";
import * as topics from "./views/topics.js";
import * as search from "./views/search.js";
import * as eventView from "./views/event.js";
import * as tax from "./views/tax.js";
import * as guide from "./views/guide.js";
import * as calculator from "./views/calculator.js";
import * as saved from "./views/saved.js";
import * as about from "./views/about.js";

const ROUTES = [
  [/^\/$/, home],
  [/^\/events$/, events],
  [/^\/topics$/, topics],
  [/^\/topic\/([\w-]+)$/, topics],
  [/^\/search$/, search],
  [/^\/event\/(.+)$/, eventView],
  [/^\/tax$/, tax],
  [/^\/tax\/calculator$/, calculator],
  [/^\/guide\/([\w-]+)$/, guide],
  [/^\/saved$/, saved],
  [/^\/about$/, about],
];

const viewEl = document.getElementById("view");
const toastEl = document.getElementById("agent-toast");
const toastText = document.getElementById("agent-toast-text");

export const state = {
  events: [],
  content: null,
  facts: {},
  guides: [],
  guidesBySlug: {},
  guideIndex: [],
  generatedAt: null,
  agent: null,          // 最近一次 AI 助理的工具呼叫：{tool, label, at}
};

// --- 路由 ---

export function parseHash() {
  const raw = location.hash.slice(1) || "/";
  const i = raw.indexOf("?");
  const path = i === -1 ? raw : raw.slice(0, i);
  return { path: path || "/", params: new URLSearchParams(i === -1 ? "" : raw.slice(i + 1)) };
}

export function hrefFor(path, params) {
  const sp = params instanceof URLSearchParams ? params : new URLSearchParams();
  if (!(params instanceof URLSearchParams) && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "" || v === false) continue;
      sp.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
    }
  }
  const qs = sp.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

/** 換頁。replace=true 時只改網址不留歷史（過濾條件變動用）；render=false 時不重畫 */
export function navigate(path, params, { replace = false, render: doRender = true, fromAgent = false } = {}) {
  const href = hrefFor(path, params);
  const url = `${location.pathname}${location.search}${href}`;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  if (doRender) render({ fromAgent });
  // 只改網址不重畫（過濾條件同步）時也要記下來：否則之後點「Events」回到 #/events，
  // 會被當成「同一個網址」而不重畫，畫面還停在篩選過的清單
  else lastHash = location.hash;
}

let lastPath = null;
let lastHash = null;

// 點連結會同時觸發 hashchange 與 popstate；同一個網址只畫一次
function onLocationChange() {
  if (location.hash !== lastHash) render();
}

export function render({ fromAgent = false } = {}) {
  lastHash = location.hash;
  const route = parseHash();
  let match = null, view = null;
  for (const [rx, mod] of ROUTES) {
    match = route.path.match(rx);
    if (match) { view = mod; break; }
  }
  if (!view) { navigate("/", null, { replace: true }); return; }
  const ctx = { ...route, args: match.slice(1).map(safeDecode), fromAgent, state };
  let out;
  try {
    out = view.render(ctx);
  } catch (err) {
    console.error(err);
    out = { title: "Something went wrong", node: errorNode(err) };
  }
  viewEl.replaceChildren(out.node);
  document.title = out.title ? `${out.title} · Ma` : "Ma — Taiwan tax for foreign professionals";
  const samePage = lastPath === route.path;
  if (!samePage && !out.keepScroll) window.scrollTo({ top: 0 });
  lastPath = route.path;
  highlightNav(route.path);
  // 頁首搜尋框跟著目前的搜尋詞（使用者正在打字時不動它）
  const hs = document.querySelector("#header-search input");
  if (hs && document.activeElement !== hs) hs.value = route.path === "/search" ? route.params.get("q") || "" : "";
  if (out.after) requestAnimationFrame(out.after);
}

// 手打或截斷的網址可能有壞掉的 %（#/event/%E0%A4%A）—— 解不開就原樣用，不讓整頁空白
function safeDecode(x) {
  try { return decodeURIComponent(x); } catch { return x; }
}

function highlightNav(path) {
  const section = path === "/" ? "home"
    : path.startsWith("/event") ? "events"
    : path.startsWith("/topic") ? "topics"
    : path === "/tax/calculator" ? "calculator"
    : path.startsWith("/tax") || path.startsWith("/guide") ? "tax"
    : path.slice(1).split("/")[0];
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function errorNode(err) {
  const d = document.createElement("div");
  d.className = "wrap empty";
  d.textContent = `This page could not be shown (${err.message}).`;
  return d;
}

// --- AI 助理的動作提示 ---

let toastTimer = null;
export function agentToast(label) {
  state.agent = { label, at: Date.now() };
  toastText.textContent = label;
  toastEl.hidden = false;
  toastEl.style.animation = "none";
  void toastEl.offsetWidth;
  toastEl.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5200);
}

// --- 啟動 ---

async function load() {
  const [ev, content] = await Promise.all([
    fetch("data/events.json").then((r) => r.json()),
    fetch("data/content.json").then((r) => r.json()),
  ]);
  state.events = refreshStatus(ev.events);
  state.generatedAt = ev.generated_at;
  state.content = content;
  state.facts = content.tax.facts;
  state.guides = content.guides;
  state.guidesBySlug = Object.fromEntries(content.guides.map((g) => [g.slug, g]));
  state.guideIndex = buildGuideIndex(content.guides, (t) => plain(t, state.facts));
}

function paintChrome() {
  const f = document.getElementById("freshness");
  const tax = state.content.tax;
  const active = state.events.filter((e) => e.status !== "expired" && e.status !== "cancelled").length;
  const pages = tax.sources.filter((s) => s.status === "ok").length;
  f.replaceChildren(
    `Events: ${shortDate(state.generatedAt)} · ${plural(active, "listing")}`,
    document.createElement("br"),
    `Tax pages: ${shortDate(tax.checked_at)} · ${plural(pages, "official page")}`);

  // 頁首的搜尋框：桌面版才有，送出就到搜尋頁
  const form = document.getElementById("header-search");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = form.elements.q.value.trim();
    navigate("/search", q ? { q } : null);
    form.elements.q.blur();
  });
}

async function boot() {
  await load();
  paintChrome();
  window.addEventListener("hashchange", onLocationChange);
  window.addEventListener("popstate", onLocationChange);
  render();
}

window.site = { ready: boot(), state, navigate, render, agentToast, parseHash, hrefFor };
