"""소셜 동기화 카카오 링크 보존 회귀 테스트: python3 test_enrich_kakao_link.py 또는 pytest (DB와 검색을 가짜로 바꾼다)"""
import io
import json

import enrich_worker as e
import fix_spot_summaries

PLACE = {"url": "https://place.map.kakao.com/9479775", "rating": 4.6, "review_count": 214}
FALLBACK = {"url": "https://map.kakao.com/link/search/%EC%86%8C%EC%88%98%EC%84%9C%EC%9B%90"}


class _Res(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _run(existing_kakao, searched, address="경북 영주시 순흥면 소백로 2740", provider_ids=None, point=None):
    """스팟 한 곳으로 소셜 동기화를 돌리고 DB에 보낸 social_links.kakaomap을 돌려준다."""
    spot = {"id": 1791660755259, "name": "소수서원", "location": "영남 영주시", "row_address": address,
            "social_links": {"kakaomap": existing_kakao} if existing_kakao else {}, "metrics": {}, "summary": "s",
            "provider_ids": provider_ids}
    if point:
        spot["lat"], spot["lng"] = point
    patches = []

    def urlopen(req, timeout=0):
        if req.get_method() == "PATCH":
            patches.append(json.loads(req.data))
            return _Res(b"")
        return _Res(json.dumps([spot]).encode())

    saved = (e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep, fix_spot_summaries.is_bad_summary)
    e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place = urlopen, lambda *a: None, lambda *a, **k: dict(searched) if searched else searched
    e.time.sleep, fix_spot_summaries.is_bad_summary = lambda *a: None, lambda *a: False
    try:
        e.run_social_enrichment("http://db", "key", 1)
    finally:
        (e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep, fix_spot_summaries.is_bad_summary) = saved
    assert len(patches) == 1, patches
    return patches[0]["social_links"].get("kakaomap")


def test_fallback_does_not_overwrite_place_link():
    assert _run(PLACE, FALLBACK) == PLACE


def test_same_place_number_refreshes_rating():
    new = {"url": PLACE["url"], "rating": 4.1}
    assert _run(PLACE, new) == new


def test_other_place_with_other_address_keeps_old():
    # 구천동: 옛 번호는 무주구천동33경, 새 번호는 광주 동구의 '33'
    old = {"url": "https://place.map.kakao.com/7878763"}
    new = {"url": "https://place.map.kakao.com/1310925863", "addresses": ["광주 동구 서석로 33", "광주 동구 서석동 33"]}
    assert _run(old, new, "전북특별자치도 무주군 설천면 백련사길 580") == old
    # 광주호: 새 번호 광주호시는 같은 북구지만 도로명과 지번이 다르다
    old = {"url": "https://place.map.kakao.com/8194366"}
    new = {"url": "https://place.map.kakao.com/170021308",
           "addresses": ["전남광주통합특별시 북구 버들로19번길 31", "전남광주통합특별시 북구 유동 7-1 1층"]}
    assert _run(old, new, "광주 북구 충효샘길 7 (충효동)") == old


def test_other_place_with_same_address_replaces_old():
    # 레이크하우스: 옛 번호가 71km 밖이고 새 번호 도로명 주소가 행 주소와 같다
    old = {"url": "https://place.map.kakao.com/607928580"}
    new = {"url": "https://place.map.kakao.com/484845961", "rating": 4.2,
           "addresses": ["인천 서해구 청라대로 204", "인천 서해구 청라동 106-2"]}
    assert _run(old, new, "인천 서해구 청라대로 204") == {"url": new["url"], "rating": 4.2}
    # 지번만 같아도 바꾼다
    assert _run(old, new, "인천 서해구 청라동 106-2")["url"] == new["url"]


def test_provider_number_link_kept_against_same_building_place():
    # 서귀포칼호텔: 링크가 provider 번호(호텔)인데 검색이 같은 건물 지하1층 뷔페를 돌려줬다(P-199)
    old = {"url": "https://place.map.kakao.com/10500084", "rating": 4.0}
    new = {"url": "https://place.map.kakao.com/21468173", "rating": 4.3,
           "addresses": ["제주특별자치도 서귀포시 칠십리로 242 지하1층"]}
    assert _run(old, new, "제주특별자치도 서귀포시 칠십리로 242", {"kakao": "10500084"}) == old
    # provider 번호가 기존 링크와 다르면 지금처럼 주소 일치로 바꾼다
    assert _run(old, new, "제주특별자치도 서귀포시 칠십리로 242", {"kakao": "21468173"})["url"] == new["url"]


def test_provider_number_link_refreshes_rating():
    new = {"url": PLACE["url"], "rating": 4.1}
    assert _run(PLACE, new, provider_ids={"kakao": "9479775"}) == new


def test_other_place_kept_when_row_address_missing():
    old = {"url": "https://place.map.kakao.com/1"}
    new = {"url": "https://place.map.kakao.com/2", "addresses": ["인천 서해구 청라대로 204"]}
    assert _run(old, new, "") == old


def test_first_place_link_is_stored_without_addresses():
    new = {"url": "https://place.map.kakao.com/2", "addresses": ["인천 서해구 청라대로 204"]}
    assert _run(None, new, "") == {"url": new["url"]}


def test_first_place_link_in_other_locality_is_rejected():
    # 고삼호수: 행은 고삼면 봉산리(번호 없음), 이름이 포함된 고속도로 휴게소는 같은 면 삼은리이고 1.3km 밖이다(2026-11-05)
    rest_area = {"url": "https://place.map.kakao.com/1786257507", "rating": 3.1,
                 "addresses": ["경기 안성시 고삼면 이전봉산길 224-56", "경기 안성시 고삼면 삼은리 산 15-9"],
                 "point": (37.07709125, 127.29452833)}
    assert _run(None, rest_area, "경기도 안성시 고삼면 봉산리", point=(37.0794138, 127.2797868)) is None
    assert _run(FALLBACK, rest_area, "경기도 안성시 고삼면 봉산리", point=(37.0794138, 127.2797868)) == FALLBACK


def test_first_place_link_of_natural_spot_is_stored():
    # 같은 리의 저수지: 번호 없는 주소지만 읍·면·동·리가 같다. 좌표가 없어도 받는다
    lake = {"url": "https://place.map.kakao.com/8228404", "rating": 3.9,
            "addresses": ["경기 안성시 고삼면 봉산리 495"], "point": (37.08241068, 127.28173904)}
    assert _run(None, lake, "경기도 안성시 고삼면 봉산리")["url"] == lake["url"]
    # 주소의 리가 달라도(산이 여러 리에 걸친다) 좌표가 1km 안이면 받는다
    mountain = {"url": "https://place.map.kakao.com/1", "addresses": ["충북 영동군 황간면 마산리 산 44-15"],
                "point": (36.2000, 127.9000)}
    assert _run(None, mountain, "충청북도 영동군 황간면 원촌리", point=(36.2040, 127.9000))["url"] == mountain["url"]
    assert _run(None, mountain, "충청북도 영동군 황간면 원촌리", point=(36.2200, 127.9000)) is None


def test_first_place_link_with_provider_number_is_stored():
    rest_area = {"url": "https://place.map.kakao.com/1786257507", "addresses": ["경기 안성시 고삼면 삼은리 산 15-9"]}
    assert _run(None, rest_area, "경기도 안성시 고삼면 봉산리", {"kakao": "1786257507"}) == {"url": rest_area["url"]}


def test_first_place_link_in_other_sigungu_is_rejected():
    far = {"url": "https://place.map.kakao.com/2", "addresses": ["경기 수원시 장안구 연무동 1"]}
    assert _run(None, far, "경기도 안성시 고삼면 봉산리") is None


def test_fallback_kept_when_no_place_link():
    assert _run(None, FALLBACK) == FALLBACK
    assert _run({"url": "https://map.kakao.com/link/search/x"}, FALLBACK) == FALLBACK


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
