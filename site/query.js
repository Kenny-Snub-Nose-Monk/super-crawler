// 活動查詢 —— crawler/store.py 的 EventStore.query 在瀏覽器裡的同語意實作。
//
// 網頁的過濾列和 WebMCP 工具都呼叫這裡，所以 Claude 查到的就是畫面上的。
// 語意由 tests/fixtures/query_cases.json 規定，Python 與這支各跑一次。
// 改行為時先改那份案例，再兩邊一起改。

const STATUS_RANK = { upcoming: 0, ongoing: 1 };
const DEFAULT_STATUSES = ["upcoming", "ongoing"];
const DEFAULT_EXCLUDE_FEEDBACK = ["not_my_thing"];

function parse(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function searchBlob(ev) {
  const parts = [ev.title, ev.title_en, ev.description, ev.venue, ev.organizer, ...(ev.tags || [])];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function queryEvents(events, params = {}, now = Date.now()) {
  const {
    types, tags, city, keyword, free_only = false,
    exclude_keywords, exclude_online = false, require_venue = false,
    start_after, start_before, signup_open = false,
    exclude_feedback = DEFAULT_EXCLUDE_FEEDBACK,
    statuses = DEFAULT_STATUSES,
  } = params;

  const typeSet = types && types.length ? new Set(types) : null;
  const tagList = tags && tags.length ? tags : null;
  const statusSet = new Set(statuses);
  const skipFb = new Set(exclude_feedback || []);
  const badWords = (exclude_keywords || []).map((w) => w.toLowerCase());
  const needle = (keyword || "").trim().toLowerCase();
  const after = parse(start_after);
  const before = parse(start_before);
  const nowMs = typeof now === "number" ? now : parse(now);

  const out = events.filter((ev) => {
    const evTags = ev.tags || [];
    if (!statusSet.has(ev.status)) return false;
    if (skipFb.has(ev.feedback)) return false;
    if (exclude_online && evTags.includes("online")) return false;
    if (require_venue && !(ev.address || ev.venue)) return false;
    if (badWords.length) {
      const blob = `${ev.title} ${ev.description || ""}`.toLowerCase();
      if (badWords.some((w) => blob.includes(w))) return false;
    }
    if (typeSet && !typeSet.has(ev.type)) return false;
    if (tagList && !tagList.every((t) => evTags.includes(t))) return false;
    if (city && ev.city !== city) return false;
    // is_free 是三態，null（不知道）不算免費
    if (free_only && ev.is_free !== true) return false;
    if (needle && !searchBlob(ev).includes(needle)) return false;
    const start = parse(ev.starts_at);
    if (after !== null && (start === null || start < after)) return false;
    if (before !== null && (start === null || start > before)) return false;
    if (signup_open) {
      // signup_deadline 是 null 代表「來源沒給」，不是「沒有截止日」，退回用開始時間判斷
      const deadline = parse(ev.signup_deadline) ?? start;
      if (deadline !== null && deadline < nowMs) return false;
    }
    return true;
  });

  const rank = (ev) => STATUS_RANK[ev.status] ?? 9;
  const key = (ev) => ev.starts_at || "9999";
  return out.sort((a, b) => rank(a) - rank(b) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

// 網頁過濾列與 WebMCP 工具共用的參數正規化。
// 日期可以給 YYYY-MM-DD（當成台北時間的整天），也可以給完整 ISO 8601。
export function normalizeParams(raw = {}) {
  const p = {};
  if (raw.keyword && raw.keyword.trim()) p.keyword = raw.keyword.trim();
  if (Array.isArray(raw.types) && raw.types.length) p.types = raw.types;
  if (raw.city) p.city = raw.city;
  if (raw.start_after) p.start_after = toIso(raw.start_after, "00:00:00");
  if (raw.start_before) p.start_before = toIso(raw.start_before, "23:59:59");
  for (const flag of ["free_only", "signup_open", "exclude_online"]) {
    if (raw[flag]) p[flag] = true;
  }
  return p;
}

function toIso(value, time) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${time}+08:00` : value;
}
