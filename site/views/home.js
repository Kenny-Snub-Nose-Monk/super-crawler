// 首頁＝介紹頁：外國人帶著的三個問題，每一題當場回答 ——
// 我是不是居住者、這個週末有什麼、Claude 能不能幫我做。第三題接到「連接 Claude」的安裝步驟。
// 天數工具的完整版（格子、期限）在稅務頁；這裡的第一題用同一個 statusFor。

import { h, icon } from "../lib/dom.js";
import { queryEvents } from "../query.js";
import { windows } from "../lib/time.js";
import { isEnglishFriendly, isOnline, formatPrice } from "../lib/format.js";
import { statusFor, residencyContext } from "./residency.js";
import { TOOLS } from "./about.js";
import { factMark, chapter, figure } from "./report.js";

/** 給「精選」用的分數：英文友善、實體、資訊完整的排前面。沒有熱門度資料，所以不叫「最熱門」。 */
export function pickScore(ev) {
  let s = 0;
  if (isEnglishFriendly(ev)) s += 2;
  if (!isOnline(ev)) s += 1;
  if (formatPrice(ev).known) s += 0.5;
  if (ev.venue || ev.address) s += 0.5;
  if (ev.description) s += 0.25;
  return s;
}

export function weekendPicks(events, now = new Date(), limit = 6) {
  const w = windows(now);
  let rows = queryEvents(events, { start_after: w.weekend.start, start_before: w.weekend.end }, now.getTime());
  rows = rows.filter((e) => e.status === "upcoming" || e.status === "ongoing");
  let label = "This weekend";
  if (rows.filter((e) => e.status === "upcoming").length < 3) {
    rows = queryEvents(events, { start_after: w.next7.start, start_before: w.next7.end }, now.getTime());
    label = "The next seven days";
  }
  // 週末精選只放實體活動 —— 線上課程多半是補習班的行銷，不是「出門」
  const upcoming = rows.filter((e) => e.status === "upcoming" && !isOnline(e));
  const ranked = upcoming
    .map((e, i) => ({ e, s: pickScore(e) - i * 0.002 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
  return { label, total: upcoming.length, events: ranked.slice(0, limit), window: label === "This weekend" ? w.weekend : w.next7 };
}

const RELAY_PKG = "@mcp-b/webmcp-local-relay@5.1.0";

const PROMPTS = [
  "Am I a tax resident for 2026 if I arrived on 10 March and spent three weeks abroad in August?",
  "Estimate my 2026 tax on a NT$4.2M salary as a resident, single, no dependants.",
  "What's due next on the Taiwan tax calendar?",
  "Find free, English-friendly events this weekend in Taipei.",
];

/** 可以複製的指令：上面一行說明這是什麼，下面是指令本身 */
function codeBlock(label, text, { cmd = true } = {}) {
  const btn = h("button", { type: "button", class: "copy-btn" }, "Copy");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = "Copy"; }, 1600);
    } catch { btn.textContent = "Select and copy"; }
  });
  return h("figure", { class: `code-call${cmd ? " cmd" : ""}` },
    h("figcaption", null, h("span", null, label), btn),
    // 一行指令：每個字不斷開（連字號也不斷），只在字與字之間換行；複製的是原字串
    h("pre", null, h("code", null, cmd
      ? text.split(" ").flatMap((t, i) => [i ? " " : null, h("span", { class: "tok" }, t)])
      : text)));
}

/** 一個安裝步驟：大號的步驟數字、這一步只做一件事 */
function step(n, title, ...body) {
  return h("li", { class: "install-step" },
    h("span", { class: "step-n", "aria-hidden": "true" }, String(n)),
    h("div", { class: "step-body" }, h("h3", null, h("span", { class: "sr-only" }, `Step ${n}: `), title), ...body));
}

function relayStep(n) {
  const relay = document.getElementById("relay");
  const on = relay && relay.getAttribute("aria-pressed") === "true";
  const btn = h("button", { type: "button", class: `btn${on ? " ghost" : ""}` }, on ? "This page is connected. Disconnect" : "Connect this page to Claude");
  btn.addEventListener("click", () => relay && relay.click());
  return step(n, "Connect this page",
    h("p", { class: "desktop-only" }, "With Claude running, press ", h("strong", null, "Connect Claude"), " at the top right of any Ma page, or the button below. It's off by default, so a visitor's browser never contacts ports on their computer unless they choose to."),
    h("p", { class: "phone-only" }, "Do this step on the computer where Claude runs: open Ma there and press ", h("strong", null, "Connect Claude"), " at the top right. It's off by default."),
    h("div", { class: "desktop-only" }, btn),
    h("p", { class: "hint-text" }, "The tools exist while a Ma tab is open. Reloading the page drops them for a moment."));
}

function askStep(n) {
  return step(n, "Ask in your own words",
    h("p", null, "Claude answers from the same guides, figures and calculator, quotes the official source, and this page moves to the result it used. Press a question to copy it."),
    h("div", { class: "prompt-chips" }, PROMPTS.map((p) => {
      const b = h("button", { type: "button", class: "prompt-chip" }, p);
      b.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(p); b.textContent = "Copied. Paste it to Claude"; setTimeout(() => { b.textContent = p; }, 1800); } catch { /* 剪貼簿不可用 */ }
      });
      return b;
    })));
}

function connectSection() {
  const origin = location.origin;
  const codeCmd = `claude mcp add -s user webmcp-relay -- npx -y ${RELAY_PKG} --widget-origin ${origin}`;
  const desktopJson = JSON.stringify({
    mcpServers: { "webmcp-relay": { command: "npx", args: ["-y", RELAY_PKG, "--widget-origin", origin] } },
  }, null, 2);
  const nodeStep = step(1, "Install Node.js",
    h("p", null, "The relay runs with Node.js 18 or newer. Check what you have; if the command isn't found, install the LTS version from ",
      h("a", { href: "https://nodejs.org/", target: "_blank", rel: "noopener" }, "nodejs.org", icon("external")), "."),
    codeBlock("Terminal", "node --version"));

  const codeSteps = h("ol", { class: "install-steps" },
    nodeStep,
    step(2, "Add Ma to Claude Code",
      h("p", null, "Run this once. ", h("code", null, "-s user"), " makes it available in every folder, and ", h("code", null, "--widget-origin"), " lets the relay accept tools from this site only."),
      codeBlock("Terminal", codeCmd)),
    step(3, "Start Claude Code",
      h("p", null, "Open a new session, then type ", h("code", null, "/mcp"), ". You should see ", h("strong", null, "webmcp-relay"), " in the list."),
      codeBlock("Terminal", "claude")),
    relayStep(4),
    askStep(5));

  const desktopSteps = h("ol", { class: "install-steps" },
    step(1, "Install Node.js",
      h("p", null, "Same as for Claude Code: Node.js 18 or newer, from ",
        h("a", { href: "https://nodejs.org/", target: "_blank", rel: "noopener" }, "nodejs.org", icon("external")), "."),
      codeBlock("Terminal", "node --version")),
    step(2, "Open Claude Desktop's config file",
      h("p", null, "In Claude Desktop, open ", h("strong", null, "Settings → Developer → Edit Config"), ". That opens ", h("code", null, "claude_desktop_config.json"), "."),
      h("dl", { class: "paths" },
        h("div", null, h("dt", null, "macOS"), h("dd", null, h("code", null, "~/Library/Application Support/Claude/claude_desktop_config.json"))),
        h("div", null, h("dt", null, "Windows"), h("dd", null, h("code", null, "%APPDATA%\\Claude\\claude_desktop_config.json"))))),
    step(3, "Add Ma to the file",
      h("p", null, "Paste this in and save. If the file already has an ", h("code", null, "mcpServers"), " section, add only the ", h("code", null, "webmcp-relay"), " entry inside it."),
      codeBlock("claude_desktop_config.json", desktopJson, { cmd: false })),
    step(4, "Restart Claude Desktop",
      h("p", null, "Quit it completely (not just the window) and open it again, so it starts the relay.")),
    relayStep(5),
    askStep(6));
  desktopSteps.hidden = true;

  // Claude Code／Claude Desktop 切換：同一組步驟，兩個版本
  const note = h("div", { class: "client-note" });
  const notes = {
    code: () => h("p", null, "Tested: this is the setup we use ourselves."),
    desktop: () => h("div", { class: "callout warn" }, h("span", { class: "callout-kind" }, "Untested"),
      h("p", null, "Claude Desktop starts local servers the same way, but we haven't checked Ma with it yet. Claude Code is the tested path.")),
  };
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Which Claude" });
  const pick = (which) => {
    codeSteps.hidden = which !== "code";
    desktopSteps.hidden = which !== "desktop";
    note.replaceChildren(notes[which]());
    for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.which === which));
  };
  for (const [which, label] of [["code", "Claude Code"], ["desktop", "Claude Desktop · untested"]]) {
    const b = h("button", { type: "button", dataset: { which }, "aria-pressed": "false" }, label);
    b.addEventListener("click", () => pick(which));
    seg.append(b);
  }
  pick("code");

  return chapter("Connect Claude", h("div", null,
    h("p", { class: "body-text lead-text" }, "Ma offers 8 read-only tools to an AI assistant through WebMCP. A small relay on your computer hands them to Claude. When Claude uses one, this page moves to the same result, so what Claude found is what you see."),
    h("p", { class: "phone-only body-text" }, "Setting this up needs a computer. On a phone, Ma works as a normal website."),
    h("div", { class: "client-pick" }, seg), note,
    codeSteps, desktopSteps,
    h("h3", { class: "sub-h tools-h" }, "The 8 tools"),
    h("div", { class: "table-wrap stack-sm" }, h("table", { class: "status-table" },
      h("thead", null, h("tr", null, h("th", null, "Tool"), h("th", null, "What it does"))),
      h("tbody", null, TOOLS.map(([n, d]) => h("tr", null, h("td", null, h("code", null, n)), h("td", { dataset: { label: "What it does" } }, d)))))),
    h("h3", { class: "sub-h tools-h" }, "Good to know"),
    h("ul", { class: "plain-list" },
      h("li", null, h("strong", null, "Read-only. "), "The tools look things up and move the page; nothing is submitted, saved or sent anywhere."),
      h("li", null, h("strong", null, "This site only. "), "The relay accepts tools from the address in ", h("code", null, "--widget-origin"), ", not from any other page you have open."),
      h("li", null, h("strong", null, "Not on claude.ai. "), "Claude on the web can't reach a relay on your computer. Use Claude Code or Claude Desktop."),
      h("li", null, h("strong", null, "Needs a computer. "), "The relay runs on a laptop or desktop; on a phone, Ma works as a normal website."))),
    { id: "connect", aside: h("p", { class: "chapter-note" }, "You need a computer with Node.js 18 or newer, and Claude Code or Claude Desktop.") });
}

export function render({ state, params }) {
  const now = new Date();
  const rc = residencyContext(state);
  const { year, elapsed } = rc;
  const tax = state.content.tax;

  // --- 第一題：居住者 ---
  const fromUrl = params.get("days");
  const start = fromUrl !== null && fromUrl !== "" ? Math.max(0, Number(fromUrl) || 0) : elapsed;
  const input = h("input", {
    id: "q-days", class: "q-days-input", type: "number", inputmode: "numeric", min: "0", max: String(rc.total), value: String(start),
  });
  const sizer = h("span", { class: "q-days-input q-sizer", "aria-hidden": "true" });
  const status = h("div", { class: "q-status", "aria-live": "polite" });
  const yearLink = h("a", { class: "q-link" });
  const paint = (days, { sync = true } = {}) => {
    const d = Math.max(0, Math.min(rc.total, Math.floor(Number(days) || 0)));
    const s = statusFor(d, rc);
    // 欄寬跟著數字的實際寬度走（同字型的影子量），單位才會緊貼在數字後面
    sizer.textContent = String(input.value || d);
    if (sizer.offsetWidth) input.style.width = `${sizer.offsetWidth + 6}px`;
    status.replaceChildren(
      h("p", { class: `q-word${s.tone ? ` ${s.tone}` : ""}` }, s.word, factMark("residency_days", state)),
      h("p", { class: "q-note" }, s.text));
    yearLink.href = `#/tax?days=${d}`;
    yearLink.replaceChildren("See your year day by day, and what's due", icon("arrow"));
    if (sync) window.site.navigate("/", { days: d }, { replace: true, render: false });
  };
  input.addEventListener("input", () => paint(input.value));
  paint(start, { sync: false });

  // --- 第二題：這個週末 ---
  const picks = weekendPicks(state.events, now);
  const englishCount = queryEvents(state.events, { start_after: picks.window.start, start_before: picks.window.end, tags: ["lang:en"] }, now.getTime())
    .filter((e) => e.status === "upcoming").length;
  const allHref = picks.label === "This weekend"
    ? `#/search?q=${encodeURIComponent("this weekend")}`
    : `#/events?start_after=${picks.window.start.slice(0, 10)}&start_before=${picks.window.end.slice(0, 10)}&exclude_online=1`;
  const when = picks.label === "This weekend" ? "this weekend" : "in the next 7 days";

  // --- 第三題：連到下面的安裝步驟（hash 路由，所以用 ?s= 再捲過去） ---
  const toConnect = h("a", { class: "q-link big", href: "#/?s=connect" }, "Connect Claude in a few steps", icon("arrow"));
  toConnect.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const q = (n, cls, title, text, act) => h("li", { class: `q${cls ? ` ${cls}` : ""}` },
    h("span", { class: "q-n", "aria-hidden": "true" }, String(n)),
    h("div", { class: "q-main" }, h("h2", { class: "q-title" }, title), h("p", { class: "q-text" }, text)),
    h("div", { class: "q-act" }, act));

  const head = h("header", { class: "wrap intro-head" },
    h("h1", null, "Taiwan tax and Taipei weekends, answered from the official text."),
    h("p", { class: "lede" }, "A free guide for foreign professionals in Taiwan. Every tax figure is pinned to an official sentence, and your Claude can use it all."));

  const questions = h("section", { class: "wrap" }, h("ol", { class: "q-list" },
    q(1, "lead", h("label", { for: "q-days" }, `Am I a tax resident in ${year}?`), "183 days in one tax year decides almost everything. Enter your days so far.",
      h("div", null,
        h("div", { class: "q-days" }, input, h("span", { class: "q-unit" }, `days in ${year}`), sizer),
        status, yearLink)),
    q(2, null, "What's on this weekend?", "Collected every Thursday from seven public sources, in English where possible.",
      h("div", null,
        h("p", { class: "q-fig" }, h("span", { class: "n" }, String(picks.total)), h("span", { class: "u" }, `events ${when} · ${englishCount} English-friendly`)),
        h("a", { class: "q-link", href: allHref }, `See what's on ${when}`, icon("arrow")))),
    q(3, null, "Can Claude do this for me?", "Yes. Connect Claude Code or Claude Desktop, then ask in your own words. It uses the same guides, figures and calculator.",
      toConnect)));

  // --- Ma 是什麼 ---
  const ok = tax.sources.filter((s) => s.status === "ok").length;
  const facts = Object.values(state.facts);
  const verified = facts.filter((f) => f.status === "verified").length;
  const listed = state.events.filter((e) => e.status === "upcoming" || e.status === "ongoing").length;
  const taxGuides = state.guides.filter((g) => g.kind === "tax").length;
  const what = chapter("What Ma is", h("div", null,
    h("div", { class: "figs four" },
      figure({ label: "Official pages", value: String(ok), text: "Saved from the Ministry of Finance, the Taxation Bureau, the gazette and the law database." }),
      figure({ label: "Figures checked", value: `${verified}/${facts.length}`, text: "Each one's official sentence re-read every Thursday." }),
      figure({ label: "Tax guides", value: String(taxGuides), text: "Plus a residency check, a calculator and the tax calendar." }),
      figure({ label: "Events listed", value: String(listed), text: "In Taipei and New Taipei, from seven public sources." })),
    h("ul", { class: "plain-list principles" },
      h("li", null, h("strong", null, "Residency first. "), "For a foreigner the day count decides almost everything, so Ma asks it before any tax number. The Ministry of Finance's own calculator skips that step."),
      h("li", null, h("strong", null, "Show the source. "), "Press any F-number to read the official sentence behind a figure. If an official page changes, the figure is marked “needs review” until a person re-checks it."),
      h("li", null, h("strong", null, "Say what isn't known. "), "“Price not listed” is not “free”. Events keep their original titles instead of a machine translation."),
      h("li", null, h("strong", null, "Not advice. "), "General information for foreign professionals. Confirm with the National Taxation Bureau before you file.")),
    h("a", { class: "chapter-link", href: "#/about" }, "Where everything comes from", icon("arrow"))),
    { aside: h("p", { class: "chapter-note" }, "Numbers from the last weekly crawl.") });

  const after = () => {
    paint(input.value, { sync: false });
    if (params.get("s") === "connect") document.getElementById("connect")?.scrollIntoView({ block: "start" });
  };
  return { title: null, node: h("div", { class: "home" }, head, questions, what, connectSection()), after, keepScroll: params.get("s") === "connect" };
}
