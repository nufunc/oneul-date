"""tour_fee·가격 등급 파생 회귀 테스트: python3 test_tour_fee.py 또는 pytest"""
from supabase_worker import derive_price_tier_from_text as derive
from tour_fee import fee_fields, hours_fields, parse_closed_days


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


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
