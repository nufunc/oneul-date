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


def _run(existing_kakao, searched):
    """스팟 한 곳으로 소셜 동기화를 돌리고 DB에 보낸 social_links.kakaomap을 돌려준다."""
    spot = {"id": 1791660755259, "name": "소수서원", "location": "영남 영주시", "address": "경북 영주시 순흥면 소백로 2740",
            "social_links": {"kakaomap": existing_kakao} if existing_kakao else {}, "metrics": {}, "summary": "s"}
    patches = []

    def urlopen(req, timeout=0):
        if req.get_method() == "PATCH":
            patches.append(json.loads(req.data))
            return _Res(b"")
        return _Res(json.dumps([spot]).encode())

    saved = (e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep, fix_spot_summaries.is_bad_summary)
    e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place = urlopen, lambda *a: None, lambda *a: searched
    e.time.sleep, fix_spot_summaries.is_bad_summary = lambda *a: None, lambda *a: False
    try:
        e.run_social_enrichment("http://db", "key", 1)
    finally:
        (e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep, fix_spot_summaries.is_bad_summary) = saved
    assert len(patches) == 1, patches
    return patches[0]["social_links"].get("kakaomap")


def test_fallback_does_not_overwrite_place_link():
    assert _run(PLACE, FALLBACK) == PLACE


def test_new_place_link_replaces_old():
    new = {"url": "https://place.map.kakao.com/123", "rating": 4.1}
    assert _run(PLACE, new) == new


def test_fallback_kept_when_no_place_link():
    assert _run(None, FALLBACK) == FALLBACK
    assert _run({"url": "https://map.kakao.com/link/search/x"}, FALLBACK) == FALLBACK


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
