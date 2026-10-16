// 活動與指南的生成式插圖 ——「光的場景」。
//
// 來源幾乎都沒有圖（有圖的多半是行銷海報），所以每一種類型畫一個有光線的電影畫面：
// 山稜後的日出、舞台光束、窗邊的光影、市集的燈串、展間的投射光、百葉窗透進來的光……
// 全部是高明度、低飽和的柔光，用漸層畫，不用濾鏡（幾十張卡片同時在畫面上也不會卡）。
// 用 uid 當亂數種子：每一場都不一樣、同一場每次都一樣。純字串輸出，不碰 DOM。

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;
let counter = 0;   // 漸層的 id 在整份文件裡共用，每張圖要有自己的前綴

const SKIES = {
  dawn: ["#d7e9ff", "#fff0df"],
  golden: ["#ffe6c2", "#fff8ef"],
  rose: ["#ffe1e7", "#fff6ef"],
  lilac: ["#e9e3ff", "#fff1ea"],
  mint: ["#dcf3e8", "#fffaf2"],
  sea: ["#d6eeff", "#f5fbff"],
  paper: ["#faf4ea", "#ffffff"],
};
const WARM = ["#ffd394", "#ffc07a", "#ffb39a", "#ffd9b0"];
const PINK = ["#ffb7c6", "#ffc9d4", "#ffd0b5"];
const COOL = ["#bcdcff", "#cfe6ff", "#d9d2ff"];

/** 收集 defs 的小工具：每個漸層拿一個唯一 id，最後一起輸出 */
function makeDefs() {
  const p = `L${(++counter).toString(36)}`;
  let n = 0;
  const parts = [];
  return {
    lin(stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
      const id = `${p}${n++}`;
      parts.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("") + "</linearGradient>");
      return `url(#${id})`;
    },
    rad(color, a = 1, { inner = 0 } = {}) {
      const id = `${p}${n++}`;
      parts.push(`<radialGradient id="${id}"><stop offset="${inner}" stop-color="${color}" stop-opacity="${a}"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
      return `url(#${id})`;
    },
    out() { return `<defs>${parts.join("")}</defs>`; },
  };
}

// --- 光的元件 ----------------------------------------------------------

const glow = (d, cx, cy, r, color, a = 0.95) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${d.rad(color, a)}"/>`;

function sun(d, cx, cy, r) {
  // 太陽：一圈大而淡的暖光 + 一圈小而亮的白光
  return glow(d, cx, cy, r * 3.2, "#ffd9a0", 0.85) + glow(d, cx, cy, r * 1.5, "#fff3dc", 0.95) + glow(d, cx, cy, r * 0.7, "#ffffff", 1);
}

function flare(d, cx, cy, w, h, r, streak = 0.55) {
  // 鏡頭光斑：從光源往畫面中心的對角線上，幾顆大小不一的淡圈；再加一道橫向的變形鏡頭光
  let s = `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w * streak)}" ry="${f(h * 0.012 + 1)}" fill="${d.lin([[0, "#ffffff", 0], [0.5, "#ffffff", 0.75], [1, "#ffffff", 0]], { x2: 1, y2: 0 })}"/>`;
  const tx = w / 2 + (w / 2 - cx), ty = h / 2 + (h / 2 - cy);
  for (let i = 1; i <= 4; i++) {
    const t = 0.25 + i * 0.18 + r() * 0.05;
    const x = cx + (tx - cx) * t, y = cy + (ty - cy) * t;
    s += glow(d, x, y, h * (0.03 + r() * 0.07), [WARM[i % 4], COOL[i % 3], PINK[i % 3]][i % 3], 0.35 + r() * 0.2);
  }
  return s;
}

function bokeh(d, r, n, box, palette, [rmin, rmax] = [8, 34]) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = box[0] + r() * box[2], y = box[1] + r() * box[3];
    s += glow(d, x, y, rmin + r() * (rmax - rmin), palette[Math.floor(r() * palette.length)], 0.45 + r() * 0.4);
  }
  return s;
}

function rays(d, ox, oy, w, h, n, r, color = "#ffffff") {
  // 光束：從一點往下打開的三角形，越遠越淡
  const g = d.lin([[0, color, 0.75], [1, color, 0]]);
  let s = "";
  for (let i = 0; i < n; i++) {
    const center = w * (0.15 + (0.7 * (i + 0.5)) / n) + (r() - 0.5) * w * 0.08;
    const spread = w * (0.05 + r() * 0.06);
    s += `<path d="M${f(ox)} ${f(oy)} L${f(center - spread)} ${f(h)} L${f(center + spread)} ${f(h)} Z" fill="${g}" opacity="${f(0.5 + r() * 0.4)}"/>`;
  }
  return s;
}

function ridges(d, w, h, r, colors) {
  // 山稜：三層有霧氣的剪影，越近越深 —— 但都很淡，像逆光裡的山
  let s = "";
  colors.forEach((color, i) => {
    const base = h * (0.58 + i * 0.12), amp = h * (0.16 - i * 0.035), step = w / (6 + i * 3);
    let p = `M0 ${f(base)}`;
    for (let x = 0; x <= w + step; x += step) p += ` L${f(x)} ${f(base - Math.abs(Math.sin(x / w * (2.2 + i) + r() * 2)) * amp * (0.45 + r() * 0.55))}`;
    p += ` L${w} ${h} L0 ${h} Z`;
    s += `<path d="${p}" fill="${d.lin([[0, color, 0.95], [1, "#ffffff", 0.6]])}"/>`;
  });
  return s + `<rect x="0" y="${f(h * 0.62)}" width="${w}" height="${f(h * 0.2)}" fill="${d.lin([[0, "#ffffff", 0], [0.5, "#ffffff", 0.55], [1, "#ffffff", 0]])}"/>`;
}

function windowLight(d, w, h, r) {
  // 窗光：斜斜落在牆上的幾塊亮面
  const g = d.lin([[0, "#ffffff", 0.9], [1, "#fff2dc", 0.5]], { x2: 1, y2: 1 });
  const x0 = w * (0.45 + r() * 0.15), y0 = h * 0.12, cw = w * 0.13, ch = h * 0.3, sk = w * 0.08;
  let s = "";
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 2; cy++) {
      const x = x0 + cx * (cw + w * 0.02) + cy * sk * 0.3, y = y0 + cy * (ch + h * 0.03);
      s += `<path d="M${f(x)} ${f(y)} h${f(cw)} l${f(sk)} ${f(ch)} h${f(-cw)} Z" fill="${g}" opacity=".85"/>`;
    }
  }
  return s;
}

function stringLights(d, w, h, r, y0, sag) {
  let s = `<path d="M0 ${f(y0)} Q${f(w / 2)} ${f(y0 + sag * 2)} ${w} ${f(y0)}" fill="none" stroke="#c9b9a3" stroke-width="1.2" opacity=".55"/>`;
  const n = 12;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = w * t, y = y0 + Math.sin(Math.PI * t) * sag;
    s += glow(d, x, y + 4, h * 0.07, WARM[i % 4], 0.8) + `<circle cx="${f(x)}" cy="${f(y + 4)}" r="2.6" fill="#fffaf0"/>`;
  }
  return s;
}

function blinds(d, w, h, r) {
  // 百葉窗透進來的光：一道道斜的暖光帶
  const g = d.lin([[0, "#ffe2b8", 0], [0.3, "#ffe2b8", 0.85], [1, "#ffffff", 0]], { x2: 1, y2: 0 });
  let s = "";
  for (let i = 0; i < 6; i++) {
    const y = h * (0.12 + i * 0.13);
    s += `<path d="M${f(w * 0.18)} ${f(y)} L${f(w * 1.05)} ${f(y - h * 0.22)} L${f(w * 1.05)} ${f(y - h * 0.16)} L${f(w * 0.18)} ${f(y + h * 0.055)} Z" fill="${g}" opacity="${f(0.55 + r() * 0.3)}"/>`;
  }
  return s;
}

// --- 各類型的場景 ------------------------------------------------------

function scene(kind, w, h, r, d) {
  const sx = w * (0.62 + r() * 0.24), sy = h * (0.18 + r() * 0.16);
  switch (kind) {
    case "outdoor_challenge":
    case "hiking":
      return { sky: "dawn", body: sun(d, sx, h * 0.5, h * 0.09) + ridges(d, w, h, r, ["#d8e1f1", "#c4d1e8", "#b1c1dd"]) + flare(d, sx, h * 0.5, w, h, r) };
    case "sports":
      return { sky: "sea", body: sun(d, sx, sy, h * 0.08) + rays(d, sx, -h * 0.2, w, h, 3, r, "#ffffff") + bokeh(d, r, 6, [0, h * 0.5, w, h * 0.5], COOL) + flare(d, sx, sy, w, h, r) };
    case "language_exchange":
      return { sky: "golden", body: glow(d, w * 0.25, h * 0.2, h * 0.5, "#ffd394", 0.7) + windowLight(d, w, h, r) + bokeh(d, r, 9, [0, h * 0.45, w, h * 0.55], WARM) + `<rect x="0" y="${f(h * 0.8)}" width="${w}" height="${f(h * 0.2)}" fill="${d.lin([[0, "#f3dcc2", 0.5], [1, "#ffffff", 0.2]])}"/>` };
    case "social":
      return { sky: "rose", body: sun(d, sx, sy, h * 0.07) + bokeh(d, r, 16, [0, 0, w, h], [...WARM, ...PINK], [10, 42]) };
    case "music":
      return { sky: "lilac", body: rays(d, w * 0.5, -h * 0.15, w, h, 5, r, "#ffffff") + glow(d, w * 0.5, 0, h * 0.4, "#ffd0e0", 0.8) + bokeh(d, r, 10, [0, h * 0.55, w, h * 0.45], [...PINK, ...COOL]) };
    case "market":
      return { sky: "golden", body: stringLights(d, w, h, r, h * 0.16, h * 0.12) + stringLights(d, w, h, r, h * 0.42, h * 0.08) + bokeh(d, r, 7, [0, h * 0.6, w, h * 0.4], WARM, [14, 40]) };
    case "food":
      return { sky: "golden", body: glow(d, w * 0.5, h * 0.85, h * 0.62, "#ffc27a", 0.85) + glow(d, w * 0.5, h * 0.82, h * 0.16, "#fff6e4", 1) + bokeh(d, r, 8, [0, 0, w, h * 0.6], WARM) };
    case "festival":
      return {
        sky: "rose",
        body: `<path d="M0 ${f(h * 0.1)} Q${f(w / 2)} ${f(h * 0.32)} ${w} ${f(h * 0.08)}" fill="none" stroke="#d8b7a6" stroke-width="1.2" opacity=".6"/>` +
          [0.16, 0.33, 0.5, 0.67, 0.84].map((t, i) => {
            const x = w * t, y = h * 0.1 + Math.sin(Math.PI * t) * h * 0.2 + h * (0.12 + r() * 0.12);
            return glow(d, x, y, h * 0.16, i % 2 ? "#ffb39a" : "#ffd394", 0.85) + `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(h * 0.045)}" ry="${f(h * 0.06)}" fill="#fff4e6" opacity=".9"/>`;
          }).join("") + bokeh(d, r, 6, [0, h * 0.6, w, h * 0.4], PINK),
      };
    case "exhibition": {
      const fx = w * (0.34 + r() * 0.12), fw = w * 0.32, fh = h * 0.46;
      return {
        sky: "paper",
        body: rays(d, fx + fw / 2, -h * 0.1, fx * 2 + fw, h * 0.9, 1, () => 0.5, "#fff1d6") +
          `<ellipse cx="${f(fx + fw / 2)}" cy="${f(h * 0.88)}" rx="${f(fw * 0.8)}" ry="${f(h * 0.05)}" fill="${d.rad("#ffe2b8", 0.9)}"/>` +
          `<rect x="${f(fx)}" y="${f(h * 0.2)}" width="${f(fw)}" height="${f(fh)}" rx="3" fill="${d.lin([[0, "#dfeaff"], [1, "#ffe7d6"]], { x2: 1, y2: 1 })}" stroke="#e7dccd" stroke-width="3"/>` +
          glow(d, fx + fw * 0.62, h * 0.36, fh * 0.28, "#ffffff", 0.9),
      };
    }
    case "talk":
      return {
        sky: "sea",
        body: `<path d="M${f(w * 0.08)} ${f(h * 0.5)} L${f(w * 0.62)} ${f(h * 0.14)} L${f(w * 0.62)} ${f(h * 0.74)} Z" fill="${d.lin([[0, "#ffffff", 0.95], [1, "#ffffff", 0.15]], { x2: 1, y2: 0 })}"/>` +
          `<rect x="${f(w * 0.62)}" y="${f(h * 0.12)}" width="${f(w * 0.3)}" height="${f(h * 0.64)}" rx="6" fill="${d.lin([[0, "#ffffff"], [1, "#e7f0fb"]], { x2: 1, y2: 1 })}" stroke="#d6e3f3" stroke-width="2"/>` +
          glow(d, w * 0.72, h * 0.3, h * 0.2, "#fff3dc", 0.9) +
          glow(d, w * 0.08, h * 0.5, h * 0.12, "#fff3dc", 1) + bokeh(d, r, 8, [w * 0.15, h * 0.2, w * 0.45, h * 0.5], ["#ffffff"], [3, 8]),
      };
    case "tax":
      // 午後的書桌：右上的窗透進暖光，百葉窗的光帶落在桌面上
      return {
        sky: "golden",
        body: glow(d, w * 0.88, h * 0.05, h * 0.95, "#ffc98a", 0.9) + sun(d, w * 0.86, h * 0.12, h * 0.07) + blinds(d, w, h, r) +
          bokeh(d, r, 5, [w * 0.05, h * 0.15, w * 0.5, h * 0.5], [...WARM, ...PINK], [10, 26]) +
          `<rect x="0" y="${f(h * 0.8)}" width="${w}" height="${f(h * 0.2)}" fill="${d.lin([[0, "#f3dcc2", 0.75], [1, "#fff4e8", 0.5]])}"/>`,
      };
    default:
      return { sky: "dawn", body: sun(d, sx, sy, h * 0.09) + flare(d, sx, sy, w, h, r) + bokeh(d, r, 5, [0, h * 0.5, w, h * 0.5], [...WARM, ...COOL]) };
  }
}

/** 回傳一段 SVG 字串。type 不認得時退回預設的晨光。 */
export function motif(type, seed, { w = 400, h = 250, title = "" } = {}) {
  const r = rng(hash(`${type}:${seed}`));
  const d = makeDefs();
  const { sky, body } = scene(type, w, h, r, d);
  const [top, bottom] = SKIES[sky] || SKIES.dawn;
  const bg = d.lin([[0, top], [1, bottom]]);
  const label = title ? `<title>${escapeXml(title)}</title>` : "";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="${title ? "false" : "true"}">${label}` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>${body}${d.out()}</svg>`;
}

/** 首頁主視覺的光：右上的太陽、橫向的鏡頭光、往左下散開的光斑。文字在左邊，左側保持乾淨。 */
export function heroLight(w = 1200, h = 460) {
  const r = rng(20261015);
  const d = makeDefs();
  const sx = w * 0.82, sy = h * 0.2;
  // 橫向光條短一點：不要劃過左邊的標題
  const body = sun(d, sx, sy, h * 0.12) + flare(d, sx, sy, w, h, r, 0.28) +
    bokeh(d, r, 10, [w * 0.55, h * 0.1, w * 0.45, h * 0.9], [...WARM, ...PINK, ...COOL], [14, 60]) +
    ridges(d, w, h * 1.25, r, ["#e6edf8", "#dbe5f4", "#d0dcef"]).replace(/<rect[^>]*\/>$/, "");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}${d.out()}</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);
}
