# 為 Meetup 開一個 robots.txt 白名單

**Status**: accepted（2026-09-21）。機制尚未實作。

Meetup 的 robots.txt 用 `Disallow: /*?location=*` 擋掉它的活動搜尋網址。我們為
**Meetup 這一個來源**開一個明確的白名單繞過這條規則，但只在 robots 允許的路徑
接不住使用者的興趣時才走它，而且從這條路進來的活動要打 `via:keyword-search` 標籤。

## 為什麼這值得記下來

因為看程式的人會先看到 `crawler/robots.py` —— 那是一支刻意寫得很嚴謹的模組，
註解裡記著兩次踩坑，還有專屬的 CI 關卡。然後他會在 `sources.yaml` 看到一段
把它關掉的設定，然後想「那前面那些是在幹嘛」。

## 偵查到的事實（2026-09-21 實測）

Meetup 擋的路徑與允許的路徑，用本專案自己的 `parse_robots` 驗證：

```
BLOCK  /find/?location=tw--Taipei&source=EVENTS&keywords=...
BLOCK  /gql*            （需要 OAuth，用不到）
BLOCK  /_next/data/*    （內容與允許頁面相同，用不到）
ALLOW  /find/tw--taipei/<topic>/      ← 30 個，列在 Meetup 自己的 sitemap 裡
ALLOW  /<group>/events/               ← 群組的完整場次行事曆
ALLOW  /<group>/events/<id>/          ← 活動詳情
```

**被擋的那個網址有一個 robots 允許、Meetup 主動在 sitemap 推播、回傳相同資料的
雙胞胎。** 所以白名單能解鎖的東西非常有限：

| 查詢 | 回傳 | allowed 路徑沒有的 | 字面真的相關 |
|---|---|---|---|
| `keywords=language exchange` | 32 | **0** | — |
| `keywords=board games` | 13 | 多數 | 46% |
| `keywords=桌遊` | 12 | 多數 | 25% |
| `keywords=bouldering` | 12 | 多數 | 8% |
| `keywords=攀岩` | 12 | 4 | **0%** |

兩件事決定了這個決策的形狀：

1. **英文查詢的準確率大約是中文的兩倍**（46% vs 25%）。
2. **更強的變因不是語言，是台北到底有沒有這種活動。** Meetup 的搜尋
   **永遠不會回空** —— 沒命中就塞它認為相關的東西給你。`攀岩` 那 12 筆裡
   攀岩活動 0 筆，回的是《頌缽之夜：桃花綻放》《探索之夜-開運》
   《WordPress 桃園小聚》。而且同樣這幾筆會出現在「語言交換」「桌遊」的
   結果裡 —— 它們是墊檔用的填充物。

## 為什麼還是決定做

因為這個工具不會只有一個使用者。30 個 topic 頁是 Meetup 自己的分類，
涵蓋面不窄（`photography` `technology` `book-clubs` `badminton` `writing` 都有），
而且它是從 sitemap 讀的、會自己長。但它終究接不住「桌遊」「陶藝」「手沖」
這類落在分類外的興趣。白名單是那個缺口唯一的補法。

## 考慮過但沒選的

- **完全不做** —— 使用者的興趣落在 30 個 topic 之外時就是沒有資料。
  對單人可以接受，對多使用者不行。
- **全域關掉 robots 檢查** —— 用「我不會過度爬取」當理由。這個理由不成立：
  robots.txt 管的是**範圍**不是**速率**，慢慢抓一條對方說別抓的路徑，
  還是在抓那條路徑。而且它會一併影響其他五個來源，那些來源的 robots
  本來就是允許的，沒有任何好處。
- **偽裝 User-Agent** —— 誠實的 `super-crawler/0.1 (personal use; contact via github)`
  在實測中拿到全部 200，沒有被 Cloudflare 攔。既然不需要，就不要換掉
  被封時唯一能讓我們被通融的東西。

## 後果

- `crawler/robots.py` 的行為不變，白名單在它外面判斷。`tests/test_robots.py`
  現有的斷言全部保持有效，白名單另外加一支回歸測試。
- 白名單只列 `/find/*`。**不要**順手把 `/gql` `/_next/data/*` 加進去 ——
  那兩條用不到，列上去只是擴大破例範圍。
- 填充物是已知且會持續存在的問題，所以這條路徑一定要配兩層防線
  （弱命中降權、跨查詢填充物偵測）。allowed 的 topic 頁不需要這些。
- `via:keyword-search` 標籤是為了讓這個決定**可以用數字檢討**。三個月後
  查一下這個標籤的活動被開啟過幾次、被排除幾次。如果答案是「沒有價值」，
  這個 ADR 就該被一個「撤回白名單」的 ADR 取代。
