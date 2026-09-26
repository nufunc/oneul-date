"""heal_category_and_slot 회귀 테스트: python3 test_heal_category.py 또는 pytest"""
from heal_and_verify_spots import heal_category_and_slot as heal


def test_no_evidence_keeps_category_empty():
    # 근거 없이 시간대로 카테고리를 지어 넣지 않는다(종전: day→감성카페, night→칵테일·위스키바)
    assert heal({"name": "제주 F1 카트클럽", "slot": "day"}) == (None, "day")
    assert heal({"name": "평화광장 춤추는 바다분수", "category": "공원시설물", "slot": "night"}) == (None, "night")


def test_valid_category_kept():
    assert heal({"name": "어느 카페", "category": "감성카페", "slot": "day"})[0] == "감성카페"


if __name__ == "__main__":
    test_no_evidence_keeps_category_empty()
    test_valid_category_kept()
    print("ok")
