"""소셜 마이너 이름 대조 회귀 테스트: python3 test_social_match.py 또는 pytest (네트워크 없이 검색 응답을 가짜로 바꾼다)"""
import io
import json

from miners import kakaomap_miner as k
from miners import youtube_miner as yt

PLACES = [{"name": "베르트", "new_address": "경기 부천시 원미구 신흥로 178", "confirmid": "1"},
          {"name": "베르트", "new_address": "광주 동구 동계천로 137-7", "confirmid": "2"},
          {"name": "성수동대림창고갤러리", "new_address": "서울 성동구 성수이로 78", "confirmid": "3"}]


def test_kakaomap_picks_same_province_name_match():
    assert k._pick_place(PLACES, "베르트", "광주 동구")["confirmid"] == "2"
    assert k._pick_place(PLACES, "베르트", "호남 동구")["confirmid"] == "1"  # 권역 이름만 있으면 시·도 대조를 하지 않는다
    assert k._pick_place(PLACES[:1], "베르트", "광주 동구") is None
    assert k._pick_place([{"name": "뚜오미오 팝업", "new_address": "서울 성동구 성수이로 74"}], "대림창고", "서울 성동구") is None


class _Res(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


def _yt(spot_name, title):
    data = {"contents": {"twoColumnSearchResultsRenderer": {"primaryContents": {"sectionListRenderer": {"contents": [
        {"itemSectionRenderer": {"contents": [{"videoRenderer": {
            "videoId": "aaaaaaaaaaa", "title": {"runs": [{"text": title}]},
            "ownerText": {"runs": [{"text": "데이트 브이로그"}]},
            "viewCountText": {"simpleText": "조회수 50,000회"}, "publishedTimeText": {"simpleText": "1개월 전"}}}]}}]}}}}}
    html = "<script>var ytInitialData = " + json.dumps(data, ensure_ascii=False) + ";</script>"
    orig = yt.urllib.request.urlopen
    yt.urllib.request.urlopen = lambda req, timeout=None: _Res(html.encode("utf-8"))
    try:
        return yt.search_youtube_hotclip(spot_name, "서울")
    finally:
        yt.urllib.request.urlopen = orig


def test_youtube_short_core_name_does_not_match_other_word():
    assert _yt("흑백식당", "흑백요리사 셰프 맛집 투어 vlog") is None
    assert _yt("흑백식당", "흑백식당 데이트 vlog") is not None


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
