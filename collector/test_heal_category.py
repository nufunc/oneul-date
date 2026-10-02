"""heal_category_and_slot 회귀 테스트: python3 test_heal_category.py 또는 pytest"""
from heal_and_verify_spots import heal_category_and_slot as heal


def test_no_evidence_keeps_category_empty():
    # 근거 없이 시간대로 카테고리를 지어 넣지 않는다(종전: day→감성카페, night→칵테일·위스키바)
    assert heal({"name": "제주 F1 카트클럽", "slot": "day"}) == (None, "day")
    assert heal({"name": "평화광장 춤추는 바다분수", "category": "공원시설물", "slot": "night"}) == (None, "night")


def test_valid_category_kept():
    assert heal({"name": "어느 카페", "category": "감성카페", "slot": "day"})[0] == "감성카페"


def test_summary_template_words_do_not_decide_category():
    # 시간대 템플릿 요약문의 '칵테일'·'위스키'로 술집 카테고리를 주지 않는다(삽교호 바다공원 전망데크 사례)
    spot = {"name": "삽교호 바다공원 전망데크", "slot": "night",
            "summary": "부드러운 위스키 향을 음미하며 달콤한 칵테일과 함께 둘만의 밤을"}
    assert heal(spot)[0] != "칵테일·위스키바"


def test_stay_flip_is_vetoed_only_for_clear_non_stay_category():
    import supabase_worker as w
    assert w.stay_flip_vetoed("양식", "메르씨엘")
    assert w.stay_flip_vetoed("카페", "클래식")
    assert w.stay_flip_vetoed("쇼핑/소품", "옥천장 (5, 10일)")
    assert not w.stay_flip_vetoed("레포츠/체험", "대가야캠프타운")
    assert not w.stay_flip_vetoed("일본식주점", "모노 풀빌라")
    assert not w.stay_flip_vetoed("", "어느 호텔")
    assert not w.stay_flip_vetoed(None, "클래식")


if __name__ == "__main__":
    test_no_evidence_keeps_category_empty()
    test_valid_category_kept()
    test_summary_template_words_do_not_decide_category()
    test_stay_flip_is_vetoed_only_for_clear_non_stay_category()
    print("ok")
