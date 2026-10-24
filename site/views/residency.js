// 「今年在台灣待了幾天」：大號的數字欄、一年一格一天的格子、身分與下一個期限。
// 原本在首頁，首頁改成介紹頁之後搬到稅務頁最上面；介紹頁的第一題也用同一個 statusFor。

import { h, icon } from "../lib/dom.js";
import { taipeiParts, addDays } from "../lib/time.js";
import { shortDate } from "../lib/format.js";
import { residency, resolveParams } from "../lib/tax.js";
import { yearGrid, dayOfYear, daysInYear, factMark, figure } from "./report.js";
import { nextCalendarItem } from "./tax.js";

/** 天數 → 身分說明。今年還沒過完，所以要說「還差幾天、待到哪天就夠」。 */
export function statusFor(days, { year, todayYmd, P, total }) {
  const res = residency(days, P);
  const line = P.residency_days.value;
  const left = Math.max(0, total - dayOfYear(todayYmd));
  if (res.resident) {
    return { word: "Resident", tone: "red", text: `Past ${line} days, so you're taxed like a local: progressive rates on net income, and you file each May.` };
  }
  const need = line - res.days;
  if (need <= left) {
    const by = addDays(todayYmd, need);
    return { word: "Not yet", tone: null, text: `${need} more days in Taiwan makes you a resident for ${year}. Staying without a break, that's ${shortDate(`${by}T12:00:00+08:00`)}.` };
  }
  return { word: "Non-resident", tone: null, text: `Fewer than ${line} days are possible in ${year} now. Your Taiwan salary is taxed by flat withholding.` };
}

/** 今年的課稅年度、今天、參數與預設天數（從 1 月 1 日起每天都在；入境當天不算，所以是第幾天減一） */
export function residencyContext(state) {
  const t = taipeiParts();
  const year = Number(t.ymd.slice(0, 4));
  const P = resolveParams(state.content.tax, year);
  return { year, todayYmd: t.ymd, P, total: daysInYear(year), elapsed: Math.max(0, dayOfYear(t.ymd) - 1) };
}

/**
 * 整塊的天數工具。route 是天數要同步到的網址（#/tax?days=212），
 * headingLevel 決定那句問題是頁面的 h1 還是章節的 h2。
 */
export function residencyAsk({ state, params, route, headingLevel = "h2" }) {
  const rc = residencyContext(state);
  const { year, todayYmd, P, elapsed } = rc;
  const tax = state.content.tax;
  const grid = yearGrid({ year, todayYmd, line: P.residency_days.value });

  const fromUrl = params.get("days");
  const start = fromUrl !== null && fromUrl !== "" ? Math.max(0, Number(fromUrl) || 0) : elapsed;

  const input = h("input", {
    id: "days", class: "days-input", type: "number", inputmode: "numeric", min: "0", max: String(grid.total),
    value: String(start), "aria-describedby": "days-hint",
  });
  const unit = h("span", { class: "days-unit" });
  const sizer = h("span", { class: "days-input days-sizer", "aria-hidden": "true" });
  const hint = h("p", { class: "days-hint", id: "days-hint" });

  const statusSlot = h("div", { class: "fig" });
  const estimateLink = h("a", { class: "fig link" });

  const paint = (days, { sync = true } = {}) => {
    const d = Math.max(0, Math.min(grid.total, Math.floor(Number(days) || 0)));
    grid.update(d);
    // 欄寬跟著數字的實際寬度走，「days」才會緊貼在數字後面（用同字型的影子量）
    sizer.textContent = String(input.value || d);
    if (sizer.offsetWidth) input.style.width = `${sizer.offsetWidth + 6}px`;
    unit.textContent = d === 1 ? "day" : "days";
    hint.textContent = String(d) === String(elapsed) && fromUrl === null
      ? "Filled in as if you've been here since 1 January. Change it to your own count."
      : "Arrival days don't count; departure days do.";
    const s = statusFor(d, rc);
    statusSlot.replaceChildren(
      h("p", { class: "fig-l" }, `Your status for ${year}`),
      h("p", { class: `fig-v${s.tone ? ` ${s.tone}` : ""}` }, s.word, factMark("residency_days", state)),
      h("p", { class: "fig-t" }, s.text));
    estimateLink.href = `#/tax/calculator?year=${year}&days=${d}`;
    estimateLink.replaceChildren(
      h("p", { class: "fig-v" }, "Estimate your tax", h("span", { class: "arrow" }, icon("arrow"))),
      h("p", { class: "fig-t" }, `Uses your ${d} days. Every line shows the official source it comes from.`));
    if (sync) window.site.navigate(route, { days: d }, { replace: true, render: false });
  };
  input.addEventListener("input", () => paint(input.value));

  const next = nextCalendarItem(tax.calendar, todayYmd);
  const deadline = next
    ? h("div", { class: "fig" },
      h("p", { class: "fig-l" }, "Next on the tax calendar"),
      h("p", { class: "fig-v" }, next.whenLabel, next.item.fact ? factMark(next.item.fact, state) : null),
      h("p", { class: "fig-t" }, next.item.title))
    : figure({ label: "Next on the tax calendar", value: "Nothing due", text: "The calendar for next year appears once it's announced." });

  const node = h("section", { class: "wrap ask" },
    h("div", { class: "ask-q" },
      h("label", { for: "days" }, h(headingLevel, { class: "ask-title" }, `How many days have you been in Taiwan in ${year}?`)),
      h("div", { class: "days-field" }, input, unit, sizer),
      hint,
      h("p", { class: "days-alt" }, "Not sure? ", h("a", { href: `#/tax/calculator?year=${year}&mode=trips` }, "Count from your trips instead"), ": add each arrival and departure and we'll do the counting.")),
    h("div", { class: "ask-grid" }, grid.el),
    h("div", { class: "figs" }, statusSlot, deadline, estimateLink));

  paint(start, { sync: false });
  return { node, after: () => paint(input.value, { sync: false }) };
}
