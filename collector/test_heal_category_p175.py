"""재검증이 옮겨 붙인 생활 서비스 업종 category 회귀 테스트(P-175): python3 test_heal_category_p175.py 또는 pytest
표본은 2026-10-21 라이브 열린 행의 이름과 category다. 교통시설·터널·육교는 명소가 있어 남긴다."""
from heal_and_verify_spots import heal_category_and_slot as heal


def _cat(name, category):
    return heal({"name": name, "category": category, "slot": "day", "source": {"note": ""}})[0]


def test_life_service_category_is_cleared():
    assert _cat("속초 청초호 설악대교", "통신기기") is None
    assert _cat("레이크꼬모 동탄", "이비인후과") is None
    assert _cat("성남시의료원 기숙사", "기숙사,기숙시설") is None
    assert _cat("석운동 포레스트", "미용실") is None
    assert _cat("평창군보건의료원", "보건소") is None
    # 계층형 값도 마지막 마디로 본다
    assert _cat("석운동 포레스트", "가정,생활 > 미용 > 미용실") is None
    # 비운 뒤에는 이름 키워드 규칙이 다시 채운다
    assert _cat("인천 청라호수공원 음악분수", "교차로") == "자연·산책"


def test_landmark_transport_category_is_kept():
    assert _cat("월미바다열차", "교통시설") == "교통시설"
    assert _cat("통영 해저터널", "터널") == "터널"
    assert _cat("송도구름산책로", "육교") == "육교"


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
