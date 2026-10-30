// 外籍人士的綜所稅試算 —— 先判斷居住者身分，再算稅。
//
// 財政部的官方試算不會先幫你判斷居住者／非居住者，這是外國人最常卡住的一步。
// 這裡把順序反過來：天數 → 身分 → 該身分的算法。
//
// 這支檔案不寫死任何金額。所有數字（免稅額、級距、門檻……）都來自
// content/tax/facts.yaml，由匯出腳本換成 params 傳進來；每一行計算結果都帶著
// 它用到的 fact id，畫面上才標得出「出自哪一份官方文件」。
//
// 網頁的試算頁、WebMCP 的 estimate_tax 工具、tests/test_tax_js.mjs 都呼叫這裡。

import { addDays, daysBetween } from "./time.js";

// 特定專業人才：超過門檻部分的「半數」免計（外國專業人才延攬及僱用法第 22 條，fact: special_talent_rule）
const TALENT_SHARE = 0.5;

/** 天數 → 身分。band 是三個稅務上有差別的區間。 */
export function residency(days, P) {
  // 一年最多 365／366 天 —— 網址或 AI 工具給了 400 也不能照算
  const cap = P.year ? daysInYear(P.year) : 366;
  const d = Math.min(cap, Math.max(0, Math.floor(Number(days) || 0)));
  const resident = d >= P.residency_days.value;
  const band = d <= 90 ? "le90" : resident ? "resident" : "mid";
  const labels = {
    le90: "Non-resident (90 days or fewer)",
    mid: "Non-resident (91–182 days)",
    resident: "Resident (183 days or more)",
  };
  return { days: d, resident, band, label: labels[band], toResident: Math.max(0, P.residency_days.value - d) };
}

/**
 * 一段段的停留 → 某個課稅年度內的天數。規則：始日不計末日計（fact: day_counting）。
 * stays: [{arrive: "YYYY-MM-DD", depart: "YYYY-MM-DD" | null}]，depart 為 null 表示還在台灣。
 * 回傳 { counted, projected }：counted 算到 asOf（預設今天），projected 假設待到年底。
 */
export function countDays(stays, year, asOf) {
  const first = `${year}-01-01`, last = `${year}-12-31`;
  const until = asOf && asOf < last ? asOf : last;
  let counted = 0, projected = 0;
  for (const s of stays || []) {
    if (!s || !s.arrive) continue;
    // 計入的日子是 (arrive, depart]：入境當天不算、出境當天算
    const lower = maxDate(addDays(s.arrive, 1), first);
    const departOrOpen = s.depart || null;
    const upperProjected = departOrOpen ? minDate(departOrOpen, last) : last;
    const upperCounted = departOrOpen ? minDate(departOrOpen, until) : until;
    if (upperProjected >= lower) projected += daysBetween(lower, upperProjected) + 1;
    if (upperCounted >= lower) counted += daysBetween(lower, upperCounted) + 1;
  }
  return { counted, projected };
}

const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);

/** 累進稅率。brackets: [[上限|null, 稅率, 該級起點的累計稅額], ...] */
export function progressive(net, brackets) {
  let lower = 0;
  for (const [upTo, rate, base] of brackets) {
    if (upTo === null || net <= upTo) {
      return { tax: Math.max(0, base + (net - lower) * rate), rate };
    }
    lower = upTo;
  }
  return { tax: 0, rate: 0 };
}

const n0 = (x) => Math.max(0, Number(x) || 0);
const int0 = (x) => Math.max(0, Math.floor(Number(x) || 0));

/**
 * 主試算。input 欄位（都可省略）：
 *   days            這個課稅年度在台天數
 *   salary          台灣雇主給的年薪（含獎金）
 *   months          那份年薪涵蓋幾個月（非居住者 6% / 18% 的判斷用月平均），預設 12
 *   foreignPay      境外雇主為你在台灣工作付的報酬
 *   otherIncome     其他台灣來源所得（居住者併入申報）
 *   married         配偶一起申報且沒有台灣所得
 *   dependents      受扶養親屬（未滿 70 歲，含子女）
 *   minors          其中未成年子女的人數
 *   elderly         受扶養的 70 歲以上直系尊親屬
 *   rent            在台租屋自住的年租金
 *   itemized        列舉扣除額合計（大於標準扣除額才會用）
 *   specialTalent   符合外國特定專業人才租稅優惠
 *   overseasIncome  海外所得（最低稅負制）
 *   leavingForGood  年中永久離境（免稅額、標準扣除額、基本生活費按天數比例）
 * P 是匯出的年度參數（見 resolveParams）。
 */
export function estimate(input, P) {
  const res = residency(input.days, P);
  const salary = n0(input.salary);
  const foreignPay = n0(input.foreignPay);
  const lines = [];
  const notes = [];
  const add = (label, amount, kind, fact) => lines.push({ label, amount: Math.round(amount), kind, fact: fact || null });

  if (!res.resident) {
    const months = Math.min(12, Math.max(1, int0(input.months) || 12));
    const monthly = salary / months;
    const low = monthly <= P.nr_threshold.value;
    const rate = low ? P.nr_rate_low.value : P.nr_rate.value;
    const twTax = salary * rate;
    let foreignTax = 0;
    add("Salary from your Taiwan employer", salary, "income");
    add(`Withheld at ${Math.round(rate * 100)}% (average month ${low ? "at or below" : "above"} the NT$${fmt(P.nr_threshold.value)} cut-off)`,
      twTax, "tax", low ? "nr_salary_rate_low" : "nr_salary_rate");
    if (foreignPay) {
      add("Pay from an overseas employer for work in Taiwan", foreignPay, "income");
      if (res.band === "le90") {
        add("Not taxed — 90 days or fewer", 0, "tax", "foreign_employer_90");
      } else {
        foreignTax = foreignPay * P.foreign_employer_rate.value;
        add(`Self-reported at ${Math.round(P.foreign_employer_rate.value * 100)}%`, foreignTax, "tax", "foreign_employer_over_90_rate");
      }
    }
    const total = twTax + foreignTax;
    add("Total tax", total, "total");
    const mustFile = res.band === "mid" && foreignPay > 0;
    if (mustFile) notes.push("You must report the overseas pay yourself — before you leave Taiwan, or in the May filing period if you are still here.");
    else notes.push("Your employer's withholding is final: non-residents with only Taiwan salary don't file an annual return.");
    if (n0(input.otherIncome)) notes.push("Other Taiwan income (interest, dividends, rent) is withheld at its own rate — 20% for most kinds, 21% for dividends — and isn't included above.");
    if (res.toResident > 0 && res.toResident <= 60) notes.push(`You are ${res.toResident} days short of residency. Residents are taxed at progressive rates instead — usually less than a flat 18% for professional salaries.`);
    notes.push("Short assignment and your country has a tax treaty with Taiwan? The salary may be exempt — NTB Taipei has a self-assessment form.");
    // 第 4 步的欄位對非居住者都沒有作用 —— 畫面要說出原因，不然看起來像算錯
    const residentsOnly = `Only applies to tax residents (183+ days in Taiwan). You have ${res.days}.`;
    const effects = { rent: residentsOnly, overseasIncome: residentsOnly, specialTalent: residentsOnly, leavingForGood: residentsOnly };
    return {
      year: P.year, residency: res, regime: "withholding", lines, notes, effects,
      grossIncome: salary + foreignPay, taxable: salary + (res.band === "le90" ? 0 : foreignPay),
      tax: total, amt: 0, total, marginalRate: rate, effectiveRate: salary + foreignPay ? total / (salary + foreignPay) : 0,
      mustFile, deadline: mustFile ? "Before departure, or 1–31 May next year" : null,
    };
  }

  // --- 居住者：累進稅率 ---
  const married = Boolean(input.married);
  const dependents = int0(input.dependents);
  const minors = Math.min(int0(input.minors), dependents);
  const elderly = int0(input.elderly);
  const otherIncome = n0(input.otherIncome);
  const leaving = Boolean(input.leavingForGood);
  const yearDays = daysInYear(P.year);
  const f = leaving ? Math.min(1, res.days / yearDays) : 1;

  const grossSalary = salary + foreignPay;
  add("Salary (Taiwan employer)", salary, "income");
  if (foreignPay) add("Pay from an overseas employer for work in Taiwan", foreignPay, "income");

  let taxableSalary = grossSalary;
  const talent = Boolean(input.specialTalent);
  if (talent && grossSalary > P.talent_threshold.value) {
    const excluded = (grossSalary - P.talent_threshold.value) * TALENT_SHARE;
    taxableSalary -= excluded;
    add("Special professional incentive: half of salary above NT$3M", -excluded, "deduction", "special_talent_rule");
  }
  const salaryDed = Math.min(taxableSalary, P.salary_deduction.value);
  add("Salary special deduction", -salaryDed, "deduction", "salary_deduction");
  if (otherIncome) add("Other Taiwan income", otherIncome, "income");
  const income = taxableSalary - salaryDed + otherIncome;

  const persons = 1 + (married ? 1 : 0) + dependents + elderly;
  const exemptions = f * (
    (1 + (married ? 1 : 0)) * P.exemption.value +
    (dependents - minors) * P.exemption.value +
    minors * P.exemption_minor.value +
    elderly * P.exemption_70.value);
  add(`Exemptions (${persons} ${persons === 1 ? "person" : "people"})`, -exemptions, "deduction", "exemption");
  const standard = f * (married ? P.standard_married.value : P.standard_single.value);
  const itemized = n0(input.itemized);
  const general = Math.max(standard, itemized);
  add(itemized > standard ? "Itemized deductions" : `Standard deduction (${married ? "married" : "single"})`, -general, "deduction",
    itemized > standard ? null : married ? "standard_married" : "standard_single");

  const ble = f * persons * P.basic_living.value;
  const rentWanted = Math.min(n0(input.rent), P.rent_cap.value);
  const overseas = n0(input.overseasIncome);
  // 海外所得：一申報戶未達 100 萬全部不計；達到就全數計入。特定專業人才的優惠年度整筆排除。
  const overseasCounted = talent ? 0 : overseas >= P.overseas_threshold.value ? overseas : 0;

  const compute = (rentDed) => {
    const bleDiff = Math.max(0, ble - (exemptions + general + rentDed));
    const net = Math.max(0, income - exemptions - general - rentDed - bleDiff);
    return { rentDed, bleDiff, net, ...progressive(net, P.brackets.value) };
  };
  let r = compute(rentWanted);
  let rentNote = null;
  if (rentWanted > 0) {
    // 租金特別扣除的排除條件：扣完之後適用稅率仍在 20% 以上，或基本所得額超過最低稅負的免稅額
    if (r.rate >= 0.2) {
      r = compute(0);
      rentNote = "Rent deduction not allowed: your marginal rate is 20% or more even after deducting it.";
    } else if (r.net + overseasCounted > P.amt_exemption.value) {
      r = compute(0);
      rentNote = "Rent deduction not allowed: your basic income for the minimum tax is above NT$7.5 million.";
    }
  }
  if (r.rentDed) add("Rent special deduction", -r.rentDed, "deduction", "rent_cap");
  if (r.bleDiff) add("Basic living expense difference", -r.bleDiff, "deduction", "basic_living");
  add("Net taxable income", r.net, "subtotal");
  add(`Income tax at progressive rates (top rate ${Math.round(r.rate * 100)}%)`, r.tax, "tax", "brackets");

  let amt = 0;
  if (overseas && !talent && overseas < P.overseas_threshold.value) {
    notes.push(`Overseas income below NT$${fmt(P.overseas_threshold.value)} for the household is ignored entirely.`);
  }
  if (overseasCounted) {
    const basicIncome = r.net + overseasCounted;
    if (basicIncome > P.amt_exemption.value) {
      const basicTax = (basicIncome - P.amt_exemption.value) * P.amt_rate.value;
      amt = Math.max(0, basicTax - r.tax);
    }
    add("Minimum tax top-up on overseas income", amt, "tax", "amt_rate");
    notes.push("The minimum-tax figure ignores foreign tax credits — tax already paid abroad on that income can reduce it.");
  } else if (talent && overseas) {
    notes.push("Overseas income is left out of the minimum tax during your incentive years.");
  }
  const total = Math.round(r.tax + amt);
  add("Total tax", total, "total");

  if (rentNote) notes.push(rentNote);
  if (talent) notes.push("The incentive is not automatic: apply with your return before the filing deadline, or you lose that year's benefit.");
  if (married) notes.push("Assumes your spouse has no Taiwan income. If you both earn here, MOF's official calculator compares joint and separate computation.");
  if (leaving) notes.push("Leaving for good: exemptions, the standard deduction and the basic living expense are prorated by your days here, and you file before you leave.");
  if (P.basic_living.provisional) notes.push("Uses the 2025 basic living expense until the 2026 figure is announced in late November 2026.");
  notes.push("If your employer withheld 18% before you reached 183 days, the difference comes back as a refund after you file.");

  // 有填、但沒有改變稅額的欄位：為什麼沒有作用（試算頁顯示在欄位下面）
  const effects = {};
  if (talent && grossSalary <= P.talent_threshold.value) {
    effects.specialTalent = `Only salary above NT$${fmt(P.talent_threshold.value)} gets the incentive.`;
  }
  if (rentWanted > 0 && rentNote) {
    effects.rent = rentNote.includes("20%")
      ? "Not deductible: your tax rate is 20% or more even after deducting rent."
      : `Not deductible: your income for the minimum tax is above NT$${fmt(P.amt_exemption.value)}.`;
  }
  if (overseas) {
    if (talent) effects.overseasIncome = "Left out of the minimum tax during your incentive years.";
    else if (overseas < P.overseas_threshold.value) effects.overseasIncome = `Under NT$${fmt(P.overseas_threshold.value)} a year is ignored.`;
    else if (!amt) effects.overseasIncome = `Counted for the minimum tax, but 20% of the amount above NT$${fmt(P.amt_exemption.value)} is still less than your regular tax, so nothing is added.`;
  }
  if (leaving && f >= 1) {
    effects.leavingForGood = "With a full year in Taiwan nothing is prorated. It only moves your deadline: file within the 10 days before you leave.";
  }

  // 分母含海外所得：最低稅負的那一筆稅就是對海外所得課的，不算進去會出現「43% of income」這種數字
  const gross = grossSalary + otherIncome + overseas;
  return {
    year: P.year, residency: res, regime: "progressive", lines, notes, effects,
    grossIncome: gross, taxable: Math.round(r.net), tax: Math.round(r.tax), amt: Math.round(amt), total,
    marginalRate: r.rate, effectiveRate: gross ? total / gross : 0,
    mustFile: true,
    deadline: leaving ? "Within the 10 days before you leave Taiwan" : `1–31 May ${P.year + 1}`,
  };
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInYear(y) {
  return isLeap(y) ? 366 : 365;
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * content.json 的 tax.params[year] 已經是 {key: {value, fact, ...}}；這裡補上 year，
 * 讓 estimate() 可以直接用 P.exemption.value。缺年份時退回預設年份。
 */
export function resolveParams(taxData, year) {
  const years = taxData.params.years;
  const y = years[year] ? Number(year) : Number(taxData.params.default_year);
  return { year: y, ...taxData.params.shared, ...years[y] };
}

/** 抵達日（之後一直待著）能不能在年底前住滿 183 天 —— 指南與試算的提示用 */
export function latestArrivalForResidency(year, P) {
  const need = P.residency_days.value;
  // 計入 (arrive, 12/31]，所以要 12/31 − arrive ≥ need
  return addDays(`${year}-12-31`, -need);
}

/**
 * 還不是居住者的話，今年還有沒有機會 —— 試算的提示用。不能只給「最晚 7/1 抵達」：
 * 10 月底才打開試算的人看到一個已經過去的日期，會以為自己還有救。
 *   past       年度已經過完，身分定了
 *   arrive_by  年度還沒開始：最晚哪天抵達、之後一直待著就夠
 *   reachable  今年：剩下的日子還夠，by 是從今天起天天都在、哪天會滿
 *   too_late   今年：剩下的日子全待著也不夠
 * ahead 是「今天之後已經算進 days 的天數」（行程模式推估到年底的那段），那些日子不能再算一次。
 */
export function residencyOutlook(days, year, todayYmd, P, { ahead = 0 } = {}) {
  const res = residency(days, P);
  const need = res.toResident;
  if (res.resident) return { kind: "resident", need: 0 };
  const thisYear = Number(todayYmd.slice(0, 4));
  if (year < thisYear) return { kind: "past", need };
  if (year > thisYear) return { kind: "arrive_by", need, by: latestArrivalForResidency(year, P) };
  // 計入 (today, 12/31]：今天已經在 days 裡了
  const free = Math.max(0, daysBetween(todayYmd, `${year}-12-31`) - ahead);
  if (need <= free) return { kind: "reachable", need, free, by: addDays(todayYmd, need) };
  return { kind: "too_late", need, free };
}
