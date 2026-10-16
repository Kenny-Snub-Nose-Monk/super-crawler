// 一個搜尋框，同時找活動與指南。
//
// 沒有後端、也沒有模型：搜尋框裡的「this weekend」「free」「english」「183」
// 用規則解析成條件，剩下的字才拿去比對。解析結果會以可移除的標籤顯示在
// 結果頁上 —— 使用者要看得到「我們以為你在找什麼」，猜錯了一鍵拿掉。
//
// 結構化的條件最後還是交給 site/query.js 的 queryEvents（跟 Python 共用語意的那支），
// 這裡只多做兩件事：多個字的 AND 比對、與排序。

import { queryEvents } from "../query.js";
import { windows, monthWindow } from "./time.js";
import { TOPIC_WORDS, topicById, applySub } from "./topics.js";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

const WHEN_WORDS = [
  [/\b(tonight)\b|今晚/, "tonight"],
  [/\b(today)\b|今天/, "today"],
  [/\b(tomorrow)\b|明天/, "tomorrow"],
  [/\bnext weekend\b|下週末|下周末/, "nextWeekend"],
  [/\b(this )?weekend\b|週末|周末/, "weekend"],
  [/\bnext week\b|下週|下周/, "nextWeek"],
  [/\bthis week\b|這週|本週|這周|本周/, "week"],
  [/\bthis month\b|這個月|本月/, "month"],
];

const STOP = new Set(["events", "event", "in", "at", "the", "a", "an", "for", "and", "with", "near",
  "things", "thing", "to", "do", "what", "whats", "what's", "where", "how", "is", "are", "i", "my", "me",
  "find", "show", "any", "some", "of", "on", "about", "can", "should", "does", "need", "活動", "的", "有",
  "什麼", "哪裡", "嗎", "please", "taiwan"]);

const TAX_WORDS = ["tax", "taxes", "183", "resident", "residency", "refund", "withholding", "withheld",
  "gold card", "rsu", "esop", "stock", "deduction", "deductions", "exemption", "bracket", "brackets",
  "filing", "file", "return", "amt", "overseas income", "salary", "income", "nhi", "departure", "leaving",
  "稅", "報稅", "退稅", "扣繳", "居留", "金卡", "所得", "申報", "免稅", "扣除"];

const SYNONYMS = {
  "183": ["183", "resident", "residency", "days"],
  resident: ["resident", "residency", "183"],
  residency: ["residency", "resident", "183", "days"],
  days: ["days", "183", "arrival", "departure"],
  refund: ["refund", "refunds", "退稅"],
  "gold card": ["gold card", "special professional", "就業金卡", "incentive"],
  gold: ["gold card"],
  rsu: ["rsu", "stock", "shares", "equity", "esop"],
  esop: ["esop", "stock", "shares", "rsu"],
  stock: ["stock", "shares", "rsu"],
  withholding: ["withholding", "withheld", "18%", "6%", "扣繳"],
  withheld: ["withheld", "withholding"],
  deadline: ["deadline", "filing period", "may", "june"],
  file: ["file", "filing", "return"],
  filing: ["filing", "file", "return"],
  leave: ["leave", "leaving", "departure", "離境"],
  leaving: ["leaving", "departure", "leave"],
  overseas: ["overseas", "foreign income", "basic income", "amt"],
  amt: ["basic income tax", "amt", "minimum tax"],
  rent: ["rent", "rental"],
  children: ["children", "child", "dependent", "dependents"],
  kids: ["children", "child", "dependent"],
  dependents: ["dependent", "dependents", "exemption"],
  penalty: ["penalty", "penalties", "late", "fine"],
  rate: ["rate", "rates", "bracket", "progressive"],
  rates: ["rate", "rates", "bracket"],
  bracket: ["bracket", "brackets", "rate", "progressive"],
  freelance: ["professional fees", "freelance", "contractor"],
  spouse: ["spouse", "married", "joint"],
  married: ["married", "spouse", "joint"],
  salary: ["salary", "wage"],
  "報稅": ["file", "filing", "報稅", "申報"],
  "退稅": ["refund", "退稅"],
  "金卡": ["gold card", "就業金卡"],
  "扣繳": ["withholding", "扣繳"],
};

function hasTaxIntent(q) {
  return TAX_WORDS.some((w) => (/^[a-z0-9 ]+$/.test(w) ? new RegExp(`\\b${w}\\b`).test(q) : q.includes(w)));
}

/** 把搜尋字串解析成條件。回傳的 chips 是給畫面顯示「我們怎麼理解這句話」用的。 */
export function parseQuery(raw = "", now = new Date()) {
  let q = ` ${raw.toLowerCase().trim()} `;
  const out = { raw: raw.trim(), chips: [], tax: false, free: false, english: false, inPerson: false };
  const win = windows(now);

  // 每個解析出的條件都記下它在原句裡的字（raw），移除標籤時從原句拿掉那幾個字，
  // 不是把標籤文字（「Outdoors & active」）塞回去 —— 那會被當成要比對的字，結果變 0 筆
  const take = (rx, key, label) => {
    const m = q.match(rx);
    if (!m) return false;
    out.chips.push({ key, label, raw: m[0].trim() });
    q = q.replace(rx, " ");
    return true;
  };
  for (const [rx, key] of WHEN_WORDS) {
    if (take(rx, "when", win[key].label)) {
      out.when = { key, ...win[key] };
      break;
    }
  }
  if (!out.when) {
    // 「may」也是助動詞（may I deduct rent?）：只有「in may」或接著日期時才當月份
    const rx = new RegExp(`\\b(in )?(${MONTHS.filter((x) => x !== "may").join("|")})\\b|\\bin may\\b|\\bmay \\d{1,2}\\b|\\b\\d{1,2} may\\b`);
    const m = q.match(rx);
    if (m) {
      const name = MONTHS.find((x) => m[0].includes(x));
      const mw = monthWindow(MONTHS.indexOf(name) + 1, now);
      out.when = { key: "month:" + name, ...mw };
      take(rx, "when", mw.label);
    }
  }
  if (take(/\bfree\b|免費/, "free", "Free")) out.free = true;
  if (take(/\benglish(-| )?(friendly|speaking)?\b|英文|英語/, "english", "English-friendly")) out.english = true;
  if (take(/\bin[- ]person\b|\boffline\b|實體/, "inPerson", "In person")) out.inPerson = true;
  if (take(/\bnew taipei( city)?\b|新北市?/, "city", "New Taipei")) out.city = "新北市"; else if (/\btaipei( city)?\b|臺北市|台北市|台北|臺北/.test(q)) {
    // 「Taipei」多半只是語氣（events in Taipei），不當成「排除新北」—— 只拿掉這個字
    q = q.replace(/\btaipei( city)?\b|臺北市|台北市|台北|臺北/g, " ");
  }

  out.tax = hasTaxIntent(q);
  if (!out.tax) {
    for (const t of TOPIC_WORDS) {
      const hit = t.words.find((w) => (/^[a-z ]+$/.test(w) ? new RegExp(`\\b${w}\\b`).test(q) : q.includes(w)));
      if (hit) {
        out.topic = t.topic;
        out.sub = t.sub || null;
        const topic = topicById(t.topic);
        const sub = topic.subs.find((s) => s.id === t.sub);
        out.chips.push({ key: "topic", label: sub ? sub.name : topic.name, raw: hit });
        q = q.replace(hit, " ");
        break;
      }
    }
  }

  out.text = q.replace(/[?!.,，。？！]/g, " ").replace(/\s+/g, " ").trim();
  out.tokens = out.text.split(" ").filter((w) => w && !STOP.has(w));
  out.guideTokens = raw.toLowerCase().replace(/[?!.,，。？！]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  return out;
}

/** 移除某個解析出的條件（結果頁上按標籤的 ×）：從原句拿掉當初對應的那幾個字 */
export function withoutChip(parsed, key) {
  const chip = parsed.chips.find((c) => c.key === key);
  if (!chip || !chip.raw) return parsed.raw;
  const i = parsed.raw.toLowerCase().indexOf(chip.raw.toLowerCase());
  const rest = i === -1 ? parsed.raw : parsed.raw.slice(0, i) + " " + parsed.raw.slice(i + chip.raw.length);
  return rest.replace(/\s+/g, " ").trim();
}

function blob(ev) {
  return [ev.title, ev.title_en, ev.description, ev.venue, ev.address, ev.organizer, ...(ev.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
}

export function toQueryParams(parsed) {
  const p = {};
  if (parsed.when) { p.start_after = parsed.when.start; p.start_before = parsed.when.end; }
  if (parsed.free) p.free_only = true;
  if (parsed.english) p.tags = ["lang:en"];
  if (parsed.inPerson) p.exclude_online = true;
  if (parsed.city) p.city = parsed.city;
  if (parsed.topic) p.types = topicById(parsed.topic).types;
  return p;
}

export function searchEvents(events, parsed, now = Date.now()) {
  const params = toQueryParams(parsed);
  let rows = queryEvents(events, params, now);
  if (parsed.topic && parsed.sub) rows = applySub(rows, topicById(parsed.topic), parsed.sub);
  const tokens = parsed.tokens || [];
  if (!tokens.length) return rows;
  const scored = [];
  for (const ev of rows) {
    const b = blob(ev);
    if (!tokens.every((t) => b.includes(t))) continue;
    const title = `${ev.title} ${ev.title_en || ""}`.toLowerCase();
    scored.push({ ev, s: tokens.some((t) => title.includes(t)) ? 2 : 1 });
  }
  // 同一個相關度裡維持 queryEvents 的順序（即將開始的在前）
  return scored.sort((a, b) => b.s - a.s).map((x) => x.ev);
}

// --- 指南 ---------------------------------------------------------------

/** 指南的每一節（以及每一題 FAQ）展開成一筆可搜尋的條目。plain 由呼叫端提供（把行內標記與 fact 轉成文字）。 */
export function buildGuideIndex(guides, plain) {
  const out = [];
  for (const g of guides) {
    for (const sec of g.sections || []) {
      const texts = [];
      for (const b of sec.blocks || []) {
        if (b.faq) {
          for (const item of b.faq) {
            out.push({ slug: g.slug, sectionId: sec.id, guideTitle: g.title, kind: g.kind,
              heading: item.q, text: plain(item.a), keywords: (g.keywords || []).join(" "), faq: true });
          }
        } else {
          texts.push(blockText(b, plain));
        }
      }
      out.push({ slug: g.slug, sectionId: sec.id, guideTitle: g.title, kind: g.kind,
        heading: sec.heading, text: texts.join(" "), keywords: [...(g.keywords || []), ...(sec.keywords || [])].join(" ") });
    }
  }
  return out;
}

function blockText(b, plain) {
  if (b.p) return plain(b.p);
  if (b.list) return b.list.map(plain).join(" ");
  if (b.steps) return b.steps.map((s) => `${s.title}. ${plain(s.text || "")}`).join(" ");
  if (b.callout) return `${b.callout.title || ""} ${plain(b.callout.text || "")}`;
  if (b.table) return [...(b.table.head || []), ...(b.table.rows || []).flat()].map(plain).join(" ");
  if (b.stats) return b.stats.map((s) => `${s.label} ${plain(s.value || "")}`).join(" ");
  return "";
}

function count(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1 && n < 3) { n++; i += needle.length; }
  return n;
}

export function expandTokens(tokens) {
  const out = new Set();
  const joined = tokens.join(" ");
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    if (k.includes(" ") ? joined.includes(k) : tokens.includes(k)) vs.forEach((v) => out.add(v));
  }
  tokens.forEach((t) => out.add(t));
  return [...out];
}

export function searchGuides(index, parsed, limit = 6) {
  const base = parsed.guideTokens && parsed.guideTokens.length ? parsed.guideTokens : parsed.tokens || [];
  const tokens = expandTokens(base);
  if (!tokens.length) return [];
  const results = [];
  for (const e of index) {
    const head = e.heading.toLowerCase(), text = e.text.toLowerCase();
    const title = e.guideTitle.toLowerCase(), kw = e.keywords.toLowerCase();
    let score = 0, matched = 0;
    for (const t of tokens) {
      const s = count(head, t) * 4 + count(title, t) * 1.5 + count(kw, t) * 2 + count(text, t);
      if (s > 0) matched++;
      score += s;
    }
    if (!score) continue;
    // 命中的字越多樣越好：「183 departure」兩個都命中的段落，勝過只命中 183 三次的
    score *= 1 + matched / tokens.length;
    if (e.faq) score *= 1.1;
    results.push({ ...e, score, snippet: snippet(e.text, tokens) });
  }
  results.sort((a, b) => b.score - a.score);
  // 同一節只留最好的一筆
  const seen = new Set();
  return results.filter((r) => {
    const k = `${r.slug}#${r.sectionId}#${r.faq ? r.heading : ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}

function snippet(text, tokens, radius = 110) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, radius * 2) + (text.length > radius * 2 ? "…" : "");
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

// --- 一眼看完（結果頁頂端的摘要；是計算出來的，不是 AI 寫的）-----------------

export function glance(events) {
  if (!events.length) return null;
  const en = events.filter((e) => (e.tags || []).includes("lang:en")).length;
  const free = events.filter((e) => e.is_free === true).length;
  const unknownPrice = events.filter((e) => e.is_free == null && !e.price_text).length;
  const online = events.filter((e) => (e.tags || []).includes("online")).length;
  const districts = {};
  for (const e of events) if (e.district) districts[e.district] = (districts[e.district] || 0) + 1;
  const topDistrict = Object.entries(districts).sort((a, b) => b[1] - a[1])[0];
  // 結果是依相關度排的（標題命中在前），「最快開始的」要另外找
  const upcoming = events.filter((e) => e.status === "upcoming" && e.starts_at);
  const first = upcoming.reduce((a, b) => (!a || b.starts_at < a.starts_at ? b : a), null);
  return {
    total: events.length, english: en, free, unknownPrice, online,
    topDistrict: topDistrict ? { name: topDistrict[0], n: topDistrict[1] } : null,
    first,
  };
}
