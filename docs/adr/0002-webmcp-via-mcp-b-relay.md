# 網站的 agent 介面走 WebMCP + MCP-B relay，不走遠端 HTTP MCP

**Status**: accepted（2026-09-29）。尚未實作。

活動網站是 GitHub Pages 上的純靜態頁。讓 Claude 查詢它的方式，是頁面自己用
`document.modelContext` 註冊 `search_events` / `get_event` 兩個唯讀工具，
再由本機的 `@mcp-b/webmcp-local-relay` 把分頁裡的工具轉成 stdio MCP 給 Claude Code。
選這條路是因為它不需要任何後端，而且 Claude 查到的結果與網頁畫面是同一份 ——
Claude 呼叫工具時，頁面的過濾列會跟著變。

## 為什麼這值得記下來

看程式的人會看到一個靜態網站裡夾著兩個第三方 vendor 檔案，README 還要求
先在本機跑一個 relay。直覺會問「為什麼不直接開一個 `/mcp` endpoint」。

## 查到的事實（2026-09-29）

- WebMCP 是 W3C CG 草案，只有 Chrome 有，要 flag 或 origin trial（到 2026-11 中旬）。
  API 已從 `navigator.modelContext` 改成 `document.modelContext`。
- **沒有任何 Claude 客戶端原生發現頁面上的 WebMCP 工具。** Claude in Chrome 的相關
  issue 被以 not planned 關閉。目前唯一可用的橋是第三方的 MCP-B。
- claude.ai 的自訂 connector 從 Anthropic 伺服器發出呼叫，需要公開 HTTPS；
  Claude Code 則可以接本機。

## 考慮過但沒選的

- **遠端 HTTP MCP**（例如 Cloudflare Worker）—— 能給 claude.ai 用，但要多部署與維護
  一個 server，而且 Claude 看到的不是「網站」，只是另一個 API。之後需要時可以加，
  兩者可以共用同一份查詢邏輯。
- **自寫 CDP relay** —— 零第三方依賴，但示範的重點不是造 relay，
  而且只能在開了 flag 的 Chrome 上跑（沒有 polyfill）。

## 後果

- `@mcp-b/global` 與 relay 的 `embed.js` **鎖 5.1.0、vendor 進 repo**，不從 CDN 吃 latest。
  升版是一次有意識的 commit。
- relay 預設 `allowedOrigins: ["*"]`，任何網頁都能往你的 Claude Code 註冊工具。
  **啟動時一定要帶 `--widget-origin <GitHub Pages 網域>`**，README 的指令已經寫好。
- 查詢語意在 Python（`EventStore.query`）與 JS 各有一份實作。兩邊跑同一份
  「查詢 → 預期結果」測試案例，不一致會在 CI 被抓到。
- 分頁必須開著工具才存在；頁面重新整理時工具會短暫消失。這是示範可接受的限制，
  不是可以給別人日常依賴的服務。
- 如果 Claude 客戶端之後原生支援 WebMCP，relay 可以直接拿掉，頁面端的工具註冊不用改。
  這時這份 ADR 應被更新。
