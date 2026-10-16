// 台北時間的日期運算。
//
// 瀏覽器的本地時區不一定是台北（使用者可能剛下飛機），所以「今天」「這個週末」
// 一律先換成台北的年月日，再用 UTC 做純日曆運算，最後補上 +08:00。
// 不用 Date 的本地時區方法 —— 那會讓同一個網址在東京與台北查到不同的週末。

const TZ = "Asia/Taipei";
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export function taipeiParts(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  return { y, m, d, hh: +p.hour % 24, mm: +p.minute, ymd: ymd(y, m, d), wd: weekday(ymd(y, m, d)) };
}

export function ymd(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toUtc(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s, n) {
  const t = new Date(toUtc(s) + n * 86400000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = 週日 … 6 = 週六 */
export function weekday(s) {
  return new Date(toUtc(s)).getUTCDay();
}

export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export const dayStart = (s) => `${s}T00:00:00+08:00`;
export const dayEnd = (s) => `${s}T23:59:59+08:00`;

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 搜尋與首頁共用的時間窗。每個窗都是 {start, end, label}，start/end 是帶時區的 ISO。 */
export function windows(now = new Date()) {
  const t = taipeiParts(now);
  const today = t.ymd;
  const wd = t.wd;
  // 這個週末：週一到週五 → 接下來的週六日；週六 → 今明兩天；週日 → 今天
  const sat = wd === 0 ? addDays(today, -1) : addDays(today, (6 - wd) % 7);
  const sun = addDays(sat, 1);
  const weekendStart = wd === 0 ? today : wd === 6 ? today : sat;
  const thisSunday = wd === 0 ? today : addDays(today, 7 - wd);
  const nextMonday = addDays(thisSunday, 1);
  const endOfMonth = ymd(t.y, t.m, lastDayOfMonth(t.y, t.m));
  const nextSat = addDays(sat, 7);
  return {
    today: { start: dayStart(today), end: dayEnd(today), label: "Today" },
    tonight: { start: `${today}T17:00:00+08:00`, end: dayEnd(today), label: "Tonight" },
    tomorrow: { start: dayStart(addDays(today, 1)), end: dayEnd(addDays(today, 1)), label: "Tomorrow" },
    weekend: { start: dayStart(weekendStart), end: dayEnd(sun), label: "This weekend" },
    nextWeekend: { start: dayStart(nextSat), end: dayEnd(addDays(nextSat, 1)), label: "Next weekend" },
    week: { start: dayStart(today), end: dayEnd(thisSunday), label: "This week" },
    nextWeek: { start: dayStart(nextMonday), end: dayEnd(addDays(nextMonday, 6)), label: "Next week" },
    month: { start: dayStart(today), end: dayEnd(endOfMonth), label: "This month" },
    next7: { start: dayStart(today), end: dayEnd(addDays(today, 6)), label: "Next 7 days" },
    next30: { start: dayStart(today), end: dayEnd(addDays(today, 29)), label: "Next 30 days" },
  };
}

/** 月份名稱 → 那個月（今年或明年，取還沒過完的那一個）的時間窗 */
export function monthWindow(monthIndex1, now = new Date()) {
  const t = taipeiParts(now);
  const y = monthIndex1 < t.m ? t.y + 1 : t.y;
  const first = ymd(y, monthIndex1, 1);
  const start = monthIndex1 === t.m ? t.ymd : first;
  const end = ymd(y, monthIndex1, lastDayOfMonth(y, monthIndex1));
  const name = new Date(Date.UTC(y, monthIndex1 - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return { start: dayStart(start), end: dayEnd(end), label: name };
}
