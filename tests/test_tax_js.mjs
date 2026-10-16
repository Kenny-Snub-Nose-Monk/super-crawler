// 外籍人士稅務試算（site/lib/tax.js）的測試。
//
// 數字來自匯出的 site/data/content.json —— 也就是網站實際用的那一份，
// 所以先跑 python3 scripts/export_site_data.py。
// 驗證方式盡量用「官方自己的另一種算法」交叉比對：財政部的速算公式、
// 財政部手冊裡的天數實例，而不是拿我們自己的實作去對自己。
//
// 跑法： node tests/test_tax_js.mjs
import { readFileSync, existsSync } from "node:fs";
import { residency, countDays, progressive, estimate, resolveParams, latestArrivalForResidency } from "../site/lib/tax.js";
import { inputFromParams, paramsFromInput } from "../site/views/calculator.js";

const path = new URL("../site/data/content.json", import.meta.url);
if (!existsSync(path)) {
  console.error("找不到 site/data/content.json —— 先跑 python3 scripts/export_site_data.py");
  process.exit(1);
}
const content = JSON.parse(readFileSync(path, "utf-8"));
const P25 = resolveParams(content.tax, 2025);
const P26 = resolveParams(content.tax, 2026);
const failures = [];
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail !== "" ? "  " + detail : ""}`);
  if (!cond) failures.push(label);
}

console.log("1. 身分的三個區間");
check("90 天 → 非居住者（90 天內）", residency(90, P26).band === "le90");
check("91 天 → 非居住者（91–182）", residency(91, P26).band === "mid");
check("182 天 → 還不是居住者", !residency(182, P26).resident);
check("183 天 → 居住者", residency(183, P26).resident);

console.log("\n2. 天數：始日不計末日計（財政部手冊的例子）");
const ex = countDays([{ arrive: "2025-08-01", depart: "2025-11-20" }], 2025);
check("8/1 入境、11/20 出境 = 111 天（財政部手冊例二）", ex.projected === 111, ex.projected);
check("7/1 入境一直待著 = 183 天", countDays([{ arrive: "2026-07-01" }], 2026).projected === 183);
check("7/15 入境一直待著 = 169 天", countDays([{ arrive: "2026-07-15" }], 2026).projected === 169);
check("最晚 7/1 入境才住得滿 183 天", latestArrivalForResidency(2026, P26) === "2026-07-01", latestArrivalForResidency(2026, P26));
const trips = Array.from({ length: 12 }, (_, i) => ({ arrive: `2026-${String(i + 1).padStart(2, "0")}-01`, depart: `2026-${String(i + 1).padStart(2, "0")}-11` }));
check("一年 12 趟、每趟 10 天 = 120 天（多次入出境累積）", countDays(trips, 2026).projected === 120, countDays(trips, 2026).projected);
const cross = [{ arrive: "2025-12-20", depart: "2026-01-10" }];
check("跨年的一趟：2025 算 11 天", countDays(cross, 2025).projected === 11, countDays(cross, 2025).projected);
check("跨年的一趟：2026 算 10 天", countDays(cross, 2026).projected === 10, countDays(cross, 2026).projected);
const sofar = countDays([{ arrive: "2026-03-01" }], 2026, "2026-10-15");
check("還在台灣：算到今天 228 天", sofar.counted === 228, sofar.counted);
check("還在台灣：推到年底 305 天", sofar.projected === 305, sofar.projected);

console.log("\n3. 累進稅額 = 財政部速算公式（淨額 × 稅率 − 累進差額）");
const quick = content.tax.facts.quick_formula_2025.value;           // [0, 41300, 147700, 413700, 911700]
const rates = P25.brackets.value.map((b) => b[1]);
for (const net of [300000, 590000, 900000, 1330000, 2000000, 2660000, 4000000, 4980000, 7000000]) {
  const i = P25.brackets.value.findIndex(([upTo]) => upTo === null || net <= upTo);
  const official = net * rates[i] - quick[i];
  check(`2025 淨額 ${net.toLocaleString()}`, near(progressive(net, P25.brackets.value).tax, official), `${progressive(net, P25.brackets.value).tax} vs ${official}`);
}

console.log("\n4. 非居住者：就源扣繳");
let r = estimate({ days: 120, salary: 3000000 }, P26);
check("年薪 300 萬 × 18% = 540,000", r.total === 540000, r.total);
check("不用申報", r.mustFile === false);
r = estimate({ days: 120, salary: 500000, months: 12 }, P26);
check("月平均 41,667 ≤ 44,250 → 6%", near(r.total, 30000), r.total);
r = estimate({ days: 80, salary: 0, foreignPay: 1000000 }, P26);
check("90 天內：境外雇主給的報酬不課稅", r.total === 0, r.total);
r = estimate({ days: 120, salary: 0, foreignPay: 1000000 }, P26);
check("超過 90 天：境外雇主報酬 18%，而且要自己申報", r.total === 180000 && r.mustFile, `${r.total} ${r.mustFile}`);

console.log("\n5. 居住者：累進稅率（手算過的例子）");
r = estimate({ days: 365, salary: 3000000 }, P26);
check("2026 單身年薪 300 萬 → 354,100", r.total === 354100, r.total);
check("最高適用 20%", r.marginalRate === 0.2);
check("要申報", r.mustFile === true);
r = estimate({ days: 365, salary: 4200000, rent: 300000 }, P26);
check("年薪 420 萬：稅率 30%，租金扣除不適用 → 690,700", r.total === 690700, r.total);
check("並說明為什麼", r.notes.some((n) => n.includes("Rent deduction not allowed")));
r = estimate({ days: 365, salary: 1000000, rent: 200000 }, P26);
check("年薪 100 萬：5% 級距，租金扣 18 萬上限 → 17,800", r.total === 17800, r.total);

console.log("\n6. 家庭：未成年子女加成（2026 起）與基本生活費差額");
r = estimate({ days: 365, salary: 3000000, married: true, dependents: 2, minors: 2 }, P26);
check("已婚、兩名未成年子女 → 231,100（含基本生活費差額 75,000）", r.total === 231100, r.total);
check("明細裡有基本生活費差額", r.lines.some((l) => l.fact === "basic_living" && l.amount === -75000));
r = estimate({ days: 365, salary: 3000000, married: true, dependents: 2, minors: 2 }, P25);
check("同一家人在 2025 年度（沒有子女加成）稅比較高", r.total > 231100, r.total);

console.log("\n7. 外國特定專業人才（第 22 條）");
r = estimate({ days: 365, salary: 8200000, specialTalent: true }, P26);
check("年薪 820 萬：超過 300 萬部分的一半免計 → 1,110,700", r.total === 1110700, r.total);
const without = estimate({ days: 365, salary: 8200000 }, P26);
check("沒有優惠 → 2,145,300", without.total === 2145300, without.total);
r = estimate({ days: 365, salary: 2500000, specialTalent: true }, P26);
check("年薪沒超過 300 萬時沒有減免", r.total === estimate({ days: 365, salary: 2500000 }, P26).total);

console.log("\n8. 最低稅負制（海外所得）");
r = estimate({ days: 365, salary: 3500000, overseasIncome: 12000000 }, P26);
check("年薪 350 萬 + 海外所得 1,200 萬 → 基本稅額 1,507,200", r.total === 1507200, r.total);
check("補的差額 1,026,500", r.amt === 1026500, r.amt);
r = estimate({ days: 365, salary: 3500000, overseasIncome: 12000000, specialTalent: true }, P26);
check("有特定專業人才優惠：海外所得不計 → 405,700", r.total === 405700, r.total);
r = estimate({ days: 365, salary: 3500000, overseasIncome: 900000 }, P26);
check("海外所得未達 100 萬：完全不計", r.amt === 0 && r.total === estimate({ days: 365, salary: 3500000 }, P26).total);

console.log("\n9. 年中永久離境：免稅額、標準扣除額、基本生活費按天數比例");
r = estimate({ days: 200, salary: 2000000, leavingForGood: true }, P26);
check("200 天、年薪 200 萬 → 約 175,527", near(r.total, 175527, 2), r.total);
check("申報期限是離境前", /before you leave/.test(r.deadline), r.deadline);

console.log("\n10. 實際稅率：分母要含海外所得（最低稅負就是對它課的）");
r = estimate({ days: 365, salary: 3500000, overseasIncome: 12000000 }, P26);
check("350 萬 + 海外 1,200 萬 → 約 9.7%，不是 43%", near(r.effectiveRate, 1507200 / 15500000, 1e-6), (r.effectiveRate * 100).toFixed(2) + "%");
r = estimate({ days: 365, salary: 0, overseasIncome: 20000000 }, P26);
check("沒有薪資、只有海外所得 → 稅率是有限的數字", Number.isFinite(r.effectiveRate) && r.effectiveRate < 1, r.effectiveRate);
r = estimate({ days: 365, salary: 0 }, P26);
check("完全沒有收入 → 稅 0、稅率 0", r.total === 0 && r.effectiveRate === 0, `${r.total} ${r.effectiveRate}`);

console.log("\n11. 試算頁 ↔ 網址 ↔ WebMCP：同一組輸入算出同一個答案");
const roundtrip = (input) => {
  const q = paramsFromInput(input);
  const sp = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, v === true ? "1" : String(v)]));
  return inputFromParams(sp, content.tax);
};
for (const input of [
  { year: 2026, days: 365, salary: 3000000 },
  { year: 2026, days: 120, salary: 0, foreignPay: 2000000 },
  { year: 2026, days: 0, salary: 0 },
  { year: 2025, days: 200, salary: 2400000, rent: 360000, married: true, dependents: 2, minors: 1 },
  { year: 2026, days: 365, salary: 8200000, specialTalent: true, overseasIncome: 0 },
]) {
  const back = roundtrip(input);
  const a = estimate(input, resolveParams(content.tax, input.year));
  const b = estimate(back, resolveParams(content.tax, back.year));
  check(`${JSON.stringify(input)}`, a.total === b.total && a.residency.days === b.residency.days, `${a.total} vs ${b.total} / ${a.residency.days} vs ${b.residency.days}`);
}
check("明確給的 0 天、0 元留在網址裡（不會被頁面換成 365 天、年薪 300 萬）",
  (() => { const q = paramsFromInput({ year: 2026, days: 0, salary: 0 }); return q.days === "0" && q.salary === "0"; })());
check("沒給的欄位不出現在網址", !("rent" in paramsFromInput({ year: 2026, days: 365, salary: 1 })));

console.log("\n有填但沒有改變稅額的欄位要說出原因（試算頁顯示在欄位下面，不然看起來像算錯）");
{
  const fx = (i) => estimate({ year: 2026, days: 365, salary: 4200000, ...i }, P26);
  check("稅率 20% 以上：租金不能扣，總額不變", fx({ rent: 240000 }).total === fx({}).total && /20%/.test(fx({ rent: 240000 }).effects.rent || ""));
  check("年薪 180 萬：租金可以扣，沒有原因", fx({ salary: 1800000, rent: 240000 }).total < fx({ salary: 1800000 }).total && !fx({ salary: 1800000, rent: 240000 }).effects.rent);
  check("海外所得未滿 100 萬：說明不計入", /1,000,000/.test(fx({ overseasIncome: 900000 }).effects.overseasIncome || ""));
  check("海外 700 萬：計入最低稅負但不用補", fx({ overseasIncome: 7000000 }).total === fx({}).total && /minimum tax/.test(fx({ overseasIncome: 7000000 }).effects.overseasIncome || ""));
  check("海外 800 萬：要補，沒有原因", fx({ overseasIncome: 8000000 }).total > fx({}).total && !fx({ overseasIncome: 8000000 }).effects.overseasIncome);
  check("薪資 300 萬以下勾金卡：說明門檻", /3,000,000/.test(fx({ salary: 2500000, specialTalent: true }).effects.specialTalent || ""));
  check("整年在台勾離台：說明只改期限", /deadline/.test(fx({ leavingForGood: true }).effects.leavingForGood || ""));
  const nr = fx({ days: 150, rent: 240000, specialTalent: true });
  check("非居住者：四個欄位都說明只適用居住者", ["rent", "overseasIncome", "specialTalent", "leavingForGood"].every((k) => /residents/.test(nr.effects[k] || "")));
}

console.log(failures.length ? `\n${failures.length} 個失敗` : "\n全部通過");
process.exit(failures.length ? 1 : 0);
