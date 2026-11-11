"""tour_fee·가격 등급 파생 회귀 테스트: python3 test_tour_fee.py 또는 pytest"""
from supabase_worker import derive_price_tier_from_text as derive
import json
import os
import tempfile
import urllib.parse

import tour_fee as t
from tour_fee import fee_fields, hours_fields, lodging_price, parse_closed_days


def test_usefee_uses_highest_amount_and_strips_html():
    f = fee_fields("[개인]<br>- 성인 10,000원<br>- 청소년, 유아 5,000원")
    assert f["price"] == "[개인] / - 성인 10,000원 / - 청소년, 유아 5,000원"
    assert (f["price_tier"], f["avg_price_per_person"]) == ("₩", 10000)


def test_free_only_when_explicit_and_without_amounts():
    assert fee_fields("무료")["price_tier"] == "FREE"
    assert derive("성인 3,000원 / 어린이 무료") == ("₩", 3000)
    assert derive("무료 (일부 유료)") == (None, None)
    assert fee_fields("") is None and fee_fields(None) is None


def test_small_amount_gets_lowest_tier():
    assert (fee_fields("500원")["price_tier"], fee_fields("500원")["avg_price_per_person"]) == ("₩", 500)


def test_no_amount_no_tier():
    f = fee_fields("전시별 상이")
    assert f["price"] == "전시별 상이" and f["price_tier"] is None and f["avg_price_per_person"] is None


def test_closed_days_reads_weekly_days_only():
    """2026-09-30 문화시설 40곳 표본의 실제 원문"""
    assert parse_closed_days("매주 월요일 / 1월 1일 / 설·추석 당일") == ["월요일"]
    assert parse_closed_days("매주 일요일~월요일") == ["월요일", "일요일"]
    assert parse_closed_days("매주 토요일, 일요일 / 공휴일") == ["토요일", "일요일"]
    assert parse_closed_days("매주 월요일 / 화요일 / 설·추석 당일") == ["월요일", "화요일"]
    assert parse_closed_days("매주 주말 / 법정공휴일") == ["토요일", "일요일"]
    # 괄호 안의 요일은 예외 설명이라 휴관 요일이 아니다
    assert parse_closed_days("매주 월요일, 법정공휴일 휴무   (일요일이 다른 법정공휴일과 겹치는 경우 휴무)") == ["월요일"]


def test_closed_days_skips_what_is_not_a_weekly_rule():
    assert parse_closed_days("연중무휴") == [] and parse_closed_days("") == [] and parse_closed_days(None) == []
    assert parse_closed_days("매월 둘째, 넷째 월요일 / 개관기념일") == []
    assert parse_closed_days("시설에 따라 상이하므로 홈페이지 참조") == []
    # 시설마다 나눠 적은 목록은 시설 전체의 휴관일이 아니다
    assert parse_closed_days("- 자료열람실 매주 금요일 / 공휴일<br>- 열람실 매월 첫째, 셋째 금요일") == []
    # 공휴일이면 다음 날로 밀리는 조건은 요일만으로 나타낼 수 없다
    assert parse_closed_days("매주 화요일, 공휴일이면 다음날") == []
    # 2026-09-30 충현박물관 원문. 7일 전부는 매일 휴관이 아니라 개관 요일을 적은 것이다
    assert parse_closed_days("매주 월요일~일요일 / 1월 1일 / 설·추석 연휴") == []


def test_hours_under_non_weekday_key():
    # 요일 키로 넣으면 앱의 오늘 휴무 판정이 이 값을 읽는다
    assert hours_fields("09:00~18:00<br>(입장마감 17:00)") == {"이용시간": "09:00~18:00 / (입장마감 17:00)"}
    assert hours_fields("") is None and hours_fields(None) is None


def test_hours_keep_seasonal_text_past_100_chars():
    # 건청궁처럼 계절별 시간을 적은 원문은 100자를 넘고 마지막 입장마감이 잘리면 안 된다
    raw = ("1~2월, 11~12월 09:00~17:00 (입장마감 16:00)<br>3~5월, 9~10월 09:00~18:00 (입장마감 17:00)"
           "<br>6~8월 09:00~18:30 (입장마감 17:30)")
    text = hours_fields(raw)["이용시간"]
    assert len(text) > 100 and text.endswith("(입장마감 17:30)")


def _room(off1="0", off2="0", peak1="0", peak2="0"):
    return {"roomtitle": "방", "roomoffseasonminfee1": off1, "roomoffseasonminfee2": off2,
            "roompeakseasonminfee1": peak1, "roompeakseasonminfee2": peak2}


def test_lodging_price_uses_lowest_offseason_weekday_fee():
    # P-357: 객실마다 0 초과 값 중 최솟값. 주말·성수기 값이 더 낮아도 비수기 주중이 있으면 그것을 쓴다
    assert lodging_price([_room("120000", "150000", "90000"), _room("80000", "60000"), _room("0", "50000")]) == \
        "1박 80,000원~ (객실 최저가, 비수기 주중)"
    assert lodging_price([_room("40000")]) == "1박 40,000원~ (객실 최저가, 비수기 주중)"


def test_lodging_price_zero_and_phone_inquiry_are_not_written():
    assert lodging_price([_room(), _room("0", "0", "0", "0")]) is None
    assert lodging_price([_room("전화 문의", "전화문의", "", None), {"roomtitle": "방"}]) is None
    # 0과 문의 문구는 건너뛰고 남은 객실의 값을 쓴다
    assert lodging_price([_room("0"), _room("전화 문의"), _room("55,000")]) == "1박 55,000원~ (객실 최저가, 비수기 주중)"
    # 1,000원 미만은 단위 오기로 본다
    assert lodging_price([_room("50")]) is None


def test_lodging_price_no_rooms():
    assert lodging_price([]) is None and lodging_price(None) is None and lodging_price([None]) is None


def test_lodging_price_peak_only_gets_peak_label():
    # 에스피에스타처럼 비수기 값이 0이고 성수기만 있는 행
    assert lodging_price([_room("0", "0", "120000", "150000"), _room(peak2="130000")]) == "1박 120,000원~ (객실 최저가, 성수기)"


def test_lodging_price_weekend_only_gets_weekend_label():
    assert lodging_price([_room("0", "90000", "70000"), _room("0", "100000")]) == "1박 90,000원~ (객실 최저가, 비수기 주말)"


def test_lodging_price_text_never_reads_as_per_person_price():
    for rooms in ([_room("80000")], [_room("0", "80000")], [_room("0", "0", "80000")]):
        text = lodging_price(rooms)
        assert text.startswith("1박 ") and not any(w in text for w in ("1인", "인당", "시간", "코스", "입장료")), text


def _lodging_run(rooms_by_cotid, rows, used=0, **kw):
    """DB와 TourAPI를 가짜로 바꿔 run_lodging_price를 돌린다. (PATCH 목록, 부른 cotid, 백업 폴더, 상태 파일 내용)"""
    usage, patches, called, d = [used], [], [], tempfile.mkdtemp()

    def request(url, headers, method="GET", body=None):
        if method == "GET":
            return rows if "id=gt.0" in url else []
        patches.append((url, body))
        return [{"id": 1}]

    def fetch(api_key, cid):
        usage[0] += 1
        called.append(cid)
        return rooms_by_cotid[cid]
    orig = (t._request, t.fetch_rooms, t.usage_today, t._tour_api_key, t.load_env, t.time.sleep, t.LODGING_STATE)
    t._request, t.fetch_rooms, t.usage_today = request, fetch, lambda: usage[0]
    t._tour_api_key, t.load_env, t.time.sleep = lambda: "k", lambda: {"SUPABASE_URL": "http://db"}, lambda s: None
    t.LODGING_STATE = os.path.join(tempfile.mkdtemp(), "state.json")
    try:
        t.run_lodging_price(log=lambda m: None, backup_dir=d, **kw)
        state = json.load(open(t.LODGING_STATE)) if os.path.exists(t.LODGING_STATE) else None
    finally:
        t._request, t.fetch_rooms, t.usage_today, t._tour_api_key, t.load_env, t.time.sleep, t.LODGING_STATE = orig
    return patches, called, d, state


def _lrow(i, hot=50, **kw):
    return {"id": i, "name": f"숙소{i}", "category": "숙박", "price": None, "price_tier": None, "avg_price_per_person": None,
            "hot_score": hot, "updated_at": f"t{i}", "source": {"type": "tourapi", "url": f"https://x/detail?cotid={i}"}, **kw}


def test_lodging_targets_are_empty_price_lodging_rows_in_exposure_order():
    rows = [_lrow(1, 10), _lrow(2, 90), _lrow(3, 90), _lrow(4, price="1박 9만 원"), _lrow(5, category="레포츠/체험"),
            _lrow(6, price_tier="₩"), _lrow(7, avg_price_per_person=5000), _lrow(8, price="  "), _lrow(9, category="콘도,리조트")]
    t_req = t._request
    t._request = lambda url, h, *a, **k: rows if "id=gt.0" in url else []
    try:
        got = t._lodging_targets("http://db", {})
    finally:
        t._request = t_req
    # hot_score 큰 순, 동률은 id 작은 순. 가격 칸이 하나라도 차 있거나 캠핑장 카테고리인 행은 빠진다
    assert [r["id"] for r in got] == [2, 3, 8, 9, 1]  # 8은 price가 공백뿐이라 빈 칸이다


def test_lodging_count_only_makes_no_tourapi_call_and_no_write():
    patches, called, d, state = _lodging_run({}, [_lrow(1)], count_only=True, apply=True)
    assert (patches, called, os.listdir(d), state) == ([], [], [], None)


def test_lodging_dry_run_calls_tourapi_but_writes_only_plan_file():
    rooms = {"1": [_room("80000")], "2": [], "3": [_room()]}
    patches, called, d, state = _lodging_run(rooms, [_lrow(1), _lrow(2), _lrow(3)])
    assert patches == [] and called == ["1", "2", "3"] and state is None
    [name] = os.listdir(d)
    plan = json.load(open(os.path.join(d, name)))
    assert name.startswith("p357_") and name.endswith("_dry.json")
    assert [x["new_price"] for x in plan["rows"]] == ["1박 80,000원~ (객실 최저가, 비수기 주중)"] and plan["checked"] == [1, 2, 3]


def test_lodging_budget_and_usage_guards():
    rooms = {str(i): [_room("80000")] for i in range(1, 6)}
    rows = [_lrow(i) for i in range(1, 6)]
    assert _lodging_run(rooms, rows, max_calls=2)[1] == ["1", "2"]
    assert _lodging_run(rooms, rows, limit=3)[1] == ["1", "2", "3"]
    assert _lodging_run(rooms, rows, used=699, max_calls=300)[1] == ["1"]  # 사용량이 700에 닿으면 멈춘다
    assert _lodging_run(rooms, rows, used=700)[1] == []


def test_lodging_apply_backs_up_records_then_writes_conditionally_to_price_only():
    rooms = {"1": [_room("80000")], "2": [_room()]}
    patches, called, d, state = _lodging_run(rooms, [_lrow(1), _lrow(2)], apply=True)
    names = sorted(os.listdir(d))
    assert len(names) == 2 and all(n.startswith("p357_") for n in names)
    written = json.load(open(os.path.join(d, next(n for n in names if "written" in n))))
    backup = json.load(open(os.path.join(d, next(n for n in names if "written" not in n))))
    assert written == [{"id": 1, "price": "1박 80,000원~ (객실 최저가, 비수기 주중)"}]
    assert backup == [{"id": 1, "name": "숙소1", "price": None, "price_tier": None, "avg_price_per_person": None, "updated_at": "t1"}]
    [(url, body)] = patches
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert (q["id"], q["is_closed"], q["updated_at"], q["or"]) == (["eq.1"], ["eq.false"], ["eq.t1"], ["(price.is.null,price.eq.)"])
    assert set(body) == {"price", "updated_at"}  # price_tier·avg_price_per_person은 쓰지 않는다
    assert state == {"checked": [1, 2]}  # 값이 없던 행도 읽은 것으로 남는다


def test_lodging_rollback_restores_only_rows_still_holding_the_written_value():
    d = tempfile.mkdtemp()
    json.dump([{"id": 1, "name": "a", "price": None}, {"id": 2, "name": "b", "price": ""}], open(os.path.join(d, "p357_20261112-000000.json"), "w"))
    wpath = os.path.join(d, "p357_written_20261112-000000.json")
    json.dump([{"id": 1, "price": "1박 80,000원~ (객실 최저가, 비수기 주중)"}, {"id": 2, "price": "1박 50,000원~ (객실 최저가, 성수기)"}], open(wpath, "w"))
    patches = []
    orig = (t._request, t.load_env)
    t._request = lambda url, h, method="GET", body=None: patches.append((url, body)) or [{"id": 1}]
    t.load_env = lambda: {"SUPABASE_URL": "http://db"}
    try:
        t.run_lodging_rollback(wpath, log=lambda m: None)
    finally:
        t._request, t.load_env = orig
    assert [b["price"] for _, b in patches] == [None, ""]
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(patches[0][0]).query)
    assert q["id"] == ["eq.1"] and q["price"] == ["eq.1박 80,000원~ (객실 최저가, 비수기 주중)"]  # 현재 값이 기록과 같을 때만


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
