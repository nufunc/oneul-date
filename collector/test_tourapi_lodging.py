"""TourAPI 숙박(contentTypeId=32) 수집 회귀 테스트: python3 test_tourapi_lodging.py 또는 pytest"""
from category_filter import is_date_spot_category
from miners.tourapi_miner import DATE_CONTENT_TYPES, is_skipped_lodging


def test_lodging_type_is_mined_as_stay_slot():
    assert ("32", "숙박", ["romantic", "healing"], "stay") in DATE_CONTENT_TYPES


def test_motels_and_hostels_are_skipped_but_hotels_are_not():
    """2026-09-30 서울·제주 실측 이름. 포도호텔은 TourAPI 분류가 모텔이지만 이름은 호텔이라 남는다."""
    for title in ("나비호스텔", "남산호스텔", "에덴호스텔", "OO모텔", "OO여관"):
        assert is_skipped_lodging({"title": title}), title
    for title in ("그랜드 하얏트 제주", "포도호텔", "강남스테이힐(Gangnam Stay Hill)", "바다에누워 펜션"):
        assert not is_skipped_lodging({"title": title, "cat3": "B02010900"}), title


def test_lodging_category_passes_the_date_spot_filter():
    for title in ("그랜드 하얏트 제주", "글래드 마포", "물결그림"):
        assert is_date_spot_category("숙박", title, allow_lodging=True)[0], title


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
