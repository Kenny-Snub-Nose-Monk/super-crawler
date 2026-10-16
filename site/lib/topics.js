// 瀏覽用的主題。一個主題 = 幾個活動類型 + 幾個子分類。
//
// 活動類型（schema 的 EventType）是給過濾用的固定 enum；主題是給人逛的，
// 把十一個類型收成六個「今晚想做什麼」的入口。子分類用關鍵字與標籤比對，
// 只在網站這一層做，不改共用的查詢語意（site/query.js ↔ crawler/store.py）。

function blob(ev) {
  return [ev.title, ev.title_en, ev.description, ev.venue, ev.organizer, ...(ev.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
}
const anyWord = (...words) => (ev) => { const b = blob(ev); return words.some((w) => b.includes(w)); };
const ofType = (...types) => (ev) => types.includes(ev.type);
const hasTag = (tag) => (ev) => (ev.tags || []).includes(tag);

export const TOPICS = [
  {
    id: "outdoors", icon: "mountain", tint: "leaf", name: "Outdoors & active",
    blurb: "Climbing walls, river trails, free diving and the mountains at the edge of the MRT map.",
    types: ["outdoor_challenge", "sports"],
    subs: [
      { id: "climbing", name: "Climbing", test: anyWord("攀岩", "抱石", "climb", "boulder") },
      { id: "hiking", name: "Hiking", test: anyWord("登山", "健行", "古道", "百岳", "縱走", "hiking", "hike", "trail") },
      { id: "water", name: "Water", test: anyWord("潛水", "獨木舟", "溯溪", "溪降", "衝浪", "sup", "kayak", "dive", "canyon") },
      { id: "fitness", name: "Running & fitness", test: (ev) => ev.type === "sports" || anyWord("路跑", "瑜伽", "run", "yoga")(ev) },
    ],
  },
  {
    id: "social", icon: "chat", tint: "sky", name: "Language & social",
    blurb: "Language exchanges, tea tastings and the easiest ways to meet people outside the office.",
    types: ["language_exchange", "social"],
    subs: [
      { id: "exchange", name: "Language exchange", test: ofType("language_exchange") },
      { id: "english", name: "English-friendly", test: hasTag("lang:en") },
      { id: "japanese", name: "Japanese", test: hasTag("lang:ja") },
      { id: "meetups", name: "Social & networking", test: ofType("social") },
    ],
  },
  {
    id: "music", icon: "music", tint: "rose", name: "Music & nightlife",
    blurb: "Live houses, jazz bars and concert halls — what is playing in the city this week.",
    types: ["music"],
    subs: [
      { id: "live", name: "Live & indie", test: anyWord("live", "樂團", "獨立", "band", "gig") },
      { id: "jazz", name: "Jazz", test: anyWord("jazz", "爵士") },
      { id: "classical", name: "Classical", test: anyWord("音樂會", "演奏", "交響", "室內樂", "鋼琴", "recital", "orchestra", "symphony") },
    ],
  },
  {
    id: "arts", icon: "frame", tint: "violet", name: "Arts & culture",
    blurb: "Exhibitions, museums and festivals — the slow half of a Taipei weekend.",
    types: ["exhibition", "festival"],
    subs: [
      { id: "exhibitions", name: "Exhibitions", test: ofType("exhibition") },
      { id: "festivals", name: "Festivals", test: ofType("festival") },
    ],
  },
  {
    id: "markets", icon: "bag", tint: "sun", name: "Markets & food",
    blurb: "Weekend markets, pour-over coffee and tastings worth crossing the river for.",
    types: ["market", "food"],
    subs: [
      { id: "markets", name: "Markets", test: ofType("market") },
      { id: "food", name: "Food & drink", test: ofType("food") },
      { id: "coffee", name: "Coffee & tea", test: anyWord("咖啡", "手沖", "茶", "coffee", "tea", "chai") },
    ],
  },
  {
    id: "talks", icon: "mic", tint: "sky", name: "Talks & workshops",
    blurb: "Talks, workshops and salons — including the ones held in English.",
    types: ["talk"],
    subs: [
      { id: "english", name: "In English", test: hasTag("lang:en") },
      { id: "workshops", name: "Workshops", test: anyWord("工作坊", "workshop", "手作", "diy", "體驗") },
      { id: "talks", name: "Talks & salons", test: anyWord("講座", "講堂", "沙龍", "論壇", "talk", "seminar", "salon") },
    ],
  },
];

export function topicById(id) {
  return TOPICS.find((t) => t.id === id) || null;
}

export function topicOfType(type) {
  return TOPICS.find((t) => t.types.includes(type)) || null;
}

export function applySub(events, topic, subId) {
  const sub = topic && topic.subs.find((s) => s.id === subId);
  return sub ? events.filter(sub.test) : events;
}

/** 搜尋框裡的主題詞 → 類型與子分類。給 lib/search.js 用。 */
export const TOPIC_WORDS = [
  { words: ["hiking", "hike", "trail", "登山", "健行", "爬山"], topic: "outdoors", sub: "hiking" },
  { words: ["climbing", "bouldering", "攀岩", "抱石"], topic: "outdoors", sub: "climbing" },
  { words: ["diving", "kayak", "潛水", "溯溪", "獨木舟"], topic: "outdoors", sub: "water" },
  { words: ["outdoor", "outdoors", "戶外"], topic: "outdoors" },
  { words: ["running", "yoga", "fitness", "sport", "sports", "運動", "路跑", "瑜伽"], topic: "outdoors", sub: "fitness" },
  { words: ["language exchange", "language", "exchange", "語言交換", "語言交流"], topic: "social", sub: "exchange" },
  { words: ["networking", "social", "meetup", "meet people", "friends", "交朋友", "社交"], topic: "social" },
  { words: ["jazz", "爵士"], topic: "music", sub: "jazz" },
  { words: ["concert", "classical", "音樂會"], topic: "music", sub: "classical" },
  { words: ["music", "live", "gig", "band", "音樂", "演唱"], topic: "music" },
  { words: ["exhibition", "exhibitions", "museum", "gallery", "art", "展覽", "美術館"], topic: "arts", sub: "exhibitions" },
  { words: ["festival", "festivals", "節慶"], topic: "arts", sub: "festivals" },
  { words: ["market", "markets", "flea", "市集"], topic: "markets", sub: "markets" },
  { words: ["coffee", "tea", "咖啡", "手沖"], topic: "markets", sub: "coffee" },
  { words: ["food", "dinner", "wine", "tasting", "brunch", "美食", "品酒"], topic: "markets", sub: "food" },
  { words: ["workshop", "workshops", "工作坊"], topic: "talks", sub: "workshops" },
  { words: ["talk", "talks", "lecture", "seminar", "講座"], topic: "talks", sub: "talks" },
];
