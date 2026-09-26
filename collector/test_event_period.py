"""event_period 회귀 테스트: python3 test_event_period.py 또는 pytest (TourAPI 조회를 가짜로 바꾼다)"""
from datetime import datetime, timezone

from event_period import AUTO_CLOSE_MARK, plan_event_updates

TODAY = "2026-09-27"
NOW = datetime(2026, 9, 27, tzinfo=timezone.utc)
URL = "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid="


def _row(i, closed=False, note="TourAPI 4.0 축제/행사", event=None):
    src = {"type": "tourapi", "url": f"{URL}{i}", "note": note}
    if event:
        src["event"] = event
    return {"id": i, "name": f"행사{i}", "is_closed": closed, "source": src}


def _period(start, end):
    return lambda cotid: {"start": start, "end": end, "synced_at": NOW.isoformat()}


def test_open_event_past_end_is_closed_with_reason():
    [p] = plan_event_updates([_row(1)], _period("2025-10-01", "2025-10-12"), TODAY, NOW)
    assert p["action"] == "close" and AUTO_CLOSE_MARK in p["source"]["note"]
    assert p["source"]["event"]["end"] == "2025-10-12"


def test_open_event_still_running_is_kept():
    [p] = plan_event_updates([_row(2)], _period("2026-09-20", "2026-10-05"), TODAY, NOW)
    assert p["action"] is None and p["source"]["event"]["start"] == "2026-09-20"


def test_auto_closed_event_with_next_edition_is_reopened():
    note = f"TourAPI 4.0 축제/행사 | {AUTO_CLOSE_MARK}(2025-10-12) (2025-10-13 자동)"
    [p] = plan_event_updates([_row(3, closed=True, note=note)], _period("2026-10-02", "2026-10-11"), TODAY, NOW)
    assert p["action"] == "reopen" and "reopened: 다음 회차" in p["source"]["note"]


def test_manually_closed_event_is_not_reopened():
    note = "TourAPI 4.0 축제/행사 | merged_into:123"
    [p] = plan_event_updates([_row(4, closed=True, note=note)], _period("2026-10-02", "2026-10-11"), TODAY, NOW)
    assert p["action"] is None


def test_fresh_period_is_not_refetched():
    calls = []
    event = {"start": "2026-10-01", "end": "2026-10-03", "synced_at": NOW.isoformat()}
    plan_event_updates([_row(5, event=event)], lambda c: calls.append(c), TODAY, NOW)
    assert calls == []


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
