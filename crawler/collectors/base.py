"""Collector 的共同底座。

一個 collector = 一個來源。分開寫的理由很現實：潮臺北改版的時候，
壞的只有那一支，其他照跑，你那週還是有東西可以看。
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from ..robots import RobotsGate, RobotsDisallowed
from ..schema import Event

USER_AGENT = "super-crawler/0.1 (personal use; contact via github)"


def make_session(*, retries: int = 3, backoff: float = 1.5) -> requests.Session:
    """帶重試的 session。

    這些來源是政府與中小型平台，偶發 502/503 很常見。沒有重試的話，
    你每週的抓取會用一種很煩的頻率隨機失敗一次。
    """
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    retry = Retry(
        total=retries,
        backoff_factor=backoff,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        raise_on_status=False,
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    return s


@dataclass
class CollectorResult:
    name: str
    events: list[Event] = field(default_factory=list)
    ok: bool = True
    error: Optional[str] = None
    pages_fetched: int = 0
    seconds: float = 0.0


class Collector(ABC):
    """所有 collector 的父類別。

    子類別只需要實作 fetch()，其他（錯誤隔離、計時、禮貌延遲）在這裡處理。
    """

    name: str = "unnamed"
    #  對來源禮貌一點。你一週只跑一次，沒必要打快。
    delay_between_pages: float = 1.0
    max_pages: int = 20

    def __init__(self, session: Optional[requests.Session] = None,
                 robots: Optional[RobotsGate] = None, **options: Any):
        self.session = session or make_session()
        # 共用同一個 session：robots.txt 也要用正常的 User-Agent 去抓，
        # 否則會被 Cloudflare 擋掉然後誤判成「對方禁止抓取」。
        self.robots = robots or RobotsGate(session=self.session)
        self.options = options

    @abstractmethod
    def fetch(self) -> Iterator[Event]:
        """抓取並 yield 已經轉成 Event 的資料。"""

    def run(self) -> CollectorResult:
        """包一層錯誤隔離：這支炸掉不影響其他支。"""
        result = CollectorResult(name=self.name)
        t0 = time.monotonic()
        try:
            for ev in self.fetch():
                result.events.append(ev)
        except Exception as e:  # noqa: BLE001 — 這裡就是要吃掉所有例外
            result.ok = False
            result.error = f"{type(e).__name__}: {e}"
        result.seconds = round(time.monotonic() - t0, 1)
        return result

    # --- 給子類別用的小工具 ---

    def _check_robots(self, url: str) -> None:
        """每次請求前問過 robots.txt。

        用機制落實禮貌，而不是靠寫 collector 時記得。被擋下來是明確的
        「這條不走」，會讓這支 collector 標記失敗而不是默默跳過。
        """
        if not self.robots.allowed(url):
            raise RobotsDisallowed(f"robots.txt 禁止抓取: {url}")
        delay = self.robots.crawl_delay(url)
        if delay and delay > self.delay_between_pages:
            self.delay_between_pages = float(delay)

    def get_json(self, url: str, params: Optional[dict] = None,
                 timeout: int = 30) -> Any:
        self._check_robots(url)
        r = self.session.get(url, params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()

    def get_text(self, url: str, params: Optional[dict] = None,
                 timeout: int = 30) -> str:
        self._check_robots(url)
        r = self.session.get(url, params=params, timeout=timeout)
        r.raise_for_status()
        r.encoding = r.encoding or "utf-8"
        return r.text

    @staticmethod
    def unwrap(payload: Any, *candidates: str) -> list[dict]:
        """把回傳包裝拆掉，拿到真正的清單。

        不同來源的外層長得不一樣（有的 {"data": [...]}、有的直接是 list），
        而且他們改版時最愛動這一層。與其寫死，不如試幾個常見的鍵。
        """
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if isinstance(payload, dict):
            for key in candidates or ("data", "results", "items", "list", "Data"):
                v = payload.get(key)
                if isinstance(v, list):
                    return [x for x in v if isinstance(x, dict)]
            # 最後手段：找第一個 list of dict 的值
            for v in payload.values():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    return v
        return []

    def sleep(self) -> None:
        if self.delay_between_pages:
            time.sleep(self.delay_between_pages)
