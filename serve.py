#!/usr/bin/env python3
"""本機開發伺服器（只用 Python 標準函式庫）。

提供 index.html，並把 /api/<端點> 轉接到新竹市清運網 API，
行為與 worker.js 相同，讓你不必部署 Cloudflare Worker 也能在本機測試。

用法：
    python3 serve.py                 # http://localhost:8000
    python3 serve.py 8080            # 指定連接埠
    python3 serve.py 8000 0.0.0.0    # 開放給同一個 Wi-Fi 的手機連線
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "https://7966.hccg.gov.tw/WEB/_IMP/API/CleanWeb/"
# 端點白名單與瀏覽器快取秒數（與 worker.js 一致）
ENDPOINTS = {
    "getPointData": 10,
    "getCarLocation": 10,
    "getEstData": 10,
    "getTimeTable": 10,
    "getRouteTrack": 43200,
    "getRouteData": 43200,
}
INDEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path in ("/", "/index.html"):
            return self.send_index()
        if parsed.path.startswith("/api/"):
            return self.proxy(parsed.path[len("/api/"):].strip("/"), parsed.query)
        self.send_body(404, b'{"message":"not found"}')

    def send_index(self):
        try:
            with open(INDEX, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_body(500, b'{"message":"index.html missing"}')
        self.send_body(200, body, "text/html; charset=utf-8", "no-cache")

    def proxy(self, endpoint, query):
        if endpoint not in ENDPOINTS:
            return self.send_body(404, b'{"message":"not found"}')
        url = UPSTREAM + endpoint + ("?" + query if query else "")
        req = urllib.request.Request(
            url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0 (hsinchu-garbage-truck dev)"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                status = resp.status
        except urllib.error.HTTPError as e:
            body = e.read()
            status = e.code
        except Exception as e:  # 連線逾時、DNS 失敗等
            body = json.dumps({"message": "upstream unreachable: %s" % e}).encode("utf-8")
            return self.send_body(502, body)
        cache = "public, max-age=%d" % ENDPOINTS[endpoint] if status == 200 else "no-store"
        self.send_body(status, body, "application/json; charset=utf-8", cache)

    def send_body(self, status, body, content_type="application/json; charset=utf-8", cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    server = ThreadingHTTPServer((host, port), Handler)
    shown = "localhost" if host in ("127.0.0.1", "localhost") else host
    print("新竹市垃圾車地圖：http://%s:%d  （Ctrl+C 結束）" % (shown, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
