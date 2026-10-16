// 試算頁：先算天數與身分，再算稅。所有輸入都在網址裡 —— 可以分享，
// WebMCP 的 estimate_tax / check_tax_residency 也是把參數放進網址再打開這一頁。

import { h, icon, dateInput } from "../lib/dom.js";
import { estimate, residency, countDays, resolveParams, latestArrivalForResidency } from "../lib/tax.js";
import { taipeiParts } from "../lib/time.js";
import { money, pct, shortDate } from "../lib/format.js";
import { factTitle } from "../lib/guides.js";

const NUM_FIELDS = ["days", "salary", "months", "foreignPay", "otherIncome", "dependents", "minors", "elderly", "rent", "itemized", "overseasIncome"];
const BOOL_FIELDS = ["married", "specialTalent", "leavingForGood"];

/** 網址參數 → 試算輸入 */
export function inputFromParams(params, taxData) {
  const P = resolveParams(taxData, params.get("year"));
  const input = { year: P.year };
  for (const k of NUM_FIELDS) if (params.get(k)) input[k] = Number(params.get(k));
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

  const resultBox = h("div", { class: "result", "aria-live": "polite" });

  // 第 4 步每個欄位下面的一行：這個欄位讓稅額變了多少，沒變的話為什麼
  const effectSlots = {};
  const effectSlot = (key) => (effectSlots[key] = h("p", { class: "effect", "aria-live": "polite", hidden: true }));

  const update = ({ syncUrl = true } = {}) => {
    const P = resolveParams(taxData, input.year);
    const d = effectiveDays(input);
    const r = estimate({ ...input, days: d.days }, P);
    paintResult(resultBox, r, P, d, input, state);
    paintEffects(effectSlots, r, P, { ...input, days: d.days });
    if (syncUrl) window.site.navigate("/tax/calculator", paramsFromInput(input), { replace: true, render: false });
  };

  const num = (key, label, opts = {}) => {
    const el = h("input", { type: "number", inputmode: "numeric", min: "0", step: opts.step || "1", value: input[key] ?? "", placeholder: opts.placeholder || "0", name: key });
    el.addEventListener("input", () => { input[key] = el.value === "" ? null : Number(el.value); update(); });
    return h("div", { class: "field" }, h("label", { class: "field" }, h("span", null, label), el),
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
  const daysField = num("days", "Days in Taiwan this year", { hint: "Arrival days don't count; departure days do." });
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
  const addStay = h("button", { type: "button", class: "linkish" }, "+ Add another stay");
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
        seg(years.map((y) => [y, `Tax year ${y}`]), input.year, (y) => { input.year = Number(y); if (input.mode === "trips") paintStays(); update(); }, "Tax year"),
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
      h("a", { href: "https://www.etax.nat.gov.tw/etwmain/etw158w/1502", target: "_blank", rel: "noopener" }, "MOF's official calculator ↗")));

  showMode();
  update({ syncUrl: false });

  const head = h("header", { class: "wrap page-head" },
    h("p", { class: "crumbs", style: "margin-bottom:12px" }, h("a", { href: "#/tax" }, "Tax"), " / Calculator"),
    h("h1", null, "Am I a resident — and what will I owe?"),
    h("p", { class: "lede" }, "Taiwan's official calculator assumes you already know whether you're a resident. This one starts there: count your days, then see the tax under the rules that actually apply to you."),
    fromAgent ? h("p", { class: "agent-banner" }, "Filled in by your AI assistant — change anything to recalculate") : null);

  return { title: "Tax calculator", node: h("div", null, head, h("div", { class: "wrap calc" }, form, resultBox)) };
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
      slot.replaceChildren(icon("check"), h("span", null, `Lowers your tax by ${money(-delta)}.`));
    } else if (delta > 0) {
      slot.className = "effect adds";
      slot.replaceChildren(icon("info"), h("span", null, `Adds ${money(delta)} to your tax.`));
    } else {
      slot.className = "effect none";
      const reason = (r.effects && r.effects[key]) || "Makes no difference with your other numbers.";
      slot.replaceChildren(icon("info"), h("span", null, `No change. ${reason}`));
    }
  }
}

function factIdFor(key, P) {
  return (P[key] && P[key].fact) || key;
}

function paintResult(box, r, P, d, input, state) {
  const res = r.residency;
  const yearDays = 365;
  const pctDays = Math.min(100, (res.days / yearDays) * 100);
  const bar = h("div", { class: `days-bar${res.resident ? " resident" : ""}`, "aria-hidden": "true" },
    h("div", { class: "fill", style: `width:${pctDays}%` }),
    h("div", { class: "mark", style: `left:${(90 / yearDays) * 100}%` }, h("span", null, "90 days")),
    h("div", { class: "mark", style: `left:${(183 / yearDays) * 100}%` }, h("span", null, "183 days")));

  let statusText;
  if (res.resident) statusText = "You're taxed like a local: progressive rates on net income, with exemptions and deductions. You file every May.";
  else if (res.band === "mid") statusText = "Your Taiwan salary is taxed by flat withholding. Over 90 days, pay from an overseas employer for work here is taxable too.";
  else statusText = "Your Taiwan salary is taxed by flat withholding. Pay from an overseas employer for work here isn't taxed at 90 days or fewer.";
  const latest = latestArrivalForResidency(input.year, P);

  const statusCard = h("div", { class: "result-card" },
    h("p", { class: "eyebrow" }, "Step 1 · Your status"),
    h("span", { class: `status-chip ${res.resident ? "resident" : "nonresident"}` },
      icon(res.resident ? "checkCircle" : "plane"), res.resident ? "Tax resident" : "Non-resident"),
    h("p", { class: "status-line" }, h("strong", null, `${res.days} days`), ` in ${r.year}${d.counted != null ? ` (${d.counted} so far)` : ""}. `, statusText),
    bar,
    !res.resident ? h("p", { class: "hint-text", style: "margin:0" }, `${res.toResident} more days would make you a resident. Arriving by ${shortDate(`${latest}T00:00:00+08:00`)} and staying would do it.`) : null);

  const rows = r.lines.map((l) => {
    const fid = l.fact ? factIdFor(l.fact, P) : null;
    const fact = fid ? state.facts[fid] : null;
    const cite = fact ? h("a", {
      class: "cite", href: (fact.sources[0] || {}).url || "#", target: "_blank", rel: "noopener",
      title: factTitle(fact), "aria-label": `Source: ${factTitle(fact)}`,
    }, fact.status === "verified" ? "✓" : "?") : null;
    return h("tr", { class: l.kind === "total" ? "total" : l.kind === "subtotal" ? "subtotal" : null },
      h("td", null, l.label, cite),
      h("td", null, l.kind === "deduction" ? `− ${money(-l.amount)}` : money(l.amount)));
  });

  if (!r.grossIncome) {
    box.replaceChildren(statusCard, h("div", { class: "result-card" },
      h("p", { class: "eyebrow" }, "Step 2 · Estimated tax"),
      h("p", { style: "margin:6px 0 0;color:var(--ink-2)" }, "Add your salary (or other income) to see the tax for this status.")));
    return;
  }
  const resultCard = h("div", { class: "result-card lit" },
    h("p", { class: "eyebrow" }, `Step 2 · Estimated tax for ${r.year}`),
    h("p", { class: "big-number" }, money(r.total)),
    h("div", { class: "rate-chips" },
      h("span", { class: "tag" }, `${pct(r.effectiveRate, 1)} of income`),
      h("span", { class: "tag" }, r.regime === "progressive" ? `Top bracket ${Math.round(r.marginalRate * 100)}%` : "Flat withholding")),
    h("table", { class: "breakdown" }, h("tbody", null, rows)),
    h("p", { class: "file-line" }, icon("file"),
      h("span", null, h("strong", null, r.mustFile ? "You file a return. " : "No return needed. "), r.deadline ? `Deadline: ${r.deadline}.` : "")),
    r.notes.length ? h("ul", { class: "notes" }, r.notes.map((n) => h("li", null, icon("info"), h("span", null, n)))) : null,
    h("p", { class: "muted", style: "font-size:13px;margin:14px 0 0" }, "✓ = checked against the official text this week. Hover or tap for the source."));

  box.replaceChildren(statusCard, resultCard);
}
