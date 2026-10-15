"""stay 행의 category 교정 회귀 테스트(P-144): python3 test_stay_category.py 또는 pytest"""
from miners.tourapi_miner import stay_category
from supabase_worker import stay_category_patch


def test_campsite_rows_get_a_lodging_category():
    assert stay_category("28", "강당골 캠핑파크", "레포츠/체험") == "야영,캠핑장"
    assert stay_category("28", "학마을캠프펜션", "레포츠/체험") == "펜션"


def test_non_campsite_rows_keep_the_type_label():
    assert stay_category("12", "캠프그리브스", "관광지") == "관광지"
    assert stay_category("28", "삼락강변체육공원인라인스케이트장", "레포츠/체험") == "레포츠/체험"
    assert stay_category("32", "그랜드 하얏트 제주", "숙박") == "숙박"


def test_slot_fix_to_stay_copies_a_lodging_category_over_a_type_label():
    for naver in ("오토캠핑장", "글램핑장", "펜션", "콘도,리조트", "호텔", "게스트하우스"):
        assert stay_category_patch("레포츠/체험", naver) == naver
    assert stay_category_patch("관광지", "콘도,리조트") == "콘도,리조트"


def test_slot_fix_leaves_real_categories_and_non_lodging_alone():
    assert stay_category_patch("숙박", "펜션") is None
    assert stay_category_patch("카페", "펜션") is None
    assert stay_category_patch("레포츠/체험", "한식") is None
    assert stay_category_patch("레포츠/체험", "") is None
    assert stay_category_patch(None, "펜션") is None


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
