"""P-208 회귀 테스트: python3 test_tourapi_parking.py 또는 pytest
TourAPI 수집기는 detailIntro의 유형별 주차 필드를 읽어 값이 있을 때만 parking_info를 넣는다.
빈 값과 읽을 수 없는 값은 넣지 않아 DB 기본값 {"type":"unknown"}을 받는다.
"""
from tour_fee import parking_fields


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


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
