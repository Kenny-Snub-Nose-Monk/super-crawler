// 活動頁的「同一系列的其他場次」與「類似活動」—— 中文標題的回歸測試。
//
// 跑法： node tests/test_event_js.mjs
// 曾經的 bug：標題正規化用了 JS 的 \W，中文全被刪成空字串，
// 同一個主辦的每一場中文活動都互相變成「其他場次」（WebMCP 的 get_event 也照樣回傳）。

import { otherSessions, similarEvents } from "../site/views/event.js";

let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!cond) failures++;
}

const ev = (uid, title, starts_at, extra = {}) => ({
  uid, title, starts_at, status: "upcoming", type: "outdoor_challenge", organizer: "Taiwan Pathfinder 台灣引路人", tags: [], ...extra,
});
const climb1 = ev("tp:climb-1018", "熱海攀岩體驗", "2026-10-18T00:00:00+08:00");
const climb2 = ev("tp:climb-1115", "熱海攀岩體驗", "2026-11-15T00:00:00+08:00");
const canyon = ev("tp:canyon-1024", "大尖山瀑布溯溪", "2026-10-24T00:00:00+08:00");
const longdong1 = ev("tp:ld-1121", "龍洞新手攀岩 Longdong", "2026-11-21T00:00:00+08:00");
const longdong2 = ev("tp:ld-1206", "龍洞新手攀岩　Longdong！", "2026-12-06T00:00:00+08:00");
const otherOrg = ev("x:climb", "熱海攀岩體驗", "2026-10-25T00:00:00+08:00", { organizer: "別的社團" });
const expired = ev("tp:climb-0901", "熱海攀岩體驗", "2026-09-01T00:00:00+08:00", { status: "expired" });
const all = [climb1, climb2, canyon, longdong1, longdong2, otherOrg, expired];

console.log("1. 其他場次：同主辦、同標題（中文也要比得出來）、還沒開始");
const s1 = otherSessions(climb1, all).map((e) => e.uid);
check("同標題的另一場算", s1.includes("tp:climb-1115"), JSON.stringify(s1));
check("同主辦但不同活動的不算", !s1.includes("tp:canyon-1024") && !s1.includes("tp:ld-1121"), JSON.stringify(s1));
check("不同主辦的不算", !s1.includes("x:climb"));
check("已結束的不算", !s1.includes("tp:climb-0901"));
const s2 = otherSessions(longdong1, all).map((e) => e.uid);
check("空白、全形空白、標點不影響比對", JSON.stringify(s2) === JSON.stringify(["tp:ld-1206"]), JSON.stringify(s2));
check("只有一場的活動沒有其他場次", otherSessions(canyon, all).length === 0);

console.log("\n2. 類似活動：同類型、但不是同一個活動");
const sim = similarEvents(climb1, all).map((e) => e.uid);
check("不同標題的同類活動會出現", sim.includes("tp:canyon-1024"), JSON.stringify(sim));
check("同標題的其他場次不算「類似」", !sim.includes("tp:climb-1115"), JSON.stringify(sim));

console.log(failures ? `\n${failures} 個失敗` : "\n全部通過");
process.exit(failures ? 1 : 0);
