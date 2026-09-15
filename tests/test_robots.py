"""robots.txt 檢查的回歸測試。

用兩個站 2026-09-15 的真實 robots.txt 內容，離線驗證。

這支存在的理由：第一版把兩個來源全部誤擋，而它們的 robots.txt
其實都允許。安全機制用錯誤的理由 fail closed，比沒有機制更糟。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.robots import RobotsGate

# travel.taipei/robots.txt 全文（真的就這兩行）
TRAVEL_TAIPEI = "user-agent: *\nAllow: /\n"

# accupass.com/robots.txt 全文
ACCUPASS = """User-Agent: *
Allow: /
Disallow: /event/1902180106297052552770
Disallow: /myevents/eventedit/create/*
Disallow: /neweflow/*
Disallow: /order/*
Disallow: /error
Disallow: /eflow/*
Disallow: /ticket/refund/*
Disallow: /myticket/*
Disallow: /user/*
Disallow: /ticket/getticket/*
Disallow: /biz/events/*
Disallow: /biz/account/*
Disallow: /biz/organizer/*

Sitemap: https://www.accupass.com/sitemap.xml
"""


class FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code, self.text, self.encoding = status_code, text, "utf-8"


class FakeSession:
    """假的 session：照網域回傳預先準備好的 robots.txt。"""
    def __init__(self, by_host):
        self.by_host = by_host
        self.calls = []

    def get(self, url, **kw):
        self.calls.append(url)
        for host, resp in self.by_host.items():
            if host in url:
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return FakeResponse(404)


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print("travel.taipei —— 全文只有 Allow: /，不該擋任何東西")
    g = RobotsGate(session=FakeSession({"travel.taipei": FakeResponse(200, TRAVEL_TAIPEI)}))
    check("Open API 路徑允許",
          g.allowed("https://www.travel.taipei/open-api/zh-tw/Events/Activity"))
    check("任意路徑允許", g.allowed("https://www.travel.taipei/anything"))

    print("\naccupass —— Allow: /，但交易與後台路徑禁止")
    g = RobotsGate(session=FakeSession({"accupass.com": FakeResponse(200, ACCUPASS)}))
    for path, want in [
        ("/search?q=語言交換", True),
        ("/event/2601141826081482281011", True),
        ("/sitemap.xml", True),
        ("/order/12345", False),
        ("/myticket/abc", False),
        ("/user/profile", False),
        ("/biz/events/123", False),
        ("/eflow/ticket/9", False),
        ("/event/1902180106297052552770", False),   # 單一被點名的活動
    ]:
        got = g.allowed("https://www.accupass.com" + path)
        check(f"{path[:34]:36} {'允許' if want else '禁止'}", got == want,
              f"got={'允許' if got else '禁止'}")

    print("\n只讀一次 robots.txt（有快取）")
    s = FakeSession({"accupass.com": FakeResponse(200, ACCUPASS)})
    g = RobotsGate(session=s)
    for _ in range(5):
        g.allowed("https://www.accupass.com/search")
    check("5 次查詢只抓 1 次 robots.txt", len(s.calls) == 1, f"{len(s.calls)} 次")

    print("\n各種取不到 robots.txt 的狀況（這就是上次爆掉的地方）")
    cases = [
        ("403（Cloudflare 擋 UA）→ 放行", FakeResponse(403), True),
        ("404（沒有 robots.txt）→ 放行", FakeResponse(404), True),
        ("500（伺服器異常）→ 保守禁止", FakeResponse(500), False),
        ("連線失敗 → 放行", ConnectionError("boom"), True),
    ]
    for label, resp, want in cases:
        g = RobotsGate(session=FakeSession({"example.com": resp}))
        got = g.allowed("https://example.com/x")
        check(label, got == want, f"got={'允許' if got else '禁止'}")

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
