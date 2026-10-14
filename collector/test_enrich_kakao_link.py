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


def _run(existing_kakao, searched, address="경북 영주시 순흥면 소백로 2740"):
    """스팟 한 곳으로 소셜 동기화를 돌리고 DB에 보낸 social_links.kakaomap을 돌려준다."""
    spot = {"id": 1791660755259, "name": "소수서원", "location": "영남 영주시", "row_address": address,
            "social_links": {"kakaomap": existing_kakao} if existing_kakao else {}, "metrics": {}, "summary": "s"}
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


def test_other_place_kept_when_row_address_missing():
    old = {"url": "https://place.map.kakao.com/1"}
    new = {"url": "https://place.map.kakao.com/2", "addresses": ["인천 서해구 청라대로 204"]}
    assert _run(old, new, "") == old


def test_first_place_link_is_stored_without_addresses():
    new = {"url": "https://place.map.kakao.com/2", "addresses": ["인천 서해구 청라대로 204"]}
    assert _run(None, new, "") == {"url": new["url"]}


def test_fallback_kept_when_no_place_link():
    assert _run(None, FALLBACK) == FALLBACK
    assert _run({"url": "https://map.kakao.com/link/search/x"}, FALLBACK) == FALLBACK


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
