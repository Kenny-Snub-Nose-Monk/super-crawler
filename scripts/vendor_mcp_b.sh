#!/usr/bin/env bash
# 把 MCP-B 的瀏覽器端檔案 vendor 進 site/vendor/。
#
# 為什麼不直接吃 CDN 的 @latest：網站會把工具交給本機的 Claude Code 呼叫，
# 等於信任這段程式的每一次發版。鎖版本、進版控，升版是一次看得到 diff 的 commit。
# 見 docs/adr/0002-webmcp-via-mcp-b-relay.md。
#
# 用法：
#     scripts/vendor_mcp_b.sh            # 用下面鎖定的版本
#     MCP_B_VERSION=5.2.0 scripts/vendor_mcp_b.sh
set -euo pipefail

VERSION="${MCP_B_VERSION:-5.1.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/site/vendor/mcp-b"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# npm pack 會用 registry 上的 integrity（sha512）驗證 tarball
( cd "$TMP" && npm pack --silent "@mcp-b/global@$VERSION" "@mcp-b/webmcp-local-relay@$VERSION" >/dev/null )

mkdir -p "$TMP/global" "$TMP/relay"
tar xzf "$TMP/mcp-b-global-$VERSION.tgz" -C "$TMP/global"
tar xzf "$TMP/mcp-b-webmcp-local-relay-$VERSION.tgz" -C "$TMP/relay"

rm -rf "$DEST"
mkdir -p "$DEST/relay"
cp "$TMP/global/package/dist/index.iife.js" "$DEST/global.iife.js"
cp "$TMP/global/package/LICENSE" "$DEST/LICENSE"
# embed.js 以自己的網址為基準載入 widget.html，三個檔案要放在同一層
cp "$TMP/relay/package/dist/browser/"{embed.js,widget.html,widget.js} "$DEST/relay/"

echo "$VERSION" > "$DEST/VERSION"
echo "已 vendor @mcp-b/global 與 @mcp-b/webmcp-local-relay $VERSION 到 $DEST"
