// WebMCP 工具：讓 AI 助理（例如透過 MCP-B relay 接上的 Claude Code）查這個網站。
//
// 工具走的是跟過濾列同一條路（window.eventsSite.applyParams → query.js），
// 所以助理查到的就是畫面上的，而且畫面會跟著變。
// 兩個工具都唯讀。為什麼走 WebMCP 而不是 HTTP MCP：docs/adr/0002-webmcp-via-mcp-b-relay.md
import { TYPE_LABELS } from "./app.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UNKNOWN = "unknown";
// 對助理隱藏的欄位：內部簿記，或使用者自己的標記
const HIDDEN_FIELDS = ["content_hash", "schema_version", "first_seen", "feedback"];

const todayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
});

// 未知 ≠ 否：來源沒給的值明確寫成 "unknown"，不要讓助理把 null 讀成「沒有」或「要錢」
function markUnknowns(ev) {
  return {
    ...ev,
    starts_at: ev.starts_at ?? UNKNOWN,
    is_free: ev.is_free ?? UNKNOWN,
    signup_deadline: ev.signup_deadline ?? UNKNOWN,
  };
}

function summarize(ev) {
  const e = markUnknowns(ev);
  return {
    uid: e.uid,
    title: e.title,
    type: e.type,
    status: e.status,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    venue: e.venue,
    district: e.district,
    city: e.city,
    online: (e.tags || []).includes("online"),
    is_free: e.is_free,
    price_text: e.price_text,
    signup_deadline: e.signup_deadline,
    source: e.source_platform,
    source_url: e.source_url,
  };
}

function detail(ev) {
  const e = markUnknowns(ev);
  for (const f of HIDDEN_FIELDS) delete e[f];
  return e;
}

function text(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

function highlight(uid) {
  const card = document.querySelector(`.card[data-uid="${CSS.escape(uid)}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth; // 重新觸發動畫
  card.classList.add("flash");
}

async function register() {
  const site = window.eventsSite;
  await site.ready;
  const today = todayFmt.format(new Date()); // 例如 "Tue, 2026-09-29"
  const typeList = Object.entries(TYPE_LABELS).map(([k, v]) => `${k}（${v}）`).join("、");

  await document.modelContext.registerTool({
    name: "search_events",
    description:
      `搜尋雙北（臺北市、新北市）的活動。今天是 ${today}（Asia/Taipei）。` +
      "「這個週末」「這個月」這類相對日期，請以今天換算成 start_after / start_before。" +
      "結果預設不含已過期的活動；排序為即將開始的在前、已在進行中的在後。" +
      "欄位值為 \"unknown\" 代表來源沒有提供，不代表「否」：is_free 為 unknown 不等於要付費，" +
      "signup_deadline 為 unknown 不等於沒有截止日。回報給使用者時請照實說明。" +
      "呼叫後，網頁上的過濾列與清單會顯示同一組條件與結果。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "關鍵字，不分大小寫，比對標題、英文標題、描述、場地、主辦單位、標籤。中文不做分詞，請用短詞。",
        },
        types: {
          type: "array",
          items: { type: "string", enum: Object.keys(TYPE_LABELS) },
          description: `活動類型，符合任一即可。可用值：${typeList}`,
        },
        start_after: {
          type: "string",
          description: "開始時間下限。YYYY-MM-DD（當天 00:00 台北時間起）或帶時區的 ISO 8601。",
        },
        start_before: {
          type: "string",
          description: "開始時間上限。YYYY-MM-DD（到當天 23:59:59 台北時間）或帶時區的 ISO 8601。只看開始時間，沒有開始時間的活動會被排除。",
        },
        city: { type: "string", enum: ["臺北市", "新北市"], description: "只看某個城市。不給就是雙北。" },
        free_only: { type: "boolean", description: "只要確定免費的。費用未知的會被排除。" },
        signup_open: {
          type: "boolean",
          description: "只要還能報名的。截止日未知時，以開始時間是否已過判斷（結果可能不準，請向使用者說明）。",
        },
        exclude_online: { type: "boolean", description: "排除線上活動。" },
        limit: {
          type: "integer", minimum: 1, maximum: MAX_LIMIT,
          description: `最多回傳幾筆，預設 ${DEFAULT_LIMIT}。total 會告訴你總共有幾筆。`,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async execute(args = {}) {
      const { limit = DEFAULT_LIMIT, ...raw } = args;
      const n = Math.min(Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT), MAX_LIMIT);
      const { params, results } = site.applyParams(raw);
      return text({
        today,
        params_applied: params,
        total: results.length,
        returned: Math.min(n, results.length),
        events: results.slice(0, n).map(summarize),
        page_url: location.href,
      });
    },
  });

  await document.modelContext.registerTool({
    name: "get_event",
    description:
      "用 search_events 回傳的 uid 取得單一活動的完整資料，包含描述、主辦單位、地址、標籤。" +
      "值為 \"unknown\" 代表來源沒有提供。呼叫後網頁會捲到這張卡片並標示出來（如果它在目前的清單裡）。",
    inputSchema: {
      type: "object",
      properties: { uid: { type: "string", description: "活動的 uid，例如 meetup:316481811" } },
      required: ["uid"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async execute({ uid }) {
      const ev = site.getEvent(uid);
      if (!ev) {
        return { ...text({ error: `找不到 uid 為 ${uid} 的活動` }), isError: true };
      }
      highlight(uid);
      return text(detail(ev));
    },
  });
}

// --- 本機 relay：預設不連 ---
//
// embed.js 一載入就會掃 127.0.0.1:9333–9348 找 relay。公開網站的一般訪客
// 不該被掃本機埠、也不該看到瀏覽器的「存取區域網路」權限提示，所以要主動開。
// 開過一次會記在這個瀏覽器裡；網址帶 ?relay=1 也可以直接開。

const RELAY_KEY = "webmcp-relay";

function relayWanted() {
  if (new URLSearchParams(location.search).get("relay") === "1") return true;
  try { return localStorage.getItem(RELAY_KEY) === "on"; } catch { return false; }
}

function loadRelayEmbed() {
  const s = document.createElement("script");
  s.src = "vendor/mcp-b/relay/embed.js";
  document.body.append(s);
}

function setupRelayToggle() {
  const btn = document.getElementById("relay");
  const on = relayWanted();
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "已連接本機 AI 助理" : "連接本機 AI 助理";
  if (on) loadRelayEmbed();
  btn.addEventListener("click", () => {
    try { localStorage.setItem(RELAY_KEY, on ? "off" : "on"); } catch { /* 無痕模式：只影響這次 */ }
    // 關閉需要重新載入才卸得掉 embed；開啟也一起重載，行為一致
    const url = new URL(location.href);
    url.searchParams.delete("relay");
    if (!on) url.searchParams.set("relay", "1");
    location.assign(url);
  });
}

register()
  .then(setupRelayToggle)
  .catch((err) => console.error("[webmcp] 工具註冊失敗", err));
