"""kakao_category_from_path 회귀 테스트: python3 test_kakao_category.py 또는 pytest"""
from supabase_worker import kakao_category_from_path as k


def test_brand_leaf_falls_back_one_level():
    assert k("음식점 > 카페 > 커피전문점 > 에그카페24", "에그카페24 압구정점") == "커피전문점"
    assert k("음식점 > 카페 > 커피전문점 > 메가MGC커피", "메가MGC커피 녹번점") == "커피전문점"
    assert k("여행 > 숙박 > 호텔 > 앰배서더호텔", "머큐어 앰배서더 서울 홍대") == "호텔"


def test_generic_leaf_is_kept():
    # '디저트카페'에서 '카페'를 떼면 '디저트'가 상호명에 걸려 브랜드로 오판됐다
    assert k("음식점 > 카페 > 테마카페 > 디저트카페", "안나의디저트") == "디저트카페"
    assert k("음식점 > 카페", "카페 틈") == "카페"
    assert k("음식점 > 한식 > 육류,고기 > 삼겹살", "하남돼지집") == "삼겹살"


def test_three_level_small_chain_falls_back():
    assert k("음식점 > 카페 > 더노벰버라운지", "더노벰버라운지 하남미사점") == "카페"
    assert k("음식점 > 한식 > 뽁식당", "뽁식당 배곧점") == "한식"


def test_generic_type_in_name_is_kept():
    assert k("여행 > 관광,명소 > 전망대", "남산전망대") == "전망대"
    assert k("음식점 > 카페 > 커피전문점", "카페 틈") == "커피전문점"
    assert k("음식점 > 한식 > 국수", "명동국수") == "국수"


def test_empty_path():
    assert k("", "아무가게") is None
    assert k(None, "아무가게") is None



def test_landmark_fallback_does_not_store_full_path():
    # 주소·랜드마크 폴백이 카카오 경로 전체를 category로 돌려줘 19행에 '가정,생활 > 미용 > 미용실'이 들어갔다(2026-09-26)
    import io, json
    import supabase_worker as w

    class R(io.BytesIO):
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

    def fake(req, timeout=None):
        if "naver" in getattr(req, "full_url", ""):
            raise OSError("naver off")
        return R(json.dumps({"documents": [{"place_name": "빗앤붓", "road_address_name": "서울 강남구 1", "x": "1", "y": "2",
                                            "category_name": "가정,생활 > 미용 > 미용실"}]}).encode())
    orig = (w.urllib.request.urlopen, w.KAKAO_REST_API_KEY)
    w.urllib.request.urlopen, w.KAKAO_REST_API_KEY = fake, "k"
    try:
        assert w.search_address_or_landmark("빗앤붓")["category"] == "미용실"
    finally:
        w.urllib.request.urlopen, w.KAKAO_REST_API_KEY = orig


if __name__ == "__main__":
    for fn in [v for key, v in list(globals().items()) if key.startswith("test_")]:
        fn()
    print("ok")
