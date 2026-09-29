// 網頁的過濾列與清單。查詢本身在 query.js，這裡只管「參數 ↔ 表單 ↔ 網址 ↔ 畫面」。
//
// 對外暴露 window.eventsSite，讓 WebMCP 工具（webmcp.js）用同一條路徑更新畫面：
// Claude 呼叫 search_events 時，過濾列會跟著變，看到的就是同一份結果。
import { queryEvents, normalizeParams } from "./query.js";

export const TYPE_LABELS = {
  outdoor_challenge: "戶外挑戰",
  sports: "運動",
  language_exchange: "語言交流",
  music: "音樂",
  market: "市集",
  exhibition: "展覽",
  talk: "講座",
  food: "餐飲",
  festival: "節慶",
  social: "社交",
  other: "其他",
};

const SOURCE_LABELS = {
  accupass: "Accupass",
  travel_taipei: "臺北旅遊網",
  anncr: "嚷嚷社",
  trendy_taipei: "潮臺北",
  taiwan_pathfinder: "Taiwan Pathfinder",
  meetup: "Meetup",
};

const PAGE_SIZE = 60;
const FLAGS = ["free_only", "signup_open", "exclude_online"];
const TEXT_FIELDS = ["keyword", "start_after", "start_before", "city"];

const form = document.getElementById("filters");
const typesBox = document.getElementById("types");
const resultsEl = document.getElementById("results");
const summaryEl = document.getElementById("summary");
const moreBtn = document.getElementById("more");
const agentNote = document.getElementById("agent-note");
const cardTpl = document.getElementById("card");

const dayFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short",
});
const timeFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false,
});
const yearDayFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric",
});

let allEvents = [];
let current = [];
let shown = 0;

// --- 表單 ↔ 參數 ---

function readForm() {
  const fd = new FormData(form);
  const raw = { types: fd.getAll("types") };
  for (const k of TEXT_FIELDS) raw[k] = fd.get(k) || "";
  for (const k of FLAGS) raw[k] = fd.get(k) === "on";
  return normalizeParams(raw);
}

function writeForm(params) {
  for (const k of TEXT_FIELDS) {
    // 表單的日期欄只放得下 YYYY-MM-DD；工具給完整 ISO 時取日期部分顯示
    form.elements[k].value = (params[k] || "").slice(0, k.startsWith("start_") ? 10 : undefined);
  }
  for (const k of FLAGS) form.elements[k].checked = Boolean(params[k]);
  const types = new Set(params.types || []);
  for (const box of typesBox.querySelectorAll("input")) box.checked = types.has(box.value);
}

// --- 參數 ↔ 網址（分享連結、重新整理後保留條件）---

function paramsToUrl(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    sp.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v);
  }
  const qs = sp.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function paramsFromUrl() {
  const sp = new URLSearchParams(location.search);
  const raw = { types: (sp.get("types") || "").split(",").filter(Boolean) };
  for (const k of TEXT_FIELDS) raw[k] = sp.get(k) || "";
  for (const k of FLAGS) raw[k] = sp.get(k) === "1";
  return normalizeParams(raw);
}

// --- 畫面 ---

function formatWhen(ev) {
  if (!ev.starts_at) return "時間未知";
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : null;
  const sameDay = end && dayFmt.format(start) === dayFmt.format(end) &&
    start.getFullYear() === end.getFullYear();
  if (end && !sameDay) {
    return `${yearDayFmt.format(start)} – ${yearDayFmt.format(end)}`;
  }
  const head = `${dayFmt.format(start)} ${timeFmt.format(start)}`;
  return end ? `${head}–${timeFmt.format(end)}` : head;
}

function formatWhere(ev) {
  const place = ev.venue || ev.address;
  const area = [ev.city, ev.district].filter(Boolean).join(" ");
  if ((ev.tags || []).includes("online")) return place ? `線上 · ${place}` : "線上";
  return [place, area].filter(Boolean).join(" · ") || "地點未知";
}

function formatPrice(ev) {
  if (ev.is_free === true) return { text: "免費", cls: "free" };
  if (ev.is_free === false) return { text: ev.price_text || "付費", cls: "paid" };
  return { text: "費用未知", cls: "unknown" };
}

function renderCard(ev, params) {
  const node = cardTpl.content.firstElementChild.cloneNode(true);
  node.dataset.uid = ev.uid;
  const q = (sel) => node.querySelector(sel);
  q(".card-link").href = ev.source_url;
  q(".type").textContent = TYPE_LABELS[ev.type] || ev.type;
  q(".type").dataset.type = ev.type;
  q(".status").textContent = ev.status === "ongoing" ? "進行中" : "";
  q(".source").textContent = SOURCE_LABELS[ev.source_platform] || ev.source_platform;
  q(".title").textContent = ev.title;
  q(".when").textContent = formatWhen(ev);
  q(".where").textContent = formatWhere(ev);
  const price = formatPrice(ev);
  q(".price").textContent = price.text;
  q(".price").classList.add(price.cls);
  const deadline = q(".deadline");
  if (ev.signup_deadline) {
    deadline.textContent = `報名至 ${yearDayFmt.format(new Date(ev.signup_deadline))}`;
  } else if (params.signup_open) {
    // 未知 ≠ 否：來源沒給截止日，是用開始時間判斷「還能報名」的，要說出來
    deadline.textContent = "截止日未知，以開始時間判斷";
    deadline.classList.add("unknown");
  }
  return node;
}

function renderMore(params) {
  const frag = document.createDocumentFragment();
  for (const ev of current.slice(shown, shown + PAGE_SIZE)) frag.append(renderCard(ev, params));
  resultsEl.append(frag);
  shown = Math.min(shown + PAGE_SIZE, current.length);
  moreBtn.hidden = shown >= current.length;
  moreBtn.textContent = `顯示更多（還有 ${current.length - shown} 筆）`;
  moreBtn.onclick = () => renderMore(params);
}

function run(params, { fromAgent = false } = {}) {
  current = queryEvents(allEvents, params);
  shown = 0;
  resultsEl.replaceChildren();
  summaryEl.textContent = current.length ? `${current.length} 場活動` : "沒有符合條件的活動";
  agentNote.hidden = !fromAgent;
  if (fromAgent) agentNote.textContent = "這組條件來自 AI 助理的查詢（WebMCP 工具呼叫）";
  renderMore(params);
  paramsToUrl(params);
  return current;
}

// --- 對外介面（webmcp.js 用）---

window.eventsSite = {
  ready: null,
  get events() { return allEvents; },
  // 由 agent 觸發的查詢：更新表單、網址與清單，回傳完整結果
  applyParams(raw) {
    const params = normalizeParams(raw);
    writeForm(params);
    return { params, results: run(params, { fromAgent: true }) };
  },
  getEvent(uid) { return allEvents.find((e) => e.uid === uid) || null; },
};

// --- 啟動 ---

function buildTypeChips(types) {
  for (const t of types) {
    const label = document.createElement("label");
    label.className = "chip";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "types";
    box.value = t;
    label.append(box, TYPE_LABELS[t] || t);
    typesBox.append(label);
  }
}

async function boot() {
  const res = await fetch("data/events.json");
  const data = await res.json();
  allEvents = data.events;
  buildTypeChips(data.types);
  const stamp = yearDayFmt.format(new Date(data.generated_at));
  document.getElementById("stamp").textContent = `共 ${allEvents.length} 筆（含已過期）· 資料更新於 ${stamp}`;

  const initial = paramsFromUrl();
  writeForm(initial);
  run(initial);

  form.addEventListener("input", () => run(readForm()));
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("reset", () => setTimeout(() => run(readForm())));
}

window.eventsSite.ready = boot();
