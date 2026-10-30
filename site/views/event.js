// 活動詳細頁。資料只有來源給的那些 —— 沒有的就照實說「來源沒有提供」，不補、不猜。

import { h, icon } from "../lib/dom.js";
import { queryEvents } from "../query.js";
import {
  formatWhen, formatWhere, formatPrice, placeName, areaName, languages, isOnline,
  typeMeta, sourceLabel, shortDate, isEnglishFriendly, safeUrl, dateParts,
} from "../lib/format.js";
import { topicOfType } from "../lib/topics.js";
import { saveButton, eventCard, tags, notFound, displayTitle } from "./components.js";
import { chapter } from "./report.js";

// 只留字母（含中文）與數字。不能用 \W：JS 的 \W 把中文也當成「非文字」刪掉，
// 中文標題全變成空字串，同一個主辦的所有活動都會被當成「同一系列的其他場次」。
// （Python 的 \W 認得 Unicode，crawler/schema.py 的 dedup_key 沒有這個問題。）
const norm = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** 同一個系列的其他場次：同主辦、同標題、不同時間。CONTEXT.md：時間不合的人需要的是另一個時段 */
export function otherSessions(ev, events) {
  const key = norm(ev.title);
  return events.filter((e) => e.uid !== ev.uid && e.status === "upcoming" && norm(e.title) === key &&
    (e.organizer || "") === (ev.organizer || "")).slice(0, 6);
}

export function similarEvents(ev, events, limit = 4) {
  return queryEvents(events, { types: [ev.type] })
    .filter((e) => e.uid !== ev.uid && e.status === "upcoming" && norm(e.title) !== norm(ev.title))
    .map((e, i) => ({ e, s: (e.district && e.district === ev.district ? 1 : 0) + (isEnglishFriendly(e) ? 0.5 : 0) - i * 0.01 }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.e);
}

function icsFor(ev) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => String(s || "").replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const end = ev.ends_at && ev.ends_at > ev.starts_at ? ev.ends_at : new Date(Date.parse(ev.starts_at) + 2 * 3600000).toISOString();
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ma//Taipei events//EN", "BEGIN:VEVENT",
    `UID:${ev.uid}@ma`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.title)}`, `LOCATION:${esc(formatWhere(ev))}`, `URL:${safeUrl(ev.source_url) || ""}`,
    `DESCRIPTION:${esc((ev.description || "").slice(0, 400))}\\n\\n${esc(safeUrl(ev.source_url) || "")}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function render({ args, state, fromAgent }) {
  const ev = state.events.find((e) => e.uid === args[0]);
  if (!ev) {
    return notFound("Event not found", "This event is no longer listed. It may have ended or been removed by its source.",
      [["#/events", "Browse all events"], ["#/topics", "Explore by topic"], ["#/saved", "Your saved events"]]);
  }
  const when = formatWhen(ev);
  const price = formatPrice(ev);
  const t = typeMeta(ev.type);
  const topic = topicOfType(ev.type);
  const langs = languages(ev);
  const place = placeName(ev);
  const area = areaName(ev);
  const mapQuery = [ev.venue, ev.address].filter(Boolean).join(" ");
  const sourceName = sourceLabel(ev.source_platform);
  const title = displayTitle(ev);

  // 日期就是這一頁的主視覺：大號的日、完整的日期與時間
  const sp = dateParts(ev.starts_at);
  const dateBlock = h("div", { class: "event-date" },
    ev.status === "ongoing" ? h("span", { class: "ed-d on" }, "On now")
      : sp ? h("span", { class: "ed-d" }, sp.day) : h("span", { class: "ed-d" }, "TBC"),
    h("span", { class: "ed-l" },
      h("span", { class: "ed-line" }, ev.status === "ongoing" && when.end ? `Until ${when.end.full}` : when.long),
      ev.status === "expired" ? h("span", { class: "ed-sub" }, "This event has ended")
        : ev.status === "cancelled" ? h("span", { class: "ed-sub" }, "Cancelled by the organiser")
        : ev.signup_deadline ? h("span", { class: "ed-sub" }, `Sign up by ${shortDate(ev.signup_deadline)}`)
        : h("span", { class: "ed-sub" }, "Sign-up deadline not listed")));

  // 每一列：標籤、內容 —— 地點、費用、語言永遠在同一個位置
  const fact = (label, ...value) => h("div", null, h("dt", null, label), h("dd", null, ...value));
  const facts = h("dl", { class: "facts-list" },
    fact("Where",
      isOnline(ev) ? "Online" : place || "Location not listed",
      !isOnline(ev) && ev.address && ev.address !== place ? h("span", { class: "sub" }, ev.address) : null,
      !isOnline(ev) && area ? h("span", { class: "sub" }, area) : null,
      !isOnline(ev) && mapQuery ? h("span", { class: "sub" }, h("a", { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`, target: "_blank", rel: "noopener" }, "Open in Google Maps", icon("external"))) : null),
    fact("Cost", price.text, !price.known ? h("span", { class: "sub" }, "Not stated, which isn't the same as free") : null),
    fact("Language", langs.length ? langs.join(", ") : "Not stated", isEnglishFriendly(ev) ? h("span", { class: "sub" }, "English-friendly") : null),
    ev.organizer ? fact("Organiser", ev.organizer) : null,
    fact("Listed on", sourceName, ev.first_seen ? h("span", { class: "sub" }, `First found ${shortDate(ev.first_seen)}`) : null));

  const about = ev.description ? (() => {
    // 來源的說明常帶著 Markdown 記號（**粗體**、\~、* 清單）：拿掉記號、字照原樣
    const text = ev.description.replace(/\*\*/g, "").replace(/\\([~*_\-#>[\]()!.])/g, "$1").replace(/(^|\s)\*\s+/g, "$1– ").replace(/(^|[\s(])\*(?=\S)/g, "$1").replace(/(\S)\*(?=[\s.,!?;:)]|$)/g, "$1").replace(/\s{2,}/g, " ").trim();
    const p = h("div", { class: "prose clamped" }, h("p", null, text));
    const more = h("button", { type: "button", class: "linkish" }, "Read more");
    more.addEventListener("click", () => { p.classList.remove("clamped"); more.remove(); });
    return h("section", { class: "event-block" }, h("h2", { class: "sub-h" }, "About this event"), p,
      ev.description.length > 380 ? more : null,
      h("p", { class: "muted", style: "font-size:14px" }, `As written by the organiser on ${sourceName}.`));
  })() : h("p", { class: "muted" }, "The listing doesn't include a description.");

  const sessions = otherSessions(ev, state.events);
  const sessionsBox = sessions.length ? h("section", { class: "event-block" },
    h("h2", { class: "sub-h" }, "Other dates in this series"),
    h("ul", { class: "sessions" }, sessions.map((s) => h("li", null, h("a", { href: `#/event/${encodeURIComponent(s.uid)}` }, formatWhen(s).line))))) : null;

  const icsBtn = ev.starts_at ? h("button", { type: "button", class: "btn ghost block", style: "margin-top:10px" }, icon("calendar"), "Add to calendar") : null;
  if (icsBtn) {
    icsBtn.addEventListener("click", () => {
      const blob = new Blob([icsFor(ev)], { type: "text/calendar" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `${ev.uid.replace(/[^\w-]+/g, "-")}.ics` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
  const link = safeUrl(ev.source_url);
  const cta = link
    ? h("a", { class: "btn block", href: link, target: "_blank", rel: "noopener" }, `View on ${sourceName}`, icon("external"))
    : h("p", { class: "muted" }, "The listing didn't include a usable link.");

  const aside = h("aside", null, h("div", { class: "aside-card" },
    h("p", { class: "fig-l" }, "Cost"),
    h("p", { class: "price" }, price.text),
    h("p", { class: "muted" }, price.known ? `As listed on ${sourceName}.` : "The listing doesn't say. Check before you go."),
    cta, icsBtn,
    h("p", { class: "muted", style: "margin:16px 0 0;font-size:13.5px" }, "Booking and payment happen on the organiser's site. Ma never takes a fee.")));

  // 同一場重複刊登（標題前段一樣、同一天）只留一筆，照日期排
  const seen = new Set();
  const similar = similarEvents(ev, state.events, 8)
    .filter((e) => { const k = `${(e.starts_at || "").slice(0, 10)}|${(e.title || "").slice(0, 12)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 4).sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || ""));
  const main = h("div", null,
    fromAgent ? h("p", { class: "agent-banner" }, "Opened by your AI assistant") : null,
    h("p", { class: "crumbs" }, h("a", { href: "#/events" }, "Events"), " / ",
      topic ? h("a", { href: `#/topic/${topic.id}` }, topic.name) : t.en, topic ? ` / ${t.en}` : ""),
    h("div", { class: "event-head" }, h("h1", { class: "event-title" }, title), saveButton("events", ev.uid, title)),
    // 有英文標題時，原文標題放在下面 —— 到了現場、或要問路時，看到的是這一行
    ev.title_en && ev.title_en !== ev.title ? h("p", { class: "event-sub" }, "Listed as ", h("span", { lang: "zh-Hant" }, ev.title)) : null,
    tags(ev),
    dateBlock, facts, about, sessionsBox);

  const node = h("div", null,
    h("div", { class: "wrap event-layout" }, main, aside),
    similar.length ? chapter("Similar events", h("div", { class: "cards" }, similar.map((e) => eventCard(e)))) : null,
    h("div", { class: "sticky-cta" },
      h("div", null, h("div", { class: "fig-l" }, "Cost"), h("div", { class: "price" }, price.text)),
      link ? h("a", { class: "btn", href: link, target: "_blank", rel: "noopener" }, `View on ${sourceName}`) : null));

  return { title, node };
}
