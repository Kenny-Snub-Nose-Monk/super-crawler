// 建 DOM 的小工具與圖示。活動標題、描述是從外部來源抓來的文字 —— 一律走 textContent，
// 不拼 innerHTML。只有我們自己產生的 SVG（圖示、lib/motifs.js 的插圖）用 html()。

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === "") continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 只給我們自己產生的 SVG 字串用 */
export function html(tag, attrs, markup) {
  const el = h(tag, attrs);
  el.innerHTML = markup;
  return el;
}

export function frag(...children) {
  return append(document.createDocumentFragment(), children);
}

/** 日期欄。原生日期欄空白時的樣子跟著瀏覽器語系走（中文系統顯示「年/月/日」），
 *  介面就中英夾雜了 —— 所以空的時候是一般文字欄、顯示英文的 YYYY-MM-DD，
 *  一點下去才換成原生日期欄並打開選擇器；離開時如果還是空的就換回來。 */
export function dateInput(attrs = {}) {
  const el = h("input", { ...attrs, type: attrs.value ? "date" : "text", placeholder: "YYYY-MM-DD", autocomplete: "off" });
  el.addEventListener("focus", () => {
    if (el.type === "date") return;
    el.type = "date";
    try { el.showPicker(); } catch { /* 沒有使用者手勢（例如用 Tab 進來）時不能自動打開，照樣可以打字 */ }
  });
  el.addEventListener("blur", () => { if (!el.value) el.type = "text"; });
  return el;
}

// 一套線條圖示（24×24、描邊）。取代原本當裝飾的中文單字 —— 圖示不需要讀，一眼就懂。
const PATHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  bookmark: '<path d="M7 4h10v17l-5-4-5 4z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5L12 4z"/><path d="M12 10v4M12 17h.01"/>',
  scale: '<path d="M12 4v16M7.5 20h9M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  tag: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1 1 0 0 1 0 1.4l-7.8 7.8a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  mountain: '<path d="M2.5 19.5h19l-7-12-4 6.5-2.5-3.5z"/>',
  chat: '<path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9z"/><path d="M9 9h6M9 12h4"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2.1 3 4.4"/>',
  music: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  frame: '<rect x="3.5" y="4.5" width="17" height="15"/><path d="m6.5 16.5 4-4 3 3 2-2 2.5 3"/><circle cx="15.5" cy="9" r="1.5"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  mic: '<rect x="9" y="3" width="6" height="11"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  calculator: '<rect x="5" y="3" width="14" height="18"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9z"/>',
  ticket: '<path d="M3.5 8.5V6a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V16a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5z"/>',
  plane: '<path d="M21 14.5 13.5 12V6.5a1.5 1.5 0 0 0-3 0V12L3 14.5V16l7.5-1.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-3.5L21 16z"/>',
  briefcase: '<rect x="3.5" y="7" width="17" height="12.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  card: '<rect x="3" y="5.5" width="18" height="13"/><path d="M3 10h18M7 15h4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2M11.5 3v2.5M14.5 3.5v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
};

export const icons = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [k, `<svg viewBox="0 0 24 24" aria-hidden="true">${v}</svg>`]));

export function icon(name) {
  return html("span", { class: "i", "aria-hidden": "true" }, icons[name] || icons.info);
}
