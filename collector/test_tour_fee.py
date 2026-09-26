"""tour_fee·가격 등급 파생 회귀 테스트: python3 test_tour_fee.py 또는 pytest"""
from supabase_worker import derive_price_tier_from_text as derive
from tour_fee import fee_fields


def test_usefee_uses_highest_amount_and_strips_html():
    f = fee_fields("[개인]<br>- 성인 10,000원<br>- 청소년, 유아 5,000원")
    assert f["price"] == "[개인] / - 성인 10,000원 / - 청소년, 유아 5,000원"
    assert (f["price_tier"], f["avg_price_per_person"]) == ("₩", 10000)


def test_free_only_when_explicit_and_without_amounts():
    assert fee_fields("무료")["price_tier"] == "FREE"
    assert derive("성인 3,000원 / 어린이 무료") == ("₩", 3000)
    assert derive("무료 (일부 유료)") == (None, None)
    assert fee_fields("") is None and fee_fields(None) is None


def test_no_amount_no_tier():
    f = fee_fields("전시별 상이")
    assert f["price"] == "전시별 상이" and f["price_tier"] is None and f["avg_price_per_person"] is None


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
