"""P-208 회귀 테스트: python3 test_tourapi_parking.py 또는 pytest
TourAPI 수집기는 detailIntro의 유형별 주차 필드를 읽어 값이 있을 때만 parking_info를 넣는다.
빈 값과 읽을 수 없는 값은 넣지 않아 DB 기본값 {"type":"unknown"}을 받는다.
P-221: 관광지(12)는 같은 응답의 usetime을 business_hours에, restdate를 closed_days에 함께 넣는다.
"""
from tour_fee import parking_fields

# 관광지 detailIntro2 표본 응답(2026-10-31 feature-94)에서 쓰는 필드만 옮겼다
SAMPLES = {
    "126938": {"usetime": "월요일~토요일 10:00~17:00", "restdate": "매주 일요일",
               "parking": "가능※ 대형버스는 망원 제1주차장 이용 요망"},  # 양화진외국인선교사묘원
    "125467": {"usetime": "상시 개방", "restdate": "연중무휴", "parking": "불가능"},  # 대금산(가평)
    "127432": {"usetime": "- 하절기(3월~10월) 10:00~17:00<br>\n- 동절기(11월~2월) 10:00~16:00<br>\n※ 입장은 폐장 30분 전까지 가능",
               "restdate": "1월 1일 / 설·추석 당일", "parking": "가능<br>요금 (무료)"},  # 경상북도수목원
    "1604652": {"usetime": "[11월~2월] - 09:00~17:00 - 입장마감 16:00 [3월~5월/9월~10월] - 09:00~18:00 - 입장마감 17:00 "
                           "[6월~8월] - 09:00~18:30 - 입장마감 17:30",
                "restdate": "매주 화요일※ 단, 정기휴일이 공휴일 및 대체공휴일과 겹칠 경우에는 개방하며, 그 다음의 첫 번째 비공휴일이 정기휴일임",
                "parking": "가능"},  # 건청궁
}
# 표본마다 넣어야 할 칸. 수목원과 건청궁의 restdate는 매주 반복 요일로 읽지 못해 closed_days가 없다
EXPECTED = {
    "126938": {"parking_info": {"type": "available", "detail": "가능※ 대형버스는 망원 제1주차장 이용 요망"},
               "business_hours": {"이용시간": "월요일~토요일 10:00~17:00"}, "closed_days": ["일요일"]},
    "125467": {"parking_info": {"type": "impossible", "detail": "불가능"}, "business_hours": {"이용시간": "상시 개방"}},
    "127432": {"parking_info": {"type": "free", "detail": "가능 요금 (무료)"},
               "business_hours": {"이용시간": "- 하절기(3월~10월) 10:00~17:00 / - 동절기(11월~2월) 10:00~16:00 / ※ 입장은 폐장 30분 전까지 가능"}},
    "1604652": {"parking_info": {"type": "available", "detail": "가능"},
                "business_hours": {"이용시간": "[11월~2월] - 09:00~17:00 - 입장마감 16:00 [3월~5월/9월~10월] - 09:00~18:00 - 입장마감 17:00 "
                                           "[6월~8월] - 09:00~18:30 "}},
}


def test_classify_tourist_parking():
    cases = {
        "가능": ("available", "가능"),
        "가능(10대 이상)": ("available", "가능(10대 이상)"),
        "불가능": ("impossible", "불가능"),
        "없음": ("impossible", "없음"),
        "무료": ("free", "무료"),
        "가능(무료)": ("free", "가능(무료)"),
        "유료 2,000원": ("paid", "유료 2,000원"),
        "가능<br>요금 (무료)": ("free", "가능 요금 (무료)"),
        "  가능 <BR />  (문화회관 주차장) ": ("available", "가능 (문화회관 주차장)"),
    }
    for raw, (kind, detail) in cases.items():
        assert parking_fields({"parking": raw}, "12") == {"type": kind, "detail": detail}, raw


def test_empty_or_unreadable_is_not_written():
    for intro in ({}, None, {"parking": ""}, {"parking": "<br>"}, {"parking": "문의"}):
        assert parking_fields(intro, "12") is None, intro


def test_fee_field_is_joined_and_paid_beats_free():
    # 지웰시티몰: 부분 무료 뒤에 금액이 있으면 free가 아니라 paid
    assert parking_fields({"parkingshopping": "가능 요금 (최대 4시간 무료 및 30분 당 추가 요금 2,000원씩 추가 요금 발생)"}, "38")["type"] == "paid"
    assert parking_fields({"parkingculture": "", "parkingfee": "무료"}, 14) == {"type": "free", "detail": "무료"}
    assert parking_fields({"parkingleports": "", "parkingfeeleports": ""}, "28") is None
    assert parking_fields({"parkinglodging": "있음"}, "32") == {"type": "available", "detail": "있음"}


def test_festival_has_no_parking_field():
    assert parking_fields({"parking": "가능"}, "15") is None


def test_miner_stores_hours_and_closed_days_for_tourist_spots():
    from test_tourapi_quota import _item, _run_ldong
    import tourapi_miner as m
    calls = []

    def fetch(api_key, cid, ctype="14"):
        calls.append((cid, ctype))
        return SAMPLES[cid]
    orig, m.fetch_intro = m.fetch_intro, fetch
    try:
        inserted, _, _ = _run_ldong({"11": [_item(c, "VE010200") for c in SAMPLES]}, {"area_index": 0, "page_by_combo": {}})
    finally:
        m.fetch_intro = orig
    assert sorted(calls) == sorted((c, "12") for c in SAMPLES)  # 표본마다 한 번만 부른다
    keys = ("parking_info", "business_hours", "closed_days")
    got = {s["name"][2:]: {k: s[k] for k in keys if k in s} for s in inserted}
    assert got == EXPECTED, got


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
