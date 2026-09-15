"""robots.txt 檢查。

用機制落實禮貌，而不是靠每次寫 collector 時記得。
base.Collector 會在每次請求前問過這裡。
"""

from __future__ import annotations

import urllib.robotparser
from typing import Optional
from urllib.parse import urlparse


class RobotsGate:
    """每個網域讀一次 robots.txt，之後用快取判斷。

    讀不到 robots.txt 時「放行」—— 這是 RFC 的預設語意（沒有規則 = 沒有限制），
    不是我們偷懶。但會印出來讓你知道。
    """

    def __init__(self, user_agent: str = "*"):
        self.user_agent = user_agent
        self._parsers: dict[str, Optional[urllib.robotparser.RobotFileParser]] = {}
        self._delays: dict[str, Optional[float]] = {}

    def _parser(self, url: str):
        parts = urlparse(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin in self._parsers:
            return self._parsers[origin]
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{origin}/robots.txt")
        try:
            rp.read()
        except Exception as e:  # noqa: BLE001
            print(f"  ! 讀不到 {origin}/robots.txt（{type(e).__name__}），視為未設限")
            rp = None
        self._parsers[origin] = rp
        if rp is not None:
            try:
                self._delays[origin] = rp.crawl_delay(self.user_agent)
            except Exception:  # noqa: BLE001
                self._delays[origin] = None
        return rp

    def allowed(self, url: str) -> bool:
        rp = self._parser(url)
        return True if rp is None else rp.can_fetch(self.user_agent, url)

    def crawl_delay(self, url: str) -> Optional[float]:
        self._parser(url)
        return self._delays.get(f"{urlparse(url).scheme}://{urlparse(url).netloc}")


class RobotsDisallowed(Exception):
    """robots.txt 明確禁止這個路徑。這不是錯誤，是「這條不走」。"""
