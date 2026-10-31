"""P-208 (b) 관광지 주차 백필 회귀 테스트: python3 test_parking_backfill.py 또는 pytest (DB와 TourAPI를 가짜로 바꾼다)
분류된 값만 쓰고, 하루 300회에서 멈추고, 그날 사용량이 700 이상이면 돌지 않는다.
P-221: 같은 응답의 usetime·restdate를 business_hours·closed_days에 함께 쓰되 읽을 때 빈 칸만 쓴다.
"""
import json
import os
import tempfile
import urllib.parse

import tour_fee as t
from test_tourapi_parking import EXPECTED, SAMPLES


def _run(intros, used=0, rows=None, apply=True, backup_dir=None):
    """intros: cotid → detailIntro 응답. 호출할 때마다 사용량이 1 오른다. 쓴 PATCH 목록과 GET URL을 돌려준다."""
    rows = rows if rows is not None else [
        {"id": i, "name": f"관광지{i}", "parking_info": {"type": "unknown"}, "business_hours": {}, "closed_days": [], "updated_at": "t",
         "source": {"type": "tourapi", "url": f"https://x/detail?cotid={c}"}} for i, c in enumerate(intros, 1)]
    usage, patches, gets = [used], [], []

    def request(url, headers, method="GET", body=None):
        if method == "GET":
            gets.append(url)
            return rows
        patches.append((url, body))

    def fetch(api_key, cid, ctype="14"):
        assert ctype == "12"
        usage[0] += 1
        return intros[cid]
    orig = (t._request, t.fetch_intro, t.usage_today, t._tour_api_key, t.load_env, t.time.sleep, t.PARKING_STATE)
    t._request, t.fetch_intro, t.usage_today = request, fetch, lambda: usage[0]
    t._tour_api_key, t.load_env, t.time.sleep = lambda: "k", lambda: {"SUPABASE_URL": "http://db"}, lambda s: None
    t.PARKING_STATE = os.path.join(tempfile.mkdtemp(), "state.json")
    try:
        t.run_parking_backfill(apply=apply, log=lambda m: None, backup_dir=backup_dir or tempfile.mkdtemp())
        state = json.load(open(t.PARKING_STATE)) if os.path.exists(t.PARKING_STATE) else None
    finally:
        t._request, t.fetch_intro, t.usage_today, t._tour_api_key, t.load_env, t.time.sleep, t.PARKING_STATE = orig
    return patches, gets, usage[0], state


def test_writes_only_classified_values_under_ledger_condition():
    patches, gets, _, state = _run({"1": {"parking": "가능"}, "2": {"parking": ""}, "3": {"parking": "문의"}, "4": {}})
    assert [b["parking_info"] for _, b in patches] == [{"type": "available", "detail": "가능"}]
    url = patches[0][0]
    # 읽은 뒤 다른 쓰기가 있었으면 덮지 않도록 읽은 updated_at이 그대로일 때만 쓴다
    for cond in ("id=eq.1", "is_closed=eq.false", "source-%3E%3Etype=eq.tourapi", "updated_at=eq.t"):
        assert cond in url, cond
    assert "%EA%B4%80%EA%B4%91%EC%A7%80" in gets[0]  # 관광지만 읽는다
    # 값이 없던 행도 지나간 것으로 남겨 다음 날 다시 부르지 않는다
    assert state == {"last_id": 4}


def test_stops_at_daily_cap():
    patches, _, usage, state = _run({str(i): {"parking": "무료"} for i in range(1, 401)}, used=100)
    assert usage == 400 and len(patches) == 300 and state == {"last_id": 300}


def test_skips_when_today_usage_is_700_or_more():
    patches, gets, usage, state = _run({"1": {"parking": "가능"}}, used=700)
    assert (patches, gets, usage, state) == ([], [], 700, None)


def test_runs_once_a_day_and_backs_up_before_writing():
    d = tempfile.mkdtemp()
    _run({"1": {"parking": "가능"}}, backup_dir=d)
    [name] = os.listdir(d)
    assert name.startswith("p208b_")
    assert json.load(open(os.path.join(d, name))) == [{"id": 1, "name": "관광지1", "parking_info": {"type": "unknown"},
                                                         "business_hours": {}, "closed_days": [], "updated_at": "t"}]
    patches, gets, _, _ = _run({"1": {"parking": "가능"}}, backup_dir=d)
    assert (patches, gets) == ([], [])


def test_dry_run_writes_nothing():
    d = tempfile.mkdtemp()
    patches, _, _, state = _run({"1": {"parking": "가능"}}, apply=False, backup_dir=d)
    assert (patches, state, os.listdir(d)) == ([], None, [])


def test_samples_fill_parking_hours_and_closed_days_together():
    patches, gets, usage, _ = _run(SAMPLES)
    assert usage == 4  # 추가 호출 없이 같은 응답에서 세 칸을 읽는다
    ids = {str(i): c for i, c in enumerate(SAMPLES, 1)}
    got = {ids[urllib.parse.parse_qs(urllib.parse.urlsplit(u).query)["id"][0][3:]]: {k: v for k, v in b.items() if k != "updated_at"}
           for u, b in patches}
    assert got == EXPECTED, got


def test_widened_condition_reads_rows_with_parking_but_no_hours():
    _, gets, _, _ = _run({"1": {"parking": "가능"}})
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(gets[0]).query)
    assert q["or"] == ["(parking_info->>type.eq.unknown,business_hours.eq.{})"], q
    assert "parking_info->>type" not in q
    assert set(q["select"][0].split(",")) >= {"business_hours", "closed_days"}


def test_filled_fields_are_not_overwritten():
    rows = [
        # 주차는 채워졌고 영업시간이 빈 행: 영업시간과 휴무만 쓴다
        {"id": 1, "name": "양화진", "parking_info": {"type": "free", "detail": "무료"}, "business_hours": {}, "closed_days": [],
         "updated_at": "t1", "source": {"type": "tourapi", "url": "https://x/detail?cotid=126938"}},
        # 휴무가 이미 있는 행: 주차와 영업시간만 쓴다
        {"id": 2, "name": "양화진2", "parking_info": {"type": "unknown"}, "business_hours": {}, "closed_days": ["월요일"],
         "updated_at": "t2", "source": {"type": "tourapi", "url": "https://x/detail?cotid=126938"}},
        # 세 칸이 모두 있는 행: 쓰지 않는다
        {"id": 3, "name": "대금산", "parking_info": {"type": "paid", "detail": "유료"}, "business_hours": {"이용시간": "09:00~18:00"},
         "closed_days": ["화요일"], "updated_at": "t3", "source": {"type": "tourapi", "url": "https://x/detail?cotid=125467"}},
    ]
    patches, _, _, _ = _run(SAMPLES, rows=rows)
    yang = EXPECTED["126938"]
    assert [(u.split("updated_at=eq.")[1], {k: v for k, v in b.items() if k != "updated_at"}) for u, b in patches] == [
        ("t1", {"business_hours": yang["business_hours"], "closed_days": yang["closed_days"]}),
        ("t2", {"parking_info": yang["parking_info"], "business_hours": yang["business_hours"]}),
    ]


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
