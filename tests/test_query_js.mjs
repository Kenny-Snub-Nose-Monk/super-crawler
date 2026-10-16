// 查詢語意的共用規格（JS 這一側）。Python 那側是 tests/test_query_cases.py。
//
// 跑法： node tests/test_query_js.mjs
import { readFileSync } from "node:fs";
import { queryEvents, normalizeParams, refreshStatus } from "../site/query.js";

const spec = JSON.parse(readFileSync(new URL("./fixtures/query_cases.json", import.meta.url), "utf-8"));
const failures = [];

function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) failures.push(label);
}

console.log("1. 共用案例");
for (const c of spec.cases) {
  const got = queryEvents(spec.events, c.params, spec.now).map((e) => e.uid);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  check(c.name, ok, ok ? "" : `got ${JSON.stringify(got)}`);
}

console.log("2. 參數正規化（網頁與工具的入口）");
const n = normalizeParams({ keyword: "  jazz ", types: [], start_after: "2026-10-01", start_before: "2026-10-04", free_only: false });
check("空白修掉、空陣列與 false 不帶", JSON.stringify(Object.keys(n).sort()) === JSON.stringify(["keyword", "start_after", "start_before"]), JSON.stringify(n));
check("日期補成台北整天", n.start_after === "2026-10-01T00:00:00+08:00" && n.start_before === "2026-10-04T23:59:59+08:00");
check("完整 ISO 原樣保留", normalizeParams({ start_after: "2026-10-01T18:00:00+08:00" }).start_after === "2026-10-01T18:00:00+08:00");

console.log("3. 載入時重算狀態（store.refresh_status 的同語意）");
const now = "2026-10-15T12:00:00+08:00";
const evs = refreshStatus([
  { uid: "past", status: "upcoming", starts_at: "2026-10-01T19:00:00+08:00", ends_at: null },
  { uid: "running", status: "upcoming", starts_at: "2026-10-01T00:00:00+08:00", ends_at: "2026-11-30T23:59:59+08:00" },
  { uid: "later", status: "ongoing", starts_at: "2026-10-20T19:00:00+08:00", ends_at: null },
  { uid: "nodate", status: "upcoming", starts_at: null, ends_at: null },
  { uid: "cancelled", status: "cancelled", starts_at: "2026-10-01T19:00:00+08:00", ends_at: null },
], now);
const st = Object.fromEntries(evs.map((e) => [e.uid, e.status]));
check("開始於過去、沒有結束時間 → expired", st.past === "expired", st.past);
check("開始了還沒結束 → ongoing", st.running === "ongoing", st.running);
check("還沒開始 → upcoming（即使原本標 ongoing）", st.later === "upcoming", st.later);
check("沒有時間 → upcoming（不猜它過期）", st.nodate === "upcoming", st.nodate);
check("手動取消的不動", st.cancelled === "cancelled", st.cancelled);

console.log(failures.length ? `\n${failures.length} 個失敗` : "\n全部通過");
process.exit(failures.length ? 1 : 0);
