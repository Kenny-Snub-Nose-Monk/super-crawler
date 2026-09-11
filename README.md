# super-crawler

台北活動發現工具。抓取活動資料 → 存成一張表 → 讓 agent 依你的興趣推薦。

不做稅務、居留、行政類內容。

## 三個目標情境

1. 這個月想做點有挑戰的事 → 戶外挑戰型活動
2. 這個月想參加三場英文交流 → 當月、還沒截止的英文語言交流活動
3. 這個週末想 chill → 當週末的音樂／市集／展覽

三個情境是同一個查詢函式換參數（`EventStore.query`）。

## 架構

```
collector（一個來源一支，跑在 GitHub Actions）
    ↓
data/events.jsonl（活動表，commit 進 repo）
    ↓
skill（讀 config/interests.yaml + 查表 → 講人話）
```

collector 是普通 Python 腳本，跟 Claude 無關。skill 那層才是 Claude 專屬。

## 快速上手

```bash
pip install -r requirements.txt

python3 tests/test_pipeline.py            # 離線測試，不需網路
python3 scripts/run_collectors.py --dry-run   # 抓但不寫檔
python3 scripts/run_collectors.py             # 正式跑
python3 scripts/run_collectors.py --probe travel_taipei   # 看原始回應
```

## 目錄

| 路徑 | 作用 |
|---|---|
| `crawler/schema.py` | 活動 schema。唯一真實來源，不要輕易改 |
| `crawler/store.py` | events.jsonl 讀寫、upsert、狀態維護、查詢 |
| `crawler/normalize.py` | 時間／分類／地點／費用的共用解析 |
| `crawler/collectors/` | 一個來源一支 |
| `config/interests.yaml` | **你要親手維護的檔案** |
| `config/sources.yaml` | 來源開關 |
| `data/events.jsonl` | 活動表 |
| `tests/` | 離線測試與錄下的樣本 |

## 目前狀態

| 來源 | 狀態 | 備註 |
|---|---|---|
| 臺北旅遊網 Open API | 已實作，欄位對應已用樣本驗證 | 尚未打過真實 API（見下） |
| 潮臺北 | 未實作 | 需解析 HTML |
| Meetup | 未實作 | GraphQL API，需 OAuth |

**第一次真實抓取要在 GitHub Actions 上跑。** 開發環境的對外網路是白名單制，
台灣的來源全部連不到，只有 github.com 通。詳見 `IMPLEMENTATION.md`。

細節與設計取捨：[IMPLEMENTATION.md](./IMPLEMENTATION.md)
