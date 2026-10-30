// 試算頁：先算天數與身分，再算稅。所有輸入都在網址裡 —— 可以分享，
// WebMCP 的 estimate_tax / check_tax_residency 也是把參數放進網址再打開這一頁。

import { h, icon, dateInput } from "../lib/dom.js";
import { estimate, residency, countDays, resolveParams, residencyOutlook, daysInYear } from "../lib/tax.js";
import { taipeiParts } from "../lib/time.js";
import { money, pct, shortDate } from "../lib/format.js";
import { yearGrid, factMark } from "./report.js";

const NUM_FIELDS = ["days", "salary", "months", "foreignPay", "otherIncome", "dependents", "minors", "elderly", "rent", "itemized", "overseasIncome"];
const BOOL_FIELDS = ["married", "specialTalent", "leavingForGood"];

/** 網址參數 → 試算輸入 */
export function inputFromParams(params, taxData) {
  const P = resolveParams(taxData, params.get("year"));
  const input = { year: P.year };
  // 網址可以被手改：負數當 0、天數不超過那一年的天數，跟輸入欄擋下來的範圍一樣
  for (const k of NUM_FIELDS) {
    const n = Number(params.get(k));
    if (params.get(k) && Number.isFinite(n)) input[k] = Math.max(0, n);
  }
  if (input.days != null) input.days = Math.min(input.days, daysInYear(P.year));
  for (const k of BOOL_FIELDS) input[k] = params.get(k) === "1";
  input.mode = params.get("mode") === "trips" ? "trips" : "days";
  input.stays = (params.get("stays") || "").split(",").filter(Boolean).map((s) => {
    const [arrive, depart] = s.split("_");
    return { arrive, depart: depart || null };
  });
  if (input.days == null && input.mode === "days") input.days = 365;
  if (input.salary == null) input.salary = 3000000;
  return input;
}

/** 試算輸入 → 網址參數。明確給的 0 要留著 —— 丟掉的話頁面會補上預設值（365 天、年薪 300 萬），
 *  WebMCP 工具算的跟它打開的頁面就對不上了。 */
export function paramsFromInput(input) {
  const q = { year: input.year };
  for (const k of NUM_FIELDS) {
    const v = input[k];
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) q[k] = String(Number(v));
  }
  for (const k of BOOL_FIELDS) if (input[k]) q[k] = true;
  if (input.mode === "trips") {
    q.mode = "trips";
    q.stays = input.stays.filter((s) => s.arrive).map((s) => `${s.arrive}_${s.depart || ""}`).join(",");
    delete q.days;
  }
  return q;
}

function effectiveDays(input) {
  if (input.mode !== "trips") return { days: Number(input.days) || 0, counted: null, projected: null };
  const today = taipeiParts().ymd;
  const { counted, projected } = countDays(input.stays, input.year, today);
  return { days: projected, counted, projected };
}

export function render({ params, state, fromAgent }) {
  const taxData = state.content.tax;
  const input = inputFromParams(params, taxData);
  const years = Object.keys(taxData.params.years).map(Number).sort();

  const resultBox = h("div", { class: "result", id: "result", "aria-live": "polite" });
  // 手機上結果在整張表單下面：打字時底部常駐一行，看得到天數、身分、稅額
  const stickyDays = h("span", { class: "cs-days" });
  const stickyWord = h("span", { class: "cs-word" });
  const stickyTax = h("span", { class: "cs-tax" });
  const sticky = h("a", { class: "calc-sticky", href: "#result", onclick: (e) => { e.preventDefault(); resultBox.scrollIntoView({ behavior: "smooth", block: "start" }); } },
    stickyDays, stickyWord, stickyTax);
  // 格子只在換年度時重建，數字變動時才會一格一格填
  let grid = null;
  const gridFor = (year) => {
    if (!grid || grid.year !== year) grid = { year, ...yearGrid({ year, todayYmd: taipeiParts().ymd, compact: true }) };
    return grid;
  };

  // 第 4 步每個欄位下面的一行：這個欄位讓稅額變了多少，沒變的話為什麼
  const effectSlots = {};
  const effectSlot = (key) => (effectSlots[key] = h("p", { class: "effect", "aria-live": "polite", hidden: true }));

  const update = ({ syncUrl = true } = {}) => {
    const P = resolveParams(taxData, input.year);
    const d = effectiveDays(input);
    const r = estimate({ ...input, days: d.days }, P);
    paintResult(resultBox, r, P, d, input, state, gridFor(r.year));
    stickyDays.textContent = `${r.residency.days} days`;
    stickyWord.textContent = r.residency.resident ? "Resident" : "Non-resident";
    stickyWord.classList.toggle("resident", r.residency.resident);
    stickyTax.textContent = r.grossIncome ? money(r.total) : "Add income";
    paintEffects(effectSlots, r, P, { ...input, days: d.days });
    if (syncUrl) window.site.navigate("/tax/calculator", paramsFromInput(input), { replace: true, render: false });
  };

  // 不合理的數字（負數、超過一年的天數、不是數字）只顯示錯誤，不拿去算 ——
  // 結果停在上一個合理的值，網址也不跟著變
  const num = (key, label, opts = {}) => {
    const errId = `${key}-error`;
    const el = h("input", { type: "number", inputmode: "numeric", min: "0", step: opts.step || "1", value: input[key] ?? "", placeholder: opts.placeholder || "0", name: key });
    const err = h("p", { class: "field-error", id: errId, hidden: true });
    const problem = () => {
      if (el.validity.badInput) return "Enter a number.";
      if (el.value === "") return null;
      const v = Number(el.value);
      if (v < 0) return "Can't be negative.";
      if (opts.max && v > opts.max()) return opts.maxMessage();
      return null;
    };
    el.addEventListener("input", () => {
      const p = problem();
      err.textContent = p || "";
      err.hidden = !p;
      if (p) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", errId); return; }
      el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby");
      input[key] = el.value === "" ? null : Number(el.value);
      update();
    });
    if (opts.max) el.max = String(opts.max());
    return h("div", { class: "field" }, h("label", { class: "field" }, h("span", null, label), el), err,
      opts.hint ? h("p", { class: "hint-text", style: "margin:0" }, opts.hint) : null, opts.effect ? effectSlot(key) : null);
  };
  const check = (key, label, hint, { effect = false } = {}) => {
    const el = h("input", { type: "checkbox", name: key });
    el.checked = Boolean(input[key]);
    el.addEventListener("change", () => { input[key] = el.checked; update(); });
    return h("div", null, h("label", { class: "toggle" }, el, label), hint ? h("p", { class: "hint-text" }, hint) : null, effect ? effectSlot(key) : null);
  };
  const seg = (options, current, onPick, label) => {
    const wrap = h("div", { class: "seg", role: "group", "aria-label": label });
    for (const [value, text] of options) {
      const b = h("button", { type: "button", "aria-pressed": String(String(current) === String(value)) }, text);
      b.addEventListener("click", () => {
        for (const x of wrap.children) x.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        onPick(value);
      });
      wrap.append(b);
    }
    return wrap;
  };

  // --- 天數 ---
  const daysField = num("days", "Days in Taiwan this year", {
    hint: "Arrival days don't count; departure days do.",
    max: () => daysInYear(input.year),
    maxMessage: () => `${input.year} has ${daysInYear(input.year)} days. Enter ${daysInYear(input.year)} or fewer.`,
  });
  const daysInputEl = daysField.querySelector("input");
  const staysList = h("ul", { class: "stays" });
  const paintStays = () => {
    staysList.replaceChildren();
    if (!input.stays.length) input.stays.push({ arrive: `${input.year}-01-01`, depart: null });
    input.stays.forEach((s, i) => {
      const a = dateInput({ value: s.arrive || "", "aria-label": `Arrival ${i + 1}` });
      const dpt = dateInput({ value: s.depart || "", "aria-label": `Departure ${i + 1}` });
      a.addEventListener("change", () => { s.arrive = a.value; update(); });
      dpt.addEventListener("change", () => { s.depart = dpt.value || null; update(); });
      const rm = h("button", { type: "button", class: "linkish", "aria-label": `Remove stay ${i + 1}` }, "Remove");
      rm.addEventListener("click", () => { input.stays.splice(i, 1); paintStays(); update(); });
      staysList.append(h("li", null,
        h("label", { class: "field" }, h("span", null, "Arrived"), a),
        h("label", { class: "field" }, h("span", null, "Left (blank if still here)"), dpt),
        input.stays.length > 1 ? rm : h("span")));
    });
  };
  const addStay = h("button", { type: "button", class: "linkish" }, icon("plus"), "Add another stay");
  addStay.addEventListener("click", () => { input.stays.push({ arrive: "", depart: null }); paintStays(); });
  const tripsBox = h("div", null, staysList, addStay,
    h("p", { class: "hint-text" }, "One row per stay. Trips abroad split a stay into two rows."));
  const showMode = () => {
    daysField.hidden = input.mode === "trips";
    tripsBox.hidden = input.mode !== "trips";
    if (input.mode === "trips") paintStays();
  };

  const form = h("form", { onsubmit: (e) => e.preventDefault() },
    h("fieldset", null,
      h("legend", null, h("span", { class: "step-num" }, "1"), "Your days"),
      h("div", { style: "display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px" },
        seg(years.map((y) => [y, `Tax year ${y}`]), input.year, (y) => {
          input.year = Number(y);
          if (input.mode === "trips") paintStays();
          // 閏年與平年的上限不同：換年度時天數欄重新檢查一次（合理的話它會自己 update）
          daysInputEl.max = String(daysInYear(input.year));
          daysInputEl.dispatchEvent(new Event("input"));
          update();
        }, "Tax year"),
        seg([["days", "I know my days"], ["trips", "Count from my trips"]], input.mode, (m) => { input.mode = m; showMode(); update(); }, "How to count")),
      daysField, tripsBox),
    h("fieldset", null,
      h("legend", null, h("span", { class: "step-num" }, "2"), "Your income"),
      h("div", { class: "grid2" },
        num("salary", "Annual salary from your Taiwan employer (NT$)", { step: "10000", hint: "Include bonuses." }),
        num("months", "Months that salary covers", { placeholder: "12", hint: "Only matters for non-residents." }),
        num("foreignPay", "Pay from an overseas employer for work in Taiwan", { step: "10000" }),
        num("otherIncome", "Other Taiwan income (interest, rent…)", { step: "1000" }))),
    h("fieldset", null,
      h("legend", null, h("span", { class: "step-num" }, "3"), "Your household"),
      h("div", { style: "margin-bottom:16px" }, seg([["0", "Single"], ["1", "Married, spouse has no Taiwan income"]], input.married ? "1" : "0", (v) => { input.married = v === "1"; update(); }, "Filing status")),
      h("div", { class: "grid2" },
        num("dependents", "Dependants under 70 (incl. children)"),
        num("minors", "…of whom minor children"),
        num("elderly", "Parents or grandparents aged 70+"))),
    h("fieldset", null,
      h("legend", null, h("span", { class: "step-num" }, "4"), "Rent, overseas income and special cases"),
      h("p", { class: "hint-text", style: "margin:-6px 0 16px" }, "These only change the tax in some situations. Each one tells you below whether it made a difference."),
      h("div", { class: "grid2" },
        num("rent", "Rent you pay for your home here, per year", { step: "10000", hint: "Deductible up to NT$180,000, only if your tax rate stays under 20%.", effect: true }),
        num("overseasIncome", "Overseas income (dividends, foreign gains)", { step: "10000", hint: "Counts only from NT$1,000,000 a year, for the minimum tax.", effect: true })),
      h("div", { style: "display:grid;gap:12px;margin-top:18px" },
        check("specialTalent", "I qualify for the special professional incentive (Gold Card or special professional permit)", "Half of salary above NT$3M is excluded for five years, if you apply.", { effect: true }),
        check("leavingForGood", "I am leaving Taiwan for good this year", "Exemptions and deductions shrink with your days here. Enter your actual days above.", { effect: true }))),
    h("p", { class: "muted", style: "font-size:14px;margin:4px 4px 0" },
      "An estimate, not tax advice. It doesn't cover itemized deductions in detail, joint filing with a working spouse, or foreign tax credits. ",
      h("a", { href: "https://www.etax.nat.gov.tw/etwmain/etw158w/1502", target: "_blank", rel: "noopener" }, "MOF's official calculator", icon("external"))));

  showMode();
  update({ syncUrl: false });

  const head = h("header", { class: "wrap page-head" },
    h("p", { class: "crumbs" }, h("a", { href: "#/tax" }, "Tax"), " / Calculator"),
    h("h1", null, "Am I a resident — and what will I owe?"),
    h("p", { class: "lede" }, "Taiwan's official calculator assumes you already know whether you're a resident. This one starts there: count your days, then see the tax under the rules that actually apply to you."),
    fromAgent ? h("p", { class: "agent-banner" }, "Filled in by your AI assistant — change anything to recalculate") : null);

  // 結果已經在畫面上時，底部那一行就收起來
  const after = () => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([en]) => sticky.classList.toggle("away", en.isIntersecting), { threshold: 0.05 });
    io.observe(resultBox);
  };
  return { title: "Tax calculator", node: h("div", null, head, h("div", { class: "wrap calc" }, form, resultBox), sticky), after };
}

const EFFECT_FIELDS = { rent: 0, overseasIncome: 0, specialTalent: false, leavingForGood: false };

/** 每個有填的第 4 步欄位：拿掉它重算一次，差多少就寫多少；沒差就寫 estimate() 給的原因 */
function paintEffects(slots, r, P, input) {
  for (const [key, off] of Object.entries(EFFECT_FIELDS)) {
    const slot = slots[key];
    if (!slot) continue;
    const used = typeof off === "boolean" ? Boolean(input[key]) : Number(input[key]) > 0;
    if (!used) { slot.hidden = true; continue; }
    const delta = r.total - estimate({ ...input, [key]: off }, P).total;
    slot.hidden = false;
    if (delta < 0) {
      slot.className = "effect saves";
      slot.replaceChildren(h("span", null, `Lowers your tax by ${money(-delta)}.`));
    } else if (delta > 0) {
      slot.className = "effect adds";
      slot.replaceChildren(h("span", null, `Adds ${money(delta)} to your tax.`));
    } else {
      slot.className = "effect none";
      const reason = (r.effects && r.effects[key]) || "Makes no difference with your other numbers.";
      slot.replaceChildren(h("span", null, `No change. ${reason}`));
    }
  }
}

function factIdFor(key, P) {
  return (P[key] && P[key].fact) || key;
}

function paintResult(box, r, P, d, input, state, grid) {
  const res = r.residency;
  grid.update(res.days);

  let statusText;
  if (res.resident) statusText = "You're taxed like a local: progressive rates on net income, with exemptions and deductions. You file every May.";
  else if (res.band === "mid") statusText = "Your Taiwan salary is taxed by flat withholding. Over 90 days, pay from an overseas employer for work here is taxable too.";
  else statusText = "Your Taiwan salary is taxed by flat withholding. Pay from an overseas employer for work here isn't taxed at 90 days or fewer.";
  const outlook = residencyOutlook(res.days, r.year, taipeiParts().ymd, P,
    { ahead: d.counted != null ? d.projected - d.counted : 0 });
  const day = (ymd) => shortDate(`${ymd}T00:00:00+08:00`);
  const outlookText = {
    past: `${r.year} is over, so this status is final.`,
    arrive_by: `Arriving by ${day(outlook.by)} and staying would make you a resident.`,
    reachable: input.mode === "trips"
      ? `${outlook.need} more days in Taiwan before 31 December would make you a resident.`
      : `${outlook.need} more days would make you a resident. Staying from today without a break, that's ${day(outlook.by)}.`,
    too_late: `${P.residency_days.value} days in ${r.year} is no longer possible${outlook.free ? `: only ${outlook.free} days of the year are left` : ""}. The estimate below uses non-resident rules.`,
  }[outlook.kind];

  const statusCard = h("section", { class: "result-card" },
    h("h2", { class: "result-h" }, h("span", { class: "step-num" }, "A"), "Your status"),
    h("p", { class: `status-word${res.resident ? " resident" : ""}` }, res.resident ? "Tax resident" : "Non-resident", factMark("residency_days", state)),
    h("p", { class: "status-line" }, h("strong", null, `${res.days} days`), ` in ${r.year}${d.counted != null ? ` (${d.counted} so far)` : ""}. `, statusText),
    grid.el,
    outlookText ? h("p", { class: "hint-text" }, outlookText) : null);

  const rows = r.lines.map((l) => {
    const fid = l.fact ? factIdFor(l.fact, P) : null;
    return h("tr", { class: l.kind === "total" ? "total" : l.kind === "subtotal" ? "subtotal" : null },
      h("td", null, l.label, fid ? factMark(fid, state) : null),
      h("td", null, l.kind === "deduction" ? `− ${money(-l.amount)}` : money(l.amount)));
  });

  if (!r.grossIncome) {
    box.replaceChildren(statusCard, h("section", { class: "result-card" },
      h("h2", { class: "result-h" }, h("span", { class: "step-num" }, "B"), "Estimated tax"),
      h("p", { class: "status-line" }, "Add your salary (or other income) to see the tax for this status.")));
    return;
  }
  const resultCard = h("section", { class: "result-card" },
    h("h2", { class: "result-h" }, h("span", { class: "step-num" }, "B"), `Estimated tax for ${r.year}`),
    h("p", { class: "big-number" }, money(r.total)),
    h("p", { class: "rate-line" },
      h("span", null, `${pct(r.effectiveRate, 1)} of income`),
      h("span", null, r.regime === "progressive" ? `Top bracket ${Math.round(r.marginalRate * 100)}%` : "Flat withholding")),
    h("table", { class: "breakdown" }, h("tbody", null, rows)),
    h("p", { class: "file-line" },
      h("strong", null, r.mustFile ? "You file a return. " : "No return needed. "), r.deadline ? `Deadline: ${r.deadline}.` : ""),
    r.notes.length ? h("ul", { class: "notes" }, r.notes.map((n) => h("li", null, n))) : null,
    h("p", { class: "hint-text" }, "F-numbers are the official figures behind each line. Press one to read the source sentence. A figure marked “needs review” changed on the official page and waits for a person to re-check it."));

  box.replaceChildren(statusCard, resultCard);
}
