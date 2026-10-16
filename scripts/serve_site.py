#!/usr/bin/env python3
"""本機預覽網站用的靜態伺服器：跟 python -m http.server 一樣，只多送 Cache-Control: no-store。

http.server 不送快取標頭，瀏覽器會自己猜一個快取時間 —— 改了 site/*.js 或重新匯出
data/*.json 之後，畫面常常還是舊的。開發時寧可每次都重抓。

用法：
    python scripts/serve_site.py            # http://127.0.0.1:8765
    python scripts/serve_site.py --port 9000
"""

from __future__ import annotations

import argparse
import errno
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--bind", default="127.0.0.1")
    args = ap.parse_args()
    handler = functools.partial(NoCacheHandler, directory=str(SITE))
    try:
        httpd = ThreadingHTTPServer((args.bind, args.port), handler)
    except OSError as e:
        if e.errno != errno.EADDRINUSE:
            raise
        # 多半是之前開的那一個還在跑 —— 網站其實是好的，不用再開一次
        print(f"埠 {args.port} 已經有程式在用：網站可能已經在跑了，直接打開 http://localhost:{args.port}/ 看看。\n"
              f"要重開的話，先到原本那個終端機按 Ctrl+C，或用 lsof -tiTCP:{args.port} 找出 PID 再結束它。\n"
              f"（換埠用 --port；但 WebMCP relay 只接受 http://localhost:8765。）")
        raise SystemExit(1)
    with httpd:
        print(f"Serving {SITE} at http://{args.bind}:{args.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
