// 收藏（活動與指南）。只存在這個瀏覽器裡 —— 是個人方便用的書籤，不是資料。
// 無痕模式或封鎖儲存時 localStorage 會丟例外，這時收藏只在這次瀏覽有效。

const KEY = "ma:saved";
let memory = { events: [], guides: [] };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = { events: [], guides: [], ...JSON.parse(raw) };
  } catch { /* 用記憶體裡的 */ }
  return memory;
}

function write(data) {
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 只在這次瀏覽有效 */ }
}

export function isSaved(kind, id) {
  return read()[kind].includes(id);
}

export function toggleSaved(kind, id) {
  const data = read();
  const list = data[kind];
  const i = list.indexOf(id);
  if (i === -1) list.unshift(id); else list.splice(i, 1);
  write(data);
  return i === -1;
}

export function savedIds() {
  return read();
}
