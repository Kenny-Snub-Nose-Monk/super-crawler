// WebMCP 工具：讓 AI 助理（例如透過 MCP-B relay 接上的 Claude Code）查活動、讀指南、算稅。
//
// 每個工具走的都是畫面同一條路（site/query.js、lib/search.js、lib/tax.js），
// 而且會把頁面切到同一個結果 —— 助理查到的就是你看到的。
// 全部唯讀。為什麼走 WebMCP 而不是 HTTP MCP：docs/adr/0002-webmcp-via-mcp-b-relay.md
//
// 稅務工具回傳的每個數字都附 fact id、官方出處與核對狀態（verified / drifted / unchecked）。
// 未知 ≠ 否：活動欄位沒有值時寫成 "unknown"，不要讓助理把 null 讀成「沒有」或「免費」。

import { normalizeParams } from "./query.js";
import { runQuery } from "./views/events.js";
import { parseQuery, searchGuides } from "./lib/search.js";
import { guideToText, plain } from "./lib/guides.js";
import { estimate, residency, countDays, resolveParams, latestArrivalForResidency } from "./lib/tax.js";
import { taipeiParts } from "./lib/time.js";
import { TYPE_META, isEnglishFriendly, formatPrice, formatWhere } from "./lib/format.js";
import { otherSessions } from "./views/event.js";
import { paramsFromInput } from "./views/calculator.js";
import { nextCalendarItem } from "./views/tax.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UNKNOWN = "unknown";
const HIDDEN_FIELDS = ["content_hash", "schema_version", "first_seen", "feedback", "last_seen"];
const DISCLAIMER = "General information about Taiwan tax rules for foreign professionals, not advice for a specific situation. Cite the official source URLs given, mention when a figure is provisional or under review, and suggest confirming with the National Taxation Bureau before filing.";

const todayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
});

function text(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

function err(message) {
  return { ...text({ error: message }), isError: true };
}

function pageUrl(hash) {
  return `${location.origin}${location.pathname}${hash}`;
}

function summarizeEvent(ev) {
  const price = formatPrice(ev);
  return {
    uid: ev.uid,
    title: ev.title,
    title_en: ev.title_en || null,
    type: ev.type,
    status: ev.status,
    starts_at: ev.starts_at ?? UNKNOWN,
    ends_at: ev.ends_at,
    where: formatWhere(ev),
    district: ev.district ?? UNKNOWN,
    city: ev.city ?? UNKNOWN,
    online: (ev.tags || []).includes("online"),
    english_friendly: isEnglishFriendly(ev),
    is_free: ev.is_free ?? UNKNOWN,
    price: price.known ? price.text : UNKNOWN,
    signup_deadline: ev.signup_deadline ?? UNKNOWN,
    source: ev.source_platform,
    source_url: ev.source_url,
    page_url: pageUrl(`#/event/${encodeURIComponent(ev.uid)}`),
  };
}

function detailEvent(ev, events) {
  const d = { ...ev, starts_at: ev.starts_at ?? UNKNOWN, is_free: ev.is_free ?? UNKNOWN, signup_deadline: ev.signup_deadline ?? UNKNOWN };
  for (const f of HIDDEN_FIELDS) delete d[f];
  d.english_friendly = isEnglishFriendly(ev);
  d.other_sessions = otherSessions(ev, events).map((s) => ({ uid: s.uid, starts_at: s.starts_at }));
  d.page_url = pageUrl(`#/event/${encodeURIComponent(ev.uid)}`);
  return d;
}

function factOut(f) {
  if (!f) return null;
  return {
    id: f.id, label: f.label, display: f.display, value: f.value, year: f.year ?? null,
    status: f.status, checked_at: f.checked_at, provisional: f.provisional || undefined, note: f.note || undefined,
    sources: f.sources.map((s) => ({ title: s.title, title_en: s.title_en || null, publisher: s.publisher, url: s.url })),
    original_text: f.quotes.map((q) => q.quote),
  };
}

/** 某一節實際引用到的官方出處：該節用到的 facts 的來源，加上 cite 區塊。沒有就退回整篇的出處。 */
function sectionSources(g, sectionId, state) {
  const sec = g.sections.find((s) => s.id === sectionId);
  if (!sec) return guideSources(g, state).slice(0, 4);
  const seen = new Set();
  const out = [];
  const push = (s) => {
    if (!s || !s.url || seen.has(s.url)) return;
    seen.add(s.url);
    out.push({ title: s.title, title_en: s.title_en || null, publisher: s.publisher, url: s.url });
  };
  for (const m of JSON.stringify(sec).matchAll(/\{\{fact:([a-z0-9_]+)\}\}/g)) {
    for (const s of (state.facts[m[1]] || {}).sources || []) push(s);
  }
  for (const b of sec.blocks || []) {
    for (const sid of b.cite || []) push(state.content.tax.sources.find((x) => x.id === sid));
  }
  return out.length ? out.slice(0, 5) : guideSources(g, state).slice(0, 4);
}

function guideSources(g, state) {
  return (g.sources || []).map((sid) => state.content.tax.sources.find((s) => s.id === sid)).filter(Boolean)
    .map((s) => ({ title: s.title, title_en: s.title_en || null, publisher: s.publisher, url: s.url, snapshot: s.last_ok, page_updated: s.page_updated, status: s.status }));
}

async function register() {
  const site = window.site;
  await site.ready;
  const state = site.state;
  const today = todayFmt.format(new Date());            // 例如 "Thu, 2026-10-15"
  const typeList = Object.entries(TYPE_META).map(([k, v]) => `${k} (${v.en})`).join(", ");
  const go = (path, params, label) => { site.navigate(path, params, { fromAgent: true }); site.agentToast(label); };
  const years = Object.keys(state.content.tax.params.years);

  const reg = (tool) => document.modelContext.registerTool({ annotations: { readOnlyHint: true }, ...tool });

  // ── 活動 ───────────────────────────────────────────────────────────────

  await reg({
    name: "search_events",
    description:
      `Search events in Taipei and New Taipei. Today is ${today} (Asia/Taipei); convert "this weekend", "next week" etc. into start_after / start_before. ` +
      "Expired events are excluded; upcoming events come first, ongoing ones (long exhibitions) after. " +
      "A value of \"unknown\" means the source didn't say — is_free: unknown is not 'paid', signup_deadline: unknown is not 'no deadline'. Say so when reporting. " +
      "Titles are in the original language; title_en is given when the source had one. The page's Events list switches to the same filters and results.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Case-insensitive substring matched against title, English title, description, venue, organiser and tags. Chinese is not segmented — use short words." },
        types: { type: "array", items: { type: "string", enum: Object.keys(TYPE_META) }, description: `Event types, any of: ${typeList}` },
        start_after: { type: "string", description: "Earliest start. YYYY-MM-DD (from 00:00 Taipei time) or ISO 8601 with offset." },
        start_before: { type: "string", description: "Latest start. YYYY-MM-DD (until 23:59:59 Taipei time) or ISO 8601 with offset." },
        city: { type: "string", enum: ["臺北市", "新北市"], description: "Only Taipei City (臺北市) or New Taipei City (新北市). Omit for both." },
        english_friendly: { type: "boolean", description: "Only events whose listing is in English or says English is spoken." },
        free_only: { type: "boolean", description: "Only events known to be free. Events with unknown price are excluded." },
        signup_open: { type: "boolean", description: "Only events still open for sign-up. When the deadline is unknown, the start time is used — tell the user this may be imprecise." },
        exclude_online: { type: "boolean", description: "In-person events only." },
        new_this_week: { type: "boolean", description: "Only events first found by this week's crawl." },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: `Max results returned (default ${DEFAULT_LIMIT}); total tells you how many matched.` },
      },
      additionalProperties: false,
    },
    async execute(args = {}) {
      const { limit = DEFAULT_LIMIT, english_friendly = false, new_this_week = false, ...raw } = args;
      const n = Math.min(Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT), MAX_LIMIT);
      const params = normalizeParams(raw);
      const rows = runQuery(state.events, { params, english: english_friendly, fresh: new_this_week, sort: "soonest" });
      const url = { ...params, english: english_friendly, new: new_this_week };
      // 只有「台北時間整天」的邊界才能縮成 YYYY-MM-DD；週六 18:00 或 UTC 時間要原樣帶，
      // 否則頁面會用整天的時間窗，列出比工具多的活動
      if (url.start_after && url.start_after.endsWith("T00:00:00+08:00")) url.start_after = url.start_after.slice(0, 10);
      if (url.start_before && url.start_before.endsWith("T23:59:59+08:00")) url.start_before = url.start_before.slice(0, 10);
      go("/events", url, `Claude searched events · ${rows.length} found`);
      return text({
        today, params_applied: { ...params, english_friendly, new_this_week },
        total: rows.length, returned: Math.min(n, rows.length),
        events: rows.slice(0, n).map(summarizeEvent),
        page_url: location.href,
      });
    },
  });

  await reg({
    name: "get_event",
    description: "Full details of one event by the uid from search_events: description, organiser, address, tags, and other upcoming sessions of the same series. \"unknown\" means the source didn't provide it. The page opens that event.",
    inputSchema: {
      type: "object",
      properties: { uid: { type: "string", description: "Event uid, e.g. meetup:316481811" } },
      required: ["uid"],
      additionalProperties: false,
    },
    async execute({ uid }) {
      const ev = state.events.find((e) => e.uid === uid);
      if (!ev) return err(`No event with uid ${uid}`);
      go(`/event/${encodeURIComponent(uid)}`, null, "Claude opened an event");
      return text(detailEvent(ev, state.events));
    },
  });

  // ── 指南 ───────────────────────────────────────────────────────────────

  await reg({
    name: "search_guides",
    description:
      "Search Ma's guides — Taiwan tax for foreign professionals (residency and the 183-day rule, rates, filing, employer withholding, Gold Card and special professional incentive, stock options, overseas income) and life in Taipei. " +
      "Returns matching sections with snippets and the official sources behind each guide. Use get_guide to read a section in full before answering. " +
      `${DISCLAIMER} The page switches to the same search.`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language question or keywords in English, e.g. 'leaving Taiwan mid-year', '183 days', 'RSU'." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Max results (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute({ query, limit = 5 }) {
      const parsed = parseQuery(query);
      const hits = searchGuides(state.guideIndex, { ...parsed, guideTokens: parsed.guideTokens }, Math.min(10, Math.max(1, limit)));
      go("/search", { q: query, scope: "guides" }, `Claude searched the guides · ${hits.length} results`);
      return text({
        query,
        results: hits.map((h) => {
          const g = state.guidesBySlug[h.slug];
          return {
            guide: h.slug, guide_title: h.guideTitle, section: h.sectionId, heading: h.heading, snippet: h.snippet,
            page_url: pageUrl(`#/guide/${h.slug}?s=${h.sectionId}`),
            guide_updated: g.updated, sources: sectionSources(g, h.sectionId, state),
          };
        }),
        disclaimer: DISCLAIMER,
      });
    },
  });

  await reg({
    name: "get_guide",
    description:
      `Read a guide as plain text (optionally one section), with its official sources and the verification status of every figure it uses. Guides: ${state.guides.map((g) => `${g.slug} (${g.title})`).join("; ")}. ` +
      `${DISCLAIMER} The page opens the guide at that section.`,
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", enum: state.guides.map((g) => g.slug) },
        section: { type: "string", description: "Section id from search_guides (optional)." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    async execute({ slug, section }) {
      const g = state.guidesBySlug[slug];
      if (!g) return err(`No guide ${slug}`);
      const sec = section ? g.sections.find((s) => s.id === section) : null;
      // 試算範例：用跟網頁同一支 estimate() 算出來，轉成一行文字
      const calc = (spec) => {
        const items = spec.compare || [{ label: spec.label || "Estimate", input: spec.input }];
        const parts = items.map((it) => {
          const r = estimate(it.input, resolveParams(state.content.tax, it.input.year));
          return `${it.label}: NT$${Math.round(r.total).toLocaleString("en-US")} (${(r.effectiveRate * 100).toFixed(1)}% of income)`;
        });
        return `[Worked example${spec.title ? ` — ${spec.title}` : ""}] ${parts.join("; ")}`;
      };
      const body = sec ? guideToText({ title: g.title, sections: [sec] }, state.facts, { calc }) : guideToText(g, state.facts, { calc });
      const scope = JSON.stringify(sec || g);
      const factIds = [...new Set([
        ...(scope.match(/\{\{fact:([a-z0-9_]+)\}\}/g) || []).map((m) => m.slice(7, -2)),
        // facts: [...] 區塊裡的數字（不是寫成 {{fact:…}} 的那些）
        ...(sec ? [sec] : g.sections).flatMap((x) => (x.blocks || []).flatMap((b) => b.facts || [])),
      ])];
      go(`/guide/${slug}`, sec ? { s: sec.id } : null, "Claude is reading a guide");
      return text({
        slug, title: g.title, updated: g.updated, section: sec ? sec.id : null,
        sections: g.sections.map((s) => ({ id: s.id, heading: s.heading })),
        text: body,
        figures: factIds.map((id) => factOut(state.facts[id])).filter(Boolean),
        sources: guideSources(g, state),
        page_url: location.href,
        disclaimer: DISCLAIMER,
      });
    },
  });

  // ── 稅務 ───────────────────────────────────────────────────────────────

  const yearSchema = { type: "integer", enum: years.map(Number), description: `Tax year (calendar year). Default ${state.content.tax.params.default_year}.` };
  const staysSchema = {
    type: "array",
    description: "Stays in Taiwan. Each stay: arrival date and departure date (omit departure if still in Taiwan). Trips abroad split a stay in two.",
    items: {
      type: "object",
      properties: { arrive: { type: "string", description: "YYYY-MM-DD" }, depart: { type: "string", description: "YYYY-MM-DD, omit if still here" } },
      required: ["arrive"],
      additionalProperties: false,
    },
  };

  // 天數：有 stays 用 stays 算；有 days 用 days；都沒給就假設全年在台（365 天）並在回傳裡說出來 ——
  // 試算頁沒給天數時也是 365，兩邊才會一致
  const daysFrom = (args, year) => {
    if (Array.isArray(args.stays) && args.stays.length) {
      const { counted, projected } = countDays(args.stays, year, taipeiParts().ymd);
      return { days: projected, counted, projected, from: "stays", assumed: null };
    }
    if (args.days == null) {
      return { days: 365, counted: null, projected: null, from: "days", assumed: "days not given — assumed a full year in Taiwan (365 days); pass days or stays to change" };
    }
    return { days: Math.max(0, Math.trunc(args.days)), counted: null, projected: null, from: "days", assumed: null };
  };

  await reg({
    name: "check_tax_residency",
    description:
      `Decide whether someone is a Taiwan tax resident for a calendar year. Give either days (total days in Taiwan) or stays (arrival/departure dates). Today is ${today}. ` +
      "Applies the official counting rule (arrival day not counted, departure day counted; trips added up) and the 90 / 183-day thresholds, and explains what the status means. " +
      "With stays and no departure date, days are projected to 31 December and counted-so-far is also returned. " +
      `${DISCLAIMER} The page opens the calculator with these days.`,
    inputSchema: {
      type: "object",
      properties: { year: yearSchema, days: { type: "integer", minimum: 0, maximum: 366 }, stays: staysSchema },
      additionalProperties: false,
    },
    async execute(args = {}) {
      if (args.days == null && !(Array.isArray(args.stays) && args.stays.length)) {
        return err("Give either days (total days in Taiwan in the tax year) or stays (arrival and departure dates).");
      }
      const P = resolveParams(state.content.tax, args.year);
      const d = daysFrom(args, P.year);
      const res = residency(d.days, P);
      // salary 明確給 0：頁面不要補上預設的年薪（它會顯示「先填薪資」而不是一個沒人問的稅額）
      const input = { year: P.year, mode: d.from === "stays" ? "trips" : "days", days: d.days, stays: args.stays || [], salary: 0 };
      go("/tax/calculator", paramsFromInput(input), `Claude checked residency · ${res.days} days`);
      const meaning = {
        le90: ["Taiwan-source income is withheld at source; no annual return for salary.", "Pay from an overseas employer for work done in Taiwan is not taxed."],
        mid: ["Taiwan-source income is withheld at source (salary usually 18%).", "Pay from an overseas employer for work done in Taiwan is taxable at 18% and must be self-reported before departure or in May."],
        resident: ["Taxed at progressive rates (5–40%) after exemptions and deductions.", "Files an annual return 1–31 May the following year (before departure if leaving for good)."],
      }[res.band];
      return text({
        year: P.year, days: res.days, days_counted_so_far: d.counted, days_projected_to_year_end: d.projected,
        assumptions: d.assumed ? [d.assumed] : [],
        status: res.resident ? "resident" : "non-resident", band: res.band, days_short_of_residency: res.toResident,
        latest_arrival_to_be_resident_if_staying: latestArrivalForResidency(P.year, P),
        what_it_means: meaning,
        rules: ["residency_days", "day_counting", "foreign_employer_90", "foreign_employer_over_90_rate"].map((id) => factOut(state.facts[id])),
        page_url: location.href,
        disclaimer: DISCLAIMER,
      });
    },
  });

  await reg({
    name: "estimate_tax",
    description:
      "Estimate Taiwan income tax for a foreign professional: decides residency from days (or stays), then applies non-resident withholding or resident progressive rates with exemptions, deductions, the rent deduction limits, the special professional (Gold Card) incentive and the minimum tax on overseas income. " +
      "Every line of the breakdown carries the fact id and official source it uses. Limits: assumes a spouse has no Taiwan income, no detailed itemized deductions, no foreign tax credit. " +
      `${DISCLAIMER} The page opens the calculator filled with the same inputs.`,
    inputSchema: {
      type: "object",
      properties: {
        year: yearSchema,
        days: { type: "integer", minimum: 0, maximum: 366, description: "Days in Taiwan in the tax year (or give stays)." },
        stays: staysSchema,
        salary: { type: "number", minimum: 0, description: "Annual salary from a Taiwan employer in NT$, including bonuses." },
        months: { type: "integer", minimum: 1, maximum: 12, description: "Months the salary covers (non-resident 6%/18% test). Default 12." },
        foreign_pay: { type: "number", minimum: 0, description: "Pay from an overseas employer for work done in Taiwan, NT$." },
        other_income: { type: "number", minimum: 0, description: "Other Taiwan-source income, NT$." },
        married: { type: "boolean", description: "Married, spouse files jointly and has no Taiwan income." },
        dependents: { type: "integer", minimum: 0, description: "Dependants under 70, including children." },
        minor_children: { type: "integer", minimum: 0, description: "How many of those dependants are minor children." },
        elderly_dependents: { type: "integer", minimum: 0, description: "Parents or grandparents aged 70+." },
        rent: { type: "number", minimum: 0, description: "Annual rent for one's home in Taiwan, NT$." },
        special_professional: { type: "boolean", description: "Qualifies for the Foreign Professionals Act Art. 22 incentive (special professional permit or Gold Card)." },
        overseas_income: { type: "number", minimum: 0, description: "Household overseas income (foreign dividends, foreign capital gains), NT$." },
        leaving_for_good: { type: "boolean", description: "Leaving Taiwan permanently this year." },
      },
      additionalProperties: false,
    },
    async execute(args = {}) {
      const P = resolveParams(state.content.tax, args.year);
      const d = daysFrom(args, P.year);
      const input = {
        year: P.year, days: d.days, salary: args.salary || 0, months: args.months, foreignPay: args.foreign_pay,
        otherIncome: args.other_income, married: args.married, dependents: args.dependents, minors: args.minor_children,
        elderly: args.elderly_dependents, rent: args.rent, specialTalent: args.special_professional,
        overseasIncome: args.overseas_income, leavingForGood: args.leaving_for_good,
      };
      const r = estimate(input, P);
      const urlInput = { ...input, mode: d.from === "stays" ? "trips" : "days", stays: args.stays || [] };
      go("/tax/calculator", paramsFromInput(urlInput), `Claude estimated tax · NT$${Math.round(r.total).toLocaleString("en-US")}`);
      const factFor = (key) => (key ? state.facts[(P[key] && P[key].fact) || key] : null);
      return text({
        year: P.year, residency: { status: r.residency.resident ? "resident" : "non-resident", band: r.residency.band, days: r.residency.days, days_counted_so_far: d.counted },
        total_tax: Math.round(r.total), effective_rate: Number(r.effectiveRate.toFixed(4)), top_rate: r.marginalRate,
        regime: r.regime, must_file: r.mustFile, deadline: r.deadline,
        assumptions: [d.assumed, args.salary == null ? "salary not given — treated as 0" : null].filter(Boolean),
        breakdown: r.lines.map((l) => {
          const f = factFor(l.fact);
          return { label: l.label, amount: l.amount, kind: l.kind, fact: f ? f.id : null, figure: f ? f.display : null, status: f ? f.status : null, source: f && f.sources[0] ? f.sources[0].url : null };
        }),
        notes: r.notes,
        // 有給、但沒有改變稅額的輸入，以及原因（例如租金扣除因稅率 20% 以上不適用）
        inputs_without_effect: r.effects || {},
        official_calculator: "https://www.etax.nat.gov.tw/etwmain/etw158w/1502",
        page_url: location.href,
        disclaimer: DISCLAIMER,
      });
    },
  });

  await reg({
    name: "get_tax_calendar",
    description: `Taiwan tax dates relevant to foreign professionals — filing period, income data release, refund batches, announcements, year boundaries — with which ones have passed and what is next. Today is ${today}. The page opens the tax calendar.`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const t = taipeiParts().ymd;
      const items = state.content.tax.calendar;
      const next = nextCalendarItem(items, t);
      go("/tax", null, "Claude opened the tax calendar");
      return text({
        today,
        next: next ? { date: next.item.date, title: next.item.title, in_days: next.days } : null,
        items: items.map((it) => ({
          date: it.date, end: it.end || null, approximate: Boolean(it.approx),
          status: (it.end || it.date) < t ? "past" : next && next.item === it ? "next" : "upcoming",
          title: it.title, detail: plain(it.text, state.facts),
          source: it.fact ? factOut(state.facts[it.fact]) : null,
        })),
        disclaimer: DISCLAIMER,
      });
    },
  });

  await reg({
    name: "get_tax_facts",
    description:
      "The tax figures and rules behind the guides — rates, thresholds, exemptions, deductions, dates — each with its verification status (verified = the official sentence was found unchanged at the last weekly check; drifted = the official page changed, treat as under review; unchecked = no snapshot), the official source and the original-language quote. " +
      "Filter by topic or year, or ask for specific ids. Topics: residency, nonresident, withholding, deductions, rates, overseas, incentives, equity, filing, departure.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: ["residency", "nonresident", "withholding", "deductions", "rates", "overseas", "incentives", "equity", "filing", "departure"] },
        year: { type: "integer", description: "Only figures for this tax year (figures without a year always match)." },
        ids: { type: "array", items: { type: "string" }, description: "Specific fact ids." },
      },
      additionalProperties: false,
    },
    async execute({ topic, year, ids } = {}) {
      let facts = Object.values(state.facts);
      if (ids && ids.length) facts = facts.filter((f) => ids.includes(f.id));
      if (topic) facts = facts.filter((f) => f.topics.includes(topic));
      if (year) facts = facts.filter((f) => f.year == null || f.year === year);
      site.agentToast(`Claude looked up ${facts.length} tax figures`);
      return text({ count: facts.length, checked_at: state.content.tax.checked_at, facts: facts.map(factOut), disclaimer: DISCLAIMER });
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
  const label = btn.querySelector(".relay-label");
  const on = relayWanted();
  btn.setAttribute("aria-pressed", String(on));
  label.textContent = on ? "Claude connected" : "Connect Claude";
  btn.title = on
    ? "This page's tools are offered to your local Claude Code through the WebMCP relay. Click to disconnect."
    : "Offer this page's tools to your local Claude Code through the WebMCP relay (run the relay first — see About the data).";
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
  .catch((e) => {
    console.error("[webmcp] 工具註冊失敗", e);
    setupRelayToggle();
  });
