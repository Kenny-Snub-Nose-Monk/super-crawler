"""查詢語意的共用規格（Python 這一側）。

tests/fixtures/query_cases.json 同時被網站的 JS 查詢拿去跑。
兩邊各自實作 query，靠這份案例保證 Claude 透過網站查到的和 skill 查到的一樣。

跑法： python3 tests/test_query_cases.py
"""
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.schema import Event
from crawler.store import EventStore

CASES = Path(__file__).parent / "fixtures" / "query_cases.json"
_DATETIME_PARAMS = ("start_after", "start_before")


def to_kwargs(params: dict) -> dict:
    kw = dict(params)
    for k in _DATETIME_PARAMS:
        if k in kw:
            kw[k] = datetime.fromisoformat(kw[k])
    return kw


def main():
    spec = json.loads(CASES.read_text(encoding="utf-8"))
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    store = EventStore(Path(tempfile.mkdtemp()) / "events.jsonl")
    for d in spec["events"]:
        ev = Event.from_dict(d)
        # fixture 裡手寫的 uid 要跟 schema 算出來的一致，不然 JS 那邊比的是別的東西
        assert ev.uid == d["uid"], f"fixture uid 寫錯: {d['uid']} != {ev.uid}"
        store._events[ev.uid] = ev

    now = datetime.fromisoformat(spec["now"])
    for case in spec["cases"]:
        got = [e.uid for e in store.query(now=now, **to_kwargs(case["params"]))]
        check(case["name"], got == case["expect"], f"got {got}" if got != case["expect"] else "")

    print(f"\n{len(failures)} 個失敗" if failures else "\n全部通過")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
