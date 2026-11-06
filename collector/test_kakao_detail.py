"""P-226 카카오 장소 패널 영업시간 백필(13단계) 회귀 테스트: python3 test_kakao_detail.py 또는 pytest
DB와 패널 호출을 가짜로 바꾼다. 패널 응답은 2026-11-01 표본(scratchpad ds98/panel)을 줄인 것이다.
"""
import json
import os
import tempfile

import kakao_detail as k

ADDR = {"road": "서울 마포구 연희로11가길 47 지하1층"}


def _week(times):
    """요일 → 시각(None이면 휴무). 표본처럼 일요일부터 이번 주 7일을 준다."""
    days = [{"day_of_the_week_desc": f"{d}(11/{i})", **({"on_days": {"start_end_time_desc": t}} if t else {"off_days_desc": "휴무일"})}
            for i, (d, t) in enumerate(times.items(), 1)]
    return {"week_periods": [{"days": days}]}


# 120215718 슬로보트아뜰리에: all의 기본 영업시간이 있다
P_ALL = {"summary": {"status": "Y", "address": ADDR}, "open_hours": {
    "week_from_today": _week({d: "10:00 ~ 18:00" for d in "일월화수목금토"}),
    "all": {"periods": [{"period_title": "기본 영업시간", "days": [{"day_of_the_week": "매일", "on_days": {"start_end_time_desc": "10:00 ~ 18:00"}}]},
                        {"period_title": "공휴일", "days": [{"on_days": {"start_end_time_desc": "10:00 ~ 19:00"}}]}]}}}
# 617798224 경모네젓갈백반: 이번 주 7일만 있고 이번 주 화요일만 쉰다(매주 문구 없음)
P_WEEK = {"summary": {"status": "Y", "address": ADDR}, "open_hours": {"all": None, "headline_addition": None, "week_from_today": _week(
    {"일": "10:00 ~ 18:30", "월": "10:00 ~ 20:30", "화": None, "수": "10:00 ~ 20:30", "목": "10:00 ~ 20:30", "금": "10:00 ~ 20:30", "토": "10:00 ~ 20:30"})}}
# 2129002802 마세: 매주 월요일, 일요일 휴무
P_OFF = {"summary": {"status": "Y", "address": ADDR}, "open_hours": {"all": None, "headline_addition": {"current_off_day_desc": "매주 월요일, 일요일 휴무"},
                                                                    "week_from_today": _week({"일": None, "월": None, "화": "18:00 ~ 23:30", "수": "18:00 ~ 23:30",
                                                                                              "목": "18:00 ~ 23:30", "금": "18:00 ~ 23:30", "토": "17:00 ~ 23:30"})}}
# 1933750946 죽변해안스카이레일: 임시 휴업
P_TEMP = {"summary": {"status": "Y", "address": ADDR}, "open_hours": {
    "all": None, "headline_addition": {"business_hours_desc": "임시 휴업 (방문 전 업체에 확인해주세요) "},
    "week_from_today": _week({d: "10:00 ~ 18:00" for d in "일월화수목금토"})}}
NOT_FOUND = k.PanelFailed("HTTP Error 404: Not Found")  # 2106617028


def _id(url):
    return url.split("?", 1)[1].split("&")[0]


def _row(i, **kw):
    return {"id": i, "name": f"장소{i}", "address": "서울 마포구 연희로11가길 47", "business_hours": {}, "closed_days": [],
            "provider_ids": {"kakao": str(i)}, "updated_at": "t", **kw}


def _run(panels, rows=None, apply=True, backup_dir=None, limit=None, state=None):
    """panels: 카카오 번호 → 패널 응답(예외면 실패). 쓴 PATCH 목록, 호출한 번호, 저장된 커서를 돌려준다."""
    rows = rows if rows is not None else [_row(int(i)) for i in panels]
    patches, gets, calls = [], [], []

    def request(url, headers, method="GET", body=None):
        if method == "GET":
            gets.append(url)
            return rows
        patches.append((url, body))

    def fetch(kid):
        calls.append(kid)
        p = panels[kid]
        if isinstance(p, Exception):
            raise p
        return p
    orig = (k._request, k.fetch_panel, k.load_env, k.time.sleep, k.STATE)
    k._request, k.fetch_panel, k.load_env, k.time.sleep = request, fetch, lambda: {"SUPABASE_URL": "http://db"}, lambda s: None
    k.STATE = os.path.join(tempfile.mkdtemp(), "state.json")
    if state is not None:
        json.dump(state, open(k.STATE, "w"))
    try:
        k.run_kakao_detail_backfill(apply=apply, log=lambda m: None, backup_dir=backup_dir or tempfile.mkdtemp(), limit=limit)
        saved = json.load(open(k.STATE)) if os.path.exists(k.STATE) else None
    finally:
        k._request, k.fetch_panel, k.load_env, k.time.sleep, k.STATE = orig
    return patches, gets, calls, saved


def test_converts_five_panel_shapes():
    patches, gets, calls, state = _run({"1": P_ALL, "2": P_WEEK, "3": P_OFF, "4": P_TEMP, "5": NOT_FOUND})
    assert calls == ["1", "2", "3", "4", "5"]
    assert [(_id(u), b) for u, b in patches] == [
        ("id=eq.1", {"business_hours": {"영업시간": "매일 10:00 ~ 18:00"}, "updated_at": patches[0][1]["updated_at"]}),
        ("id=eq.2", {"business_hours": {"영업시간": "월 10:00 ~ 20:30 / 수 10:00 ~ 20:30 / 목 10:00 ~ 20:30 / 금 10:00 ~ 20:30 / "
                                                     "토 10:00 ~ 20:30 / 일 10:00 ~ 18:30"}, "updated_at": patches[1][1]["updated_at"]}),
        ("id=eq.3", {"business_hours": {"영업시간": "화 18:00 ~ 23:30 / 수 18:00 ~ 23:30 / 목 18:00 ~ 23:30 / 금 18:00 ~ 23:30 / "
                                                     "토 17:00 ~ 23:30"}, "closed_days": ["월요일", "일요일"],
                     "updated_at": patches[2][1]["updated_at"]}),
    ]
    # 이번 주에만 쉬는 화요일은 정기 휴무로 쓰지 않는다
    assert "closed_days" not in patches[1][1]
    # 읽은 뒤 다른 쓰기가 있었으면 덮지 않도록 읽은 updated_at이 그대로일 때만 쓴다
    for cond in ("is_closed=eq.false", "source-%3E%3Etype=neq.tourapi", "updated_at=eq.t"):
        assert cond in patches[0][0], cond
    for cond in ("business_hours=eq.%7B%7D", "provider_ids-%3E%3Ekakao=not.is.null", "id=gt.0", "order=id.asc"):
        assert cond in gets[0], cond
    # 임시 휴업과 404도 지나간 것으로 남겨 다음 날 다시 부르지 않는다
    assert state == {"last_id": 5}


def test_does_not_overwrite_filled_columns():
    rows = [_row(3, closed_days=["화요일"]), _row(1, business_hours={"영업시간": "기존"})]
    patches, _, _, _ = _run({"3": P_OFF, "1": P_ALL}, rows=rows)
    assert [b.get("closed_days") for _, b in patches] == [None]
    assert patches[0][1]["business_hours"]["영업시간"].startswith("화 18:00")


def test_skips_row_whose_road_name_differs_or_is_missing():
    rows = [_row(1, address="서울 마포구 연희로 47"), _row(2, address="서울 마포구 연희동 123-4"), _row(3)]
    patches, _, _, state = _run({"1": P_ALL, "2": P_ALL, "3": P_ALL}, rows=rows)
    assert [_id(u) for u, _ in patches] == ["id=eq.3"]
    assert state == {"last_id": 3}


def test_skips_status_not_y():
    patches, _, _, _ = _run({"1": {**P_ALL, "summary": {"status": "N", "address": ADDR}}})
    assert patches == []


def test_patch_carries_read_updated_at_so_changed_rows_are_skipped():
    """PostgREST는 updated_at 조건이 맞지 않는 행을 고치지 않는다. 읽은 값이 그대로 조건에 실리는지 본다."""
    patches, _, _, _ = _run({"1": P_ALL}, rows=[_row(1, updated_at="2026-10-29T08:56:04+09:00")])
    assert "updated_at=eq.2026-10-29T08%3A56%3A04%2B09%3A00" in patches[0][0]
    assert patches[0][1]["updated_at"] != "2026-10-29T08:56:04+09:00"


def test_stops_after_five_consecutive_failures_and_retries_them_next_day():
    panels = {"1": P_ALL, **{str(i): k.PanelFailed("timeout") for i in range(2, 8)}, "8": P_ALL}
    patches, _, calls, state = _run(panels)
    assert calls == ["1", "2", "3", "4", "5", "6"]
    assert [_id(u) for u, _ in patches] == ["id=eq.1"]
    # 연속 실패한 2~6은 다음 날 다시 본다
    assert state == {"last_id": 1}


def test_isolated_failures_do_not_stop():
    panels = {"1": NOT_FOUND, "2": P_ALL, "3": NOT_FOUND, "4": NOT_FOUND, "5": NOT_FOUND, "6": NOT_FOUND, "7": P_ALL}
    patches, _, calls, state = _run(panels)
    assert len(calls) == 7 and len(patches) == 2 and state == {"last_id": 7}


def test_daily_cap_and_cursor_go_into_query():
    _, gets, _, _ = _run({"1": P_ALL}, state={"last_id": 41}, limit=None)
    assert "id=gt.41" in gets[0] and f"limit={k.DAILY_CAP}" in gets[0]
    assert k.DAILY_CAP == int(os.getenv("KAKAO_DETAIL_DAILY_CAP") or 500)


def test_runs_once_a_day_and_backs_up_before_writing():
    d = tempfile.mkdtemp()
    _run({"1": P_ALL}, backup_dir=d)
    [name] = os.listdir(d)  # 카테고리가 없는 행은 가격 백업(p300) 대상이 아니다
    assert name.startswith("p226_") and not name.endswith("_dry.json")
    assert json.load(open(os.path.join(d, name))) == [{"id": 1, "name": "장소1", "business_hours": {}, "closed_days": [], "updated_at": "t"}]
    patches, gets, calls, _ = _run({"1": P_ALL}, backup_dir=d)
    assert (patches, gets, calls) == ([], [], [])


def test_dry_run_writes_nothing_to_db():
    d = tempfile.mkdtemp()
    patches, _, calls, state = _run({"1": P_ALL, "2": P_TEMP}, apply=False, backup_dir=d)
    assert (patches, state, calls) == ([], None, ["1", "2"])
    [name] = os.listdir(d)
    dry = json.load(open(os.path.join(d, name)))
    assert name.endswith("_dry.json") and dry["calls"] == 2 and dry["skipped"] == {"temp_closed": 1} and len(dry["plans"]) == 1
    # 드라이런 파일은 그날의 실행 표시가 아니다
    patches, _, _, _ = _run({"1": P_ALL}, backup_dir=d)
    assert len(patches) == 1


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
