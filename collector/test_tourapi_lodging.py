"""TourAPI 숙박(contentTypeId=32) 수집 회귀 테스트: python3 test_tourapi_lodging.py 또는 pytest"""
from category_filter import is_date_spot_category
from miners.tourapi_miner import (CAMPSITE_NAME, DATE_CONTENT_TYPES, PUBLIC_FACILITY_NAME, is_campsite,
                                  is_non_date_leisure_or_monument, is_skipped_lodging)


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


def test_campsites_are_mined_as_stay_slot():
    """사이클 36 실측 이름. 레포츠/체험 유형 기본 슬롯 day 대신 stay로 넣는다"""
    for title in ("거제자연휴양림캠핑장", "민트글램핑", "원산도 오션카라반", "OO야영장"):
        assert CAMPSITE_NAME.search(title), title
    for title in ("삼락강변체육공원인라인스케이트장", "캠프그리브스"):
        assert not CAMPSITE_NAME.search(title), title


def test_public_education_facilities_are_skipped_but_libraries_are_not():
    for title in ("안양문화원", "고성문화원(경남)", "아산시 평생학습관", "화랑교육원", "수원시민회관"):
        assert PUBLIC_FACILITY_NAME.search(title), title
    for title in ("정독도서관", "남산도서관", "국립한글박물관"):
        assert not PUBLIC_FACILITY_NAME.search(title), title


def test_leisure_camps_and_pensions_are_mined_as_stay_slot():
    """P-057 실측 이름. 캠프·펜션은 레포츠/체험 유형에서만 숙소로 본다"""
    for title in ("하늘그린캠프", "학마을캠프펜션", "쇠꼴마을고고펜션", "곰섬오토캠프장"):
        assert is_campsite("28", title), title
    assert is_campsite("12", "거제자연휴양림캠핑장")
    assert not is_campsite("12", "캠프그리브스")
    assert not is_campsite("38", "소금강행복펜션마트")
    assert not is_campsite("28", "삼락강변체육공원인라인스케이트장")


def test_golf_fishing_and_lone_monuments_are_skipped():
    """P-057 신규 유입과 DB 실측 이름"""
    for title in ("솔트베이GC", "송추CC", "수원컨트리클럽", "하이원 컨트리클럽", "더헤븐cc", "고양CC(고양 컨트리클럽)",
                  "송전지 낚시터", "피싱12", "만정바다좌대낚시터"):
        assert is_non_date_leisure_or_monument("28", title), title
    for title in ("박두진 시비", "봉산동 당간지주", "비두리 귀부 및 이수", "어제 달천 충렬사비", "연안이씨 쌍효각", "부산각서석",
                  "부안 동문안 당산", "사곡리남근석", "보성 문익점 부조묘", "제주해녀항일운동기념탑", "남이장군묘 (화성)"):
        assert is_non_date_leisure_or_monument("12", title), title


def test_similar_names_are_not_skipped():
    for title in ("보광미니골프장", "하늘그린캠프", "카누글램핑펜션", "드림바다실내낚시터", "실내낚시카페 피싱파크"):
        assert not is_non_date_leisure_or_monument("28", title), title
    for title in ("종묘", "묘적사계곡", "묘각사(영천)", "골굴사 마애여래좌상", "경주 정혜사지 십삼층석탑", "캠프그리브스", "아트센터나비"):
        assert not is_non_date_leisure_or_monument("12", title), title
    # 다른 유형은 이름 규칙을 걸지 않는다(아덴힐리조트&골프는 숙박, 밸리피싱은 쇼핑)
    assert not is_non_date_leisure_or_monument("32", "아덴힐리조트&골프")
    assert not is_non_date_leisure_or_monument("38", "밸리피싱")


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
