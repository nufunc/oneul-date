"""부속 시설 category 판정 회귀 테스트(P-166): python3 test_polluted_category.py 또는 pytest
표본은 2026-10-20 DB 열린 18,884행의 category 값이다. 바뀐 판정이 대상 40행과 기존 오염 업종 3행에만 걸린다."""
from heal_and_verify_spots import heal_category_and_slot as heal
from supabase_worker import SLOT_NONSPOT_RE

# 종전 완전 일치로는 그대로 내보냈고 이번에 가리는 값. 아파트 동·식품판매·화장품은 대상 밖 3행(6300, 6722, 8046)이다
NEWLY_POLLUTED = [
    "공영주차장", "매표소", "관광안내소",
    "교통,수송 > 교통시설 > 주차장 > 공영주차장", "서비스,산업 > 관리,운영 > 건물관리사무소",
    "가정,생활 > 편의점 > 이마트24", "가정,생활 > 편의점 > GS25",
    "부동산 > 주거시설 > 아파트 > 아파트 동", "가정,생활 > 식품판매", "가정,생활 > 미용 > 화장품",
]
STILL_POLLUTED = ["주차장", "화장실", "입출구", "가정,생활", "공원시설물"]
# 생활 서비스 업종은 P-175에서 오염으로 옮겼다
P175_POLLUTED = [
    "가정,생활 > 패션 > 패션잡화점 > 안경,렌즈 > 으뜸50안경", "가정,생활 > 미용 > 미용실", "부동산 > 빌딩",
    "가정,생활 > 결혼 > 예식장",
]
# 같은 표본에서 판정이 바뀌지 않아야 하는 값: 계층형 값과 자주 나오는 값
KEPT = [
    "서비스,산업 > 식품 > 음료,주류제조", "서비스,산업 > 전문대행 > 공간대여",
    "관광지", "카페", "레포츠/체험", "문화시설", "제과,베이커리", "디저트카페",
]


def _cat(category):
    # 이름에 키워드가 없어 오염으로 가리면 None, 아니면 원래 값이 남는다
    return heal({"name": "표본", "category": category, "slot": "day"})[0]


def test_accessory_category_hidden_by_last_segment():
    for c in NEWLY_POLLUTED + STILL_POLLUTED + P175_POLLUTED:
        assert _cat(c) is None, c


def test_other_categories_kept():
    for c in KEPT:
        assert _cat(c) == c, c


def test_nonspot_re_catches_toilet_and_ticket_booth():
    hit = lambda c: any(p.search(c) for p in SLOT_NONSPOT_RE)
    for c in ("화장실", "매표소", "입출구", "주차장"):
        assert hit(c), c
    for c in KEPT[2:]:
        assert not hit(c), c


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
