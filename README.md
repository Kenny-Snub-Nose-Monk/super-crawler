# super-crawler

雙北活動 + 在台外籍專業人士的稅務指南。抓取活動與官方稅務原文 → 存成表與快照 →
一個靜態網站（**Ma**）讓人逛、讓 AI 助理透過 WebMCP 查。

對象是來台灣工作的高收入外國人，所以網站介面全英文；設計是亮色、帶電影感光線的日式乾淨風格，
資訊一眼看得懂（Inter / Noto Sans TC，詳見 IMPLEMENTATION.md 第 14 節）。
個人推薦那條線（`config/interests.yaml` + skill）照舊排除報稅、居留這類活動；
稅務是網站上另外一塊，給讀者看的指南與試算，不是推薦的活動。

## 三個目標情境（活動）

1. 這個月想做點有挑戰的事 → 戶外挑戰型活動
2. 這個月想參加三場英文交流 → 當月、還沒截止的英文語言交流活動
3. 這個週末想 chill → 當週末的音樂／市集／展覽

三個情境是同一個查詢函式換參數（`EventStore.query`，網站上是同語意的 `site/query.js`）。

## 稅務（2026-10 新增）

外國人的稅幾乎全由一個數字決定：一個課稅年度在台灣待幾天。網站把這件事放在最前面：

- **指南**：照收到的整理文件建議的架構 —— 1 篇總覽 + 5 篇深度（183 天、稅率、申報步驟、雇主扣繳、
  就業金卡與特定專業人才優惠／股權／海外所得）。
- **試算**：先由天數（或一段段的入出境日期）判斷居住者身分，再算稅。財政部的官方試算不做這一步。
- **行事曆**：查調、申報、三批退稅、年度金額公告，依今天的日期標出下一件事。

每一個稅務數字都寫在 `content/tax/facts.yaml`，附上官方原文快照裡的那一句話；爬蟲每週重抓、
核對引述，對不上的數字在網站上標「待複核」。為什麼這樣做：[ADR 0003](./docs/adr/0003-tax-facts-pinned-to-snapshots.md)。

## 架構

```
活動 collector（一個來源一支）      稅務來源（config/tax_sources.yaml）
        ↓                                   ↓
data/events.jsonl                   data/tax/snapshots/*.md + sources.json
        ↓                                   ↓   ← content/tax/facts.yaml 的引述每週核對
        └──────── scripts/export_site_data.py ────────┘
                              ↓
          site/data/events.json + content.json（不進版控，部署時匯出）
                              ↓
          site/（靜態單頁網站）── WebMCP ──→ 本機 relay ──→ Claude Code
```

兩條抓取線都跑在 GitHub Actions（每週四晚上），結果 commit 回 repo：活動表與稅務原文快照
都用 git diff 就看得到「這週變了什麼」。

## 快速上手

```bash
pip install -r requirements.txt
git config pull.rebase true        # Actions 每週會 commit 資料回 main

python3 scripts/run_collectors.py --dry-run        # 活動：抓但不寫檔
python3 scripts/collect_tax_sources.py             # 稅務：抓官方原文快照 + 核對 facts
python3 scripts/collect_tax_sources.py --check     # 只核對，不抓
python3 scripts/collect_tax_sources.py --prune     # 刪掉上一輪標成 stale（不再被連到）的頁
python3 scripts/export_site_data.py                # 匯出網站資料（引用壞掉會失敗）
python3 scripts/serve_site.py                      # http://127.0.0.1:8765（不快取，改完重整就看得到）
```

測試（全部離線，用 `tests/fixtures/` 裡錄下的樣本）：

```bash
for t in tests/test_*.py; do python3 "$t" || break; done
python3 scripts/export_site_data.py && for t in tests/test_*.mjs; do node "$t" || break; done
```

### 讓 Claude 查這個網站（WebMCP）

```bash
npx @mcp-b/webmcp-local-relay@5.1.0 --widget-origin http://localhost:8765
```

這行已經寫在專案的 `.mcp.json`：在這個資料夾開 Claude Code，第一次會問要不要啟用 `webmcp-relay`，同意即可。
先開 Claude Code 對話、再打開
`http://localhost:8765/?relay=1`（或按頁首的 **Connect Claude**），8 個工具就會出現在 Claude 的工具清單：

| 工具 | 做什麼 |
|---|---|
| `search_events` / `get_event` | 查活動（日期、類型、關鍵字、免費、英文友善、城市）、看單一活動與同系列的其他場次 |
| `search_guides` / `get_guide` | 搜尋、閱讀指南；附該節實際引用的官方出處 |
| `check_tax_residency` | 天數或入出境日期 → 居住者與否（始日不計末日計） |
| `estimate_tax` | 試算；每一行都帶 fact id、核對狀態與官方網址 |
| `get_tax_calendar` | 稅務時程，標出已過與下一件 |
| `get_tax_facts` | 稅務數字本身，附原文引述 |

工具會把網頁切到同一個結果 —— Claude 查到的就是你看到的。取捨見 [ADR 0002](./docs/adr/0002-webmcp-via-mcp-b-relay.md)。

## 目錄

| 路徑 | 作用 |
|---|---|
| `crawler/schema.py` | 活動 schema。唯一真實來源，不要輕易改 |
| `crawler/store.py` | events.jsonl 讀寫、upsert、狀態維護、查詢 |
| `crawler/normalize.py` | 時間／分類／地點／費用／語言的共用解析 |
| `crawler/collectors/` | 活動來源，一個來源一支 |
| `crawler/tax/` | 稅務來源：抽取（`extract.py`）、抓取與快照（`collect.py`）、facts 核對（`facts.py`） |
| `config/interests.yaml` | **你要親手維護的檔案**（個人推薦用） |
| `config/tax_sources.yaml` | 稅務來源清單（官方頁面、要不要跟連結、內容容器） |
| `content/tax/facts.yaml` | **稅務數字的唯一出處**，每筆附原文引述 |
| `content/tax/params.yaml` / `calendar.yaml` | 試算參數（只指向 facts）、稅務行事曆 |
| `content/guides/*.yaml` | 指南內文（行內 `{{fact:id}}` 引用稅務數字） |
| `data/events.jsonl` | 活動表 |
| `data/tax/` | 稅務原文快照與來源索引 |
| `site/` | 網站。`lib/` 是不碰 DOM 的邏輯（可用 node 測），`views/` 是各頁 |
| `tests/` | 離線測試與錄下的樣本 |
| `CONTEXT.md` | 領域語彙。詞不確定的時候先查這裡 |
| `docs/adr/` | 決策紀錄。「為什麼當初這樣做」查這裡 |

## 目前狀態

| 來源 | 狀態 | 取得層級 | 備註 |
|---|---|---|---|
| 臺北旅遊網 Open API | 上線 | API | address/ticket 實際全空 |
| Accupass | 上線 | **第 1 層 JSON-LD** | 最大宗 |
| Taiwan Pathfinder | 上線 | 第 2 層 公開 CSV | 戶外挑戰；有價格與報名狀態 |
| 嚷嚷社 anncr.co | 上線 | **第 1 層 ItemList** | 全台，靠場地表過濾雙北 |
| 潮臺北 | 上線 | 第 2 層 內部 API | 季節性，平常沒東西 |
| Meetup | 上線 | **第 1 層 JSON-LD** | 不需要官方 API，見 [ADR 0001](./docs/adr/0001-meetup-robots-whitelist.md) |
| Talent Taiwan（活動） | 2026-10 新增 | 第 2 層 內部 API | 國發會給外籍專業人士的活動，含報稅季前的稅務說明會（標 `topic:tax`） |
| 稅務官方頁面 | 2026-10 新增 | HTML 容器 / 內部 API | 230 多頁快照；財政部、國稅局（中英）、公報、法規資料庫、勞動部、Talent Taiwan |

細節與設計取捨：[IMPLEMENTATION.md](./IMPLEMENTATION.md)
