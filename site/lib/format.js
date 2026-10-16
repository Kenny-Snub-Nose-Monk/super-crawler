// 顯示用的格式化。網站對象是在台工作的外國人，所以介面是英文，
// 但活動標題保留來源的原文 —— 翻錯比不翻糟，而且到了現場看到的是中文。

export const TYPE_META = {
  outdoor_challenge: { en: "Outdoor challenge", icon: "mountain" },
  sports: { en: "Sports", icon: "sun" },
  language_exchange: { en: "Language exchange", icon: "chat" },
  music: { en: "Music", icon: "music" },
  market: { en: "Market", icon: "bag" },
  exhibition: { en: "Exhibition", icon: "frame" },
  talk: { en: "Talk & workshop", icon: "mic" },
  food: { en: "Food & drink", icon: "cup" },
  festival: { en: "Festival", icon: "sparkle" },
  social: { en: "Social", icon: "people" },
  other: { en: "Other", icon: "compass" },
};

// 官方來源的出版單位：介面只用英文，原文標題留在連結的提示裡
const PUBLISHER_EN = {
  財政部: "Ministry of Finance",
  財政部臺北國稅局: "National Taxation Bureau of Taipei",
  行政院公報: "Executive Yuan Gazette",
  法務部全國法規資料庫: "Laws & Regulations Database",
  財政部主管法規共用系統: "Ministry of Finance rulings",
  勞動部: "Ministry of Labor",
  內政部移民署: "National Immigration Agency",
  "國家發展委員會 Talent Taiwan": "Talent Taiwan",
  國家發展委員會: "National Development Council",
  "104 人力銀行": "104 Job Bank",
  Money101: "Money101",
};

export function publisherEn(p) {
  return PUBLISHER_EN[p] || p || "Official source";
}

/** 來源的英文名稱（content/tax/source_names.yaml）；沒有的子頁退回「出版單位 + page」 */
export function sourceTitle(s) {
  return (s && s.title_en) || `${publisherEn(s && s.publisher)} page`;
}

/** 來源的一行說明：哪個單位、原文是什麼語言 */
export function sourceLabelLine(s) {
  const lang = s.lang === "en" || /^Talent Taiwan|^NTB Taipei/.test(s.title || "") ? "in English" : "in Chinese";
  return `${publisherEn(s.publisher)} · official page ${lang}`;
}

export const SOURCE_LABELS = {
  accupass: "Accupass",
  travel_taipei: "Travel Taipei",
  anncr: "ANNCR",
  trendy_taipei: "Trendy Taipei",
  taiwan_pathfinder: "Taiwan Pathfinder",
  meetup: "Meetup",
  talent_taiwan: "Talent Taiwan",
};

// crawler/normalize.py 的 EN_DISTRICTS 反過來。地址是中文時，給外國人看英文區名。
export const DISTRICT_EN = {
  中正區: "Zhongzheng", 大同區: "Datong", 中山區: "Zhongshan", 松山區: "Songshan",
  大安區: "Da'an", 萬華區: "Wanhua", 信義區: "Xinyi", 士林區: "Shilin",
  北投區: "Beitou", 內湖區: "Neihu", 南港區: "Nangang", 文山區: "Wenshan",
  板橋區: "Banqiao", 三重區: "Sanchong", 中和區: "Zhonghe", 永和區: "Yonghe",
  新莊區: "Xinzhuang", 新店區: "Xindian", 樹林區: "Shulin", 鶯歌區: "Yingge",
  三峽區: "Sanxia", 淡水區: "Tamsui", 汐止區: "Xizhi", 瑞芳區: "Ruifang",
  土城區: "Tucheng", 蘆洲區: "Luzhou", 五股區: "Wugu", 泰山區: "Taishan",
  林口區: "Linkou", 深坑區: "Shenkeng", 石碇區: "Shiding", 坪林區: "Pinglin",
  三芝區: "Sanzhi", 石門區: "Shimen", 八里區: "Bali", 平溪區: "Pingxi",
  雙溪區: "Shuangxi", 貢寮區: "Gongliao", 金山區: "Jinshan", 萬里區: "Wanli", 烏來區: "Wulai",
};
export const CITY_EN = { 臺北市: "Taipei", 新北市: "New Taipei" };

const TZ = "Asia/Taipei";
const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
const F = {
  day: fmt({ day: "numeric" }),
  month: fmt({ month: "short" }),
  weekday: fmt({ weekday: "short" }),
  time: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
  full: fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  short: fmt({ day: "numeric", month: "short", year: "numeric" }),
  dayMonth: fmt({ day: "numeric", month: "short" }),
};

export function dateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return null;
  const time = F.time.format(d);
  return {
    day: F.day.format(d), month: F.month.format(d), weekday: F.weekday.format(d),
    // 來源只給日期時我們補成 00:00；這種時候不顯示時間，免得像是半夜的活動
    time: time === "00:00" ? null : time,
    full: F.full.format(d), short: F.short.format(d), dayMonth: F.dayMonth.format(d),
  };
}

export function formatWhen(ev) {
  const s = dateParts(ev.starts_at);
  if (!s) return { line: "Date not listed", long: "The source did not list a date" };
  const e = dateParts(ev.ends_at);
  const sameDay = e && e.short === s.short;
  const line = `${s.weekday} ${s.day} ${s.month}${s.time ? ` · ${s.time}` : ""}`;
  let long = `${s.full}${s.time ? `, ${s.time}` : ""}`;
  if (e && sameDay && e.time && e.time !== "23:59") long += ` – ${e.time}`;
  if (e && !sameDay) long = `${s.short} – ${e.short}`;
  const range = e && !sameDay ? `${s.dayMonth} – ${e.dayMonth}` : null;
  return { line, long, range, start: s, end: e };
}

export function isOnline(ev) {
  return (ev.tags || []).includes("online");
}

export function placeName(ev) {
  return ev.venue || ev.address || null;
}

export function areaName(ev) {
  const district = ev.district ? DISTRICT_EN[ev.district] || ev.district : null;
  const city = ev.city ? CITY_EN[ev.city] || ev.city : null;
  return [district, city].filter(Boolean).join(", ") || null;
}

export function formatWhere(ev) {
  if (isOnline(ev)) return "Online";
  const parts = [placeName(ev), areaName(ev)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Location not listed";
}

/** 費用是三態：免費 / 要錢 / 來源沒說。「沒說」要照實講，不能當成免費或要錢。 */
export function formatPrice(ev) {
  if (ev.is_free === true || /^(免費|free)$/i.test(ev.price_text || "")) return { text: "Free", cls: "free", known: true };
  if (ev.is_free === false) return { text: ev.price_text || "Paid", cls: "paid", known: true };
  if (ev.price_text) return { text: ev.price_text, cls: "paid", known: true };
  return { text: "Price not listed", cls: "unknown", known: false };
}

/** 唯一的判準是 lang:en 標籤 —— 過濾、徽章、WebMCP 都看這個。
 *  有英文標題的活動在匯出時就補上了標籤（scripts/export_site_data.py），不在這裡另外判斷，
 *  否則會出現「有英文友善徽章、但勾了英文友善卻篩不到」的情形。 */
export function isEnglishFriendly(ev) {
  return (ev.tags || []).includes("lang:en");
}

/** 只放行 http(s) 連結。來源給的網址（例如 Taiwan Pathfinder 的公開試算表）不能直接信任。 */
export function safeUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
}

export function languages(ev) {
  const names = { en: "English", zh: "Mandarin", ja: "Japanese", ko: "Korean", fr: "French", es: "Spanish" };
  return (ev.tags || []).filter((t) => t.startsWith("lang:")).map((t) => names[t.slice(5)] || t.slice(5));
}

export function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.other;
}

export function sourceLabel(platform) {
  return SOURCE_LABELS[platform] || platform;
}

export function isNew(ev, now = Date.now(), days = 7) {
  return ev.first_seen && now - Date.parse(ev.first_seen) < days * 86400000;
}

const NT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export function money(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `NT$${NT.format(Math.round(n))}`;
}
export function num(n) {
  return NT.format(Math.round(n));
}
export function pct(x, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export function shortDate(iso) {
  const p = dateParts(iso);
  return p ? p.short : "—";
}
