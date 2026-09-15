"""robots.txt 檢查。

用機制落實禮貌，而不是靠每次寫 collector 時記得。
base.Collector 會在每次請求前問過這裡。

--- 2026-09-15 的教訓 ---

第一版直接用 urllib.robotparser 的 RobotFileParser.read()，結果兩個來源
全部被誤擋。原因是三層疊起來的：

  1. read() 內部用 urllib.request，User-Agent 是 "Python-urllib/3.x"
  2. 這兩個站都在 Cloudflare 後面，那個 UA 直接被 403
  3. read() 遇到 401/403 會把 self.disallow_all 設成 True —— 而且是
     內部處理，不丟例外。所以「讀不到就放行」那段程式碼從來沒執行到

實際上 travel.taipei 的 robots.txt 全文只有 "user-agent: *" 和 "Allow: /"。
安全機制用錯誤的理由 fail closed，比沒有機制更糟：它會讓你以為對方拒絕了你。

所以現在自己用 requests（帶正常 UA）抓 robots.txt。

--- 第二個教訓（同一天，測試抓到的）---

改用 RobotFileParser.parse() 之後，換成「全部放行」—— 所有 Disallow 都失效。
原因是語意版本不同：

  Python 的 robotparser：**第一條命中的規則就算數**（1994 年的舊慣例）
  RFC 9309 / 現代實作：  **最長匹配的規則優先**

Accupass 的 robots.txt 是照現代語意寫的：先 `Allow: /`，後面才列具體的
`Disallow: /order/*`。用舊語意讀，`Allow: /` 第一條就命中所有路徑，
後面的 Disallow 永遠讀不到。

所以規則比對也自己實作。六十行，但這是唯一能給出正確答案的方式。
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote, urlparse

import requests


def _pattern_to_regex(pattern: str) -> re.Pattern:
    """把 robots.txt 的路徑樣式轉成正規表達式。

    只有兩個特殊字元：`*` 比對任意字串，結尾的 `$` 表示必須到此為止。
    其餘一律當字面值。
    """
    anchored_end = pattern.endswith("$")
    if anchored_end:
        pattern = pattern[:-1]
    body = "".join(".*" if ch == "*" else re.escape(ch) for ch in pattern)
    return re.compile("^" + body + ("$" if anchored_end else ""))


class _Rules:
    """某個 user-agent 群組的規則集，依 RFC 9309 §2.2.2 最長匹配優先。"""

    def __init__(self) -> None:
        self.rules: list[tuple[int, bool, re.Pattern]] = []   # (樣式長度, 允許?, regex)
        self.crawl_delay: Optional[float] = None

    def add(self, allow: bool, pattern: str) -> None:
        if not pattern:
            # 空的 Disallow 代表「什麼都不禁」，直接忽略這條
            return
        self.rules.append((len(pattern), allow, _pattern_to_regex(pattern)))

    def allowed(self, path: str) -> bool:
        best_len, best_allow = -1, True
        for length, allow, rx in self.rules:
            if rx.match(path):
                # 同長度時 Allow 優先（RFC 9309 §2.2.2）
                if length > best_len or (length == best_len and allow):
                    best_len, best_allow = length, allow
        return best_allow


def parse_robots(text: str, user_agent: str = "*") -> _Rules:
    """解析 robots.txt，回傳適用於 user_agent 的規則集。

    取 user-agent 精確命中的群組；沒有就退回 `*` 群組；都沒有就是空規則（全放行）。
    """
    groups: dict[str, _Rules] = {}
    current: list[str] = []
    expecting_agents = True

    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        field, _, value = line.partition(":")
        field = field.strip().lower()
        value = unquote(value.strip())

        if field == "user-agent":
            if not expecting_agents:      # 規則之後又出現 UA → 新群組開始
                current = []
                expecting_agents = True
            current.append(value.lower())
            groups.setdefault(value.lower(), _Rules())
        elif field in ("allow", "disallow") and current:
            expecting_agents = False
            for agent in current:
                groups[agent].add(field == "allow", value)
        elif field == "crawl-delay" and current:
            expecting_agents = False
            for agent in current:
                try:
                    groups[agent].crawl_delay = float(value)
                except ValueError:
                    pass

    ua = user_agent.lower()
    return groups.get(ua) or groups.get("*") or _Rules()


class RobotsDisallowed(Exception):
    """robots.txt 明確禁止這個路徑。這不是錯誤，是「這條不走」。"""


class RobotsGate:
    """每個網域讀一次 robots.txt，之後用快取判斷。

    狀態碼的處理依 RFC 9309：
      200      照裡面的規則判斷
      4xx      沒有規則可用 → 放行（§2.3.1.3 明確把 403 歸在這類）
      5xx      對方伺服器異常 → 保守起見視為全部禁止（§2.3.1.4）
      連不上   放行，但印出警告 —— 無法分辨是對方掛了還是我們被擋
    """

    def __init__(self, session: Optional[requests.Session] = None,
                 user_agent: str = "*", timeout: int = 15):
        self.session = session
        self.user_agent = user_agent
        self.timeout = timeout
        self._rules: dict[str, Optional[_Rules]] = {}

    @staticmethod
    def _origin(url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"

    _DENY_ALL = None   # 佔位，見 _load

    def _load(self, url: str) -> Optional[_Rules]:
        origin = self._origin(url)
        if origin in self._rules:
            return self._rules[origin]

        robots_url = f"{origin}/robots.txt"
        rules: Optional[_Rules]
        try:
            # 用我們自己的 session：正常 User-Agent、有重試、走同一個 proxy 設定。
            get = self.session.get if self.session is not None else requests.get
            r = get(robots_url, timeout=self.timeout)
            if r.status_code == 200:
                r.encoding = r.encoding or "utf-8"
                rules = parse_robots(r.text, self.user_agent)
            elif 400 <= r.status_code < 500:
                print(f"  robots.txt {origin} 回 {r.status_code}（無規則可用），放行")
                rules = None
            else:
                print(f"  robots.txt {origin} 回 {r.status_code}（伺服器異常），"
                      f"保守起見視為禁止")
                rules = _Rules()
                rules.add(False, "/")
        except Exception as e:  # noqa: BLE001
            print(f"  ! 抓不到 {robots_url}（{type(e).__name__}: {e}），放行")
            rules = None

        self._rules[origin] = rules
        return rules

    def allowed(self, url: str) -> bool:
        rules = self._load(url)
        if rules is None:
            return True
        p = urlparse(url)
        path = p.path or "/"
        if p.query:
            path += "?" + p.query
        return rules.allowed(path)

    def crawl_delay(self, url: str) -> Optional[float]:
        rules = self._load(url)
        return rules.crawl_delay if rules else None
