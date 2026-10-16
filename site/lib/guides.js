// 指南的行內語法 → DOM（以及純文字，給搜尋與 WebMCP 用）。
//
//   **粗體**   [文字](網址)   `程式碼`   {{fact:id}}   [[guide:slug|文字]]
//
// {{fact:id}} 不只是換成數字：它帶著「出自哪份官方文件、哪天核對過」，
// 引述對不上快照時（drifted）會換成紅色底線，提醒讀者這個數字待複核。

import { publisherEn, shortDate } from "./format.js";

const TOKEN = /(\*\*[^*]+\*\*|\[\[guide:[a-z0-9-]+(?:\|[^\]]*)?\]\]|\[[^\]]+\]\([^)\s]+\)|\{\{fact:[a-z0-9_]+\}\}|`[^`]+`)/g;

export function factText(fact) {
  return fact ? fact.display : "—";
}

export function factTitle(fact) {
  if (!fact) return "";
  const src = fact.sources && fact.sources[0];
  const by = src ? publisherEn(src.publisher) : "an official source";
  if (fact.status === "verified") {
    return `${fact.label} — checked against ${by}${fact.checked_at ? ` on ${shortDate(fact.checked_at)}` : ""}`;
  }
  if (fact.status === "drifted") return `${fact.label} — the official page has changed since this was checked; verify before relying on it`;
  return `${fact.label} — not automatically checked`;
}

/** 純文字版本：搜尋索引與 WebMCP 回傳用 */
export function plain(text, facts) {
  if (!text) return "";
  return String(text).replace(TOKEN, (tok) => {
    if (tok.startsWith("**")) return plain(tok.slice(2, -2), facts);     // 粗體裡可能包著 {{fact:…}}
    if (tok.startsWith("`")) return tok.slice(1, -1);
    if (tok.startsWith("{{fact:")) return factText(facts[tok.slice(7, -2)]);
    if (tok.startsWith("[[guide:")) {
      const [slug, label] = tok.slice(8, -2).split("|");
      return label || slug;
    }
    const m = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? plain(m[1], facts) : tok;
  }).replace(/\s+/g, " ").trim();
}

/** DOM 版本。ctx: { facts, onFact(fid) } */
export function inline(text, ctx) {
  const out = document.createDocumentFragment();
  if (!text) return out;
  const parts = String(text).split(TOKEN);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      const s = document.createElement("strong");
      s.append(inline(part.slice(2, -2), ctx));
      out.append(s);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      const c = document.createElement("code");
      c.textContent = part.slice(1, -1);
      out.append(c);
    } else if (part.startsWith("{{fact:")) {
      const fid = part.slice(7, -2);
      out.append(factNode(fid, ctx));
    } else if (part.startsWith("[[guide:")) {
      const [slug, label] = part.slice(8, -2).split("|");
      const a = document.createElement("a");
      a.href = `#/guide/${slug}`;
      a.textContent = label || slug;
      out.append(a);
    } else {
      const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m) {
        const a = document.createElement("a");
        a.href = m[2];
        if (/^https?:/.test(m[2])) { a.target = "_blank"; a.rel = "noopener"; }
        a.append(inline(m[1], ctx));
        out.append(a);
      } else {
        out.append(document.createTextNode(part));
      }
    }
  }
  return out;
}

function factNode(fid, ctx) {
  const fact = ctx.facts[fid];
  const s = document.createElement("span");
  s.className = `fact ${fact ? fact.status : "missing"}`;
  s.textContent = factText(fact);
  s.title = factTitle(fact);
  s.dataset.fact = fid;
  if (ctx.onFact) {
    s.tabIndex = 0;
    s.setAttribute("role", "button");
    s.addEventListener("click", () => ctx.onFact(fid, s));
    s.addEventListener("keydown", (e) => { if (e.key === "Enter") ctx.onFact(fid, s); });
  }
  return s;
}

/** 指南整篇轉成純文字（WebMCP 的 get_guide 用）。
 *  calc：把試算範例區塊轉成文字的函式（由呼叫端提供 —— 這支檔案不依賴稅務參數）。 */
export function guideToText(g, facts, { calc } = {}) {
  const lines = [`# ${g.title}`, g.subtitle ? g.subtitle : "", "", plain(g.summary, facts), ""];
  if (g.takeaways) {
    lines.push("Key points:");
    for (const t of g.takeaways) lines.push(`- ${plain(t, facts)}`);
    lines.push("");
  }
  for (const sec of g.sections || []) {
    lines.push(`## ${sec.heading}`);
    for (const b of sec.blocks || []) {
      if (b.p) lines.push(plain(b.p, facts));
      if (b.list) for (const i of b.list) lines.push(`- ${plain(i, facts)}`);
      if (b.steps) b.steps.forEach((st, i) => lines.push(`${i + 1}. ${st.title}: ${plain(st.text || "", facts)}`));
      if (b.callout) lines.push(`[${b.callout.title || b.callout.kind}] ${plain(b.callout.text || "", facts)}`);
      if (b.table) {
        lines.push(b.table.head.map((x) => plain(x, facts)).join(" | "));
        for (const r of b.table.rows) lines.push(r.map((x) => plain(x, facts)).join(" | "));
      }
      if (b.stats) lines.push(b.stats.map((s) => `${plain(s.label, facts)}: ${plain(s.value, facts)}`).join("; "));
      if (b.facts) for (const fid of b.facts) lines.push(`- ${facts[fid]?.label}: ${factText(facts[fid])}`);
      if (b.faq) for (const q of b.faq) lines.push(`Q: ${q.q}\nA: ${plain(q.a, facts)}`);
      if (calc && (b.calc || b.compare)) lines.push(calc(b.calc || { compare: b.compare }));
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
