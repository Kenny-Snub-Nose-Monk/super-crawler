// 搜尋框（site/lib/search.js）的測試：自然語句 → 條件、指南搜尋的排序。
//
// 「今天」固定成 2026-10-15（週四）台北中午，時間窗才測得準。
// 指南的部分讀匯出的 site/data/content.json（先跑 python3 scripts/export_site_data.py）。
//
// 跑法： node tests/test_search_js.mjs
import { readFileSync, existsSync } from "node:fs";
import { parseQuery, toQueryParams, withoutChip, searchGuides, buildGuideIndex, glance } from "../site/lib/search.js";
import { windows } from "../site/lib/time.js";
import { plain } from "../site/lib/guides.js";

const THU = new Date("2026-10-15T12:00:00+08:00");
const SUN = new Date("2026-10-18T10:00:00+08:00");
const failures = [];
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail !== "" ? "  " + detail : ""}`);
  if (!cond) failures.push(label);
}

console.log("1. 時間窗（台北時間）");
const w = windows(THU);
check("週四的「這個週末」= 週六日", w.weekend.start === "2026-10-17T00:00:00+08:00" && w.weekend.end === "2026-10-18T23:59:59+08:00", `${w.weekend.start} ~ ${w.weekend.end}`);
check("週四的「這週」到週日", w.week.end === "2026-10-18T23:59:59+08:00");
check("下週 = 下週一到週日", w.nextWeek.start === "2026-10-19T00:00:00+08:00" && w.nextWeek.end === "2026-10-25T23:59:59+08:00");
check("這個月到 10/31", w.month.end === "2026-10-31T23:59:59+08:00");
const ws = windows(SUN);
check("週日的「這個週末」只剩今天", ws.weekend.start === "2026-10-18T00:00:00+08:00" && ws.weekend.end === "2026-10-18T23:59:59+08:00");
check("不管瀏覽器在哪個時區，用的都是台北日期", windows(new Date("2026-10-15T23:30:00Z")).today.start === "2026-10-16T00:00:00+08:00");

console.log("\n2. 自然語句 → 條件");
let q = parseQuery("free english events this weekend", THU);
check("this weekend → 週末時間窗", q.when && q.when.key === "weekend");
check("free → 只要免費", q.free === true);
check("english → 英文友善", q.english === true);
check("events 是停用字，沒有剩下要比對的字", q.tokens.length === 0, JSON.stringify(q.tokens));
check("標籤三個", q.chips.length === 3, q.chips.map((c) => c.label).join(","));
const p = toQueryParams(q);
check("交給共用查詢的條件", p.free_only === true && p.tags[0] === "lang:en" && p.start_after === "2026-10-17T00:00:00+08:00");
q = parseQuery("jazz tonight", THU);
check("tonight → 今晚 17:00 起", q.when.key === "tonight" && q.when.start === "2026-10-15T17:00:00+08:00");
check("jazz → 音樂主題的爵士子分類", q.topic === "music" && q.sub === "jazz");
q = parseQuery("climbing in new taipei", THU);
check("new taipei → 只看新北", q.city === "新北市");
check("climbing → 戶外的攀岩", q.topic === "outdoors" && q.sub === "climbing");
q = parseQuery("markets in november", THU);
check("november → 11/1–11/30", q.when.start === "2026-11-01T00:00:00+08:00" && q.when.end === "2026-11-30T23:59:59+08:00", `${q.when.start} ~ ${q.when.end}`);
q = parseQuery("週末 免費 市集", THU);
check("中文也認：週末、免費、市集", q.when.key === "weekend" && q.free && q.topic === "markets");
q = parseQuery("183 days resident", THU);
check("稅務問題 → tax，不當成活動主題", q.tax === true && !q.topic);
q = parseQuery("events in Taipei", THU);
check("Taipei 只是語氣，不排除新北", !q.city);
q = parseQuery("free english this weekend", THU);
check("移除一個標籤 = 從原句拿掉那幾個字", withoutChip(q, "free") === "english this weekend", withoutChip(q, "free"));
q = parseQuery("free outdoor", THU);
let rest = parseQuery(withoutChip(q, "free"), THU);
check("「free outdoor」拿掉 Free → 還是戶外主題、沒有多出要比對的字", rest.topic === "outdoors" && rest.tokens.length === 0, JSON.stringify([withoutChip(q, "free"), rest.tokens]));
q = parseQuery("yoga this weekend", THU);
check("「yoga this weekend」拿掉日期 → yoga", withoutChip(q, "when") === "yoga", withoutChip(q, "when"));
q = parseQuery("this weekend social", THU);
rest = parseQuery(withoutChip(q, "when"), THU);
check("「this weekend social」拿掉日期 → 社交主題，不會跳到語言交換子分類", rest.topic === "social" && !rest.sub, JSON.stringify([rest.topic, rest.sub]));

console.log("\n2b. may 也是助動詞");
check("may i deduct rent → 不是五月", !parseQuery("may i deduct rent", THU).when);
check("markets in may → 五月", parseQuery("markets in may", THU).when?.label === "May");
check("jazz may 3 → 五月", parseQuery("jazz may 3", THU).when?.label === "May");

console.log("\n2c. 摘要的「最快開始」是真的最快，不是相關度第一");
const g = glance([
  { uid: "late", status: "upcoming", starts_at: "2026-11-15T19:00:00+08:00", tags: [] },
  { uid: "soon", status: "upcoming", starts_at: "2026-10-27T19:00:00+08:00", tags: [] },
]);
check("取開始時間最早的那一場", g.first.uid === "soon", g.first.uid);

console.log("\n3. 指南搜尋（用網站實際的內容）");
const path = new URL("../site/data/content.json", import.meta.url);
if (!existsSync(path)) {
  console.error("找不到 site/data/content.json —— 先跑 python3 scripts/export_site_data.py");
  process.exit(1);
}
const content = JSON.parse(readFileSync(path, "utf-8"));
const index = buildGuideIndex(content.guides, (t) => plain(t, content.tax.facts));
const top = (query, n = 3) => searchGuides(index, parseQuery(query, THU), n).map((r) => `${r.slug}#${r.sectionId}`);
let t = top("183 days");
check("183 days → 183 天那篇排第一", t[0] && t[0].startsWith("183-day-rule"), t.join(" | "));
t = top("rsu stock options");
check("rsu stock options → 金卡與股權那篇的股權段落", t.some((x) => x === "tax-benefits#equity"), t.join(" | "));
t = top("leaving taiwan departure");
check("leaving taiwan → 離境相關段落在前三", t.some((x) => /first-and-last|leaving/.test(x)), t.join(" | "));
t = top("gold card");
check("gold card → 特定專業人才優惠", t[0] && t[0].startsWith("tax-benefits"), t.join(" | "));
t = top("refund");
check("refund → 申報步驟", t.some((x) => x.startsWith("how-to-file")), t.join(" | "));
check("fact 有轉成文字（沒有字面的 {{fact:…}}）", index.every((e) => !e.text.includes("{{fact:")));

console.log(failures.length ? `\n${failures.length} 個失敗` : "\n全部通過");
process.exit(failures.length ? 1 : 0);
