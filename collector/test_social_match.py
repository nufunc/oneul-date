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


# P-162 23쌍과 P-164 9쌍: 행 이름과 바꾸기 전 링크 장소 이름(부속 시설)
ACCESSORY_PAIRS = [
    ("어반리ST 동탄", "어반리ST동탄 점 주차"), ("임금님쌀밥집", "임금님쌀밥집 주차장"),
    ("계룡산 수통골", "계룡산 수통골주차장분기점"), ("새벽집 청담점", "새벽집청담점 주차장"),
    ("우주측지관측센터", "우주측지관측센터 주차장1"), ("태백시 문화예술회관", "태백시문화예술회관 주차장1"),
    ("탑클라우드호텔(광주점)", "탑클라우드호텔 전용주차장"), ("롯데호텔 L7홍대", "G car zone 롯데호텔L7 홍대"),
    ("신륵사(제천)", "신륵사 주차장"), ("오대산 선재길", "오대산선재길 주차장"), ("제주항", "제주항주유소"),
    ("동대문역사문화공원", "동대문역사문화공원역 2호선"), ("단내 성가정 성지", "단내성가정성지 주차장"),
    ("연트럴파크", "연트럴파크민영주차장"), ("남산야외식물원", "남산야외식물원 주차장"),
    ("경의선책거리", "GS25 경의선책거리점"), ("계양산 둘레길", "CU 계양산둘레길점"),
    ("계양경기장", "계양경기장 양궁장주차장"), ("부평모두몰(부평지하도상가)", "부평모두몰 11번출구"),
    ("미사한강공원2호", "미사한강공원 2호주차장"), ("양평수목원캠핑장", "양평수목원 캠핑장 입구"),
    ("소양강댐", "소양강댐 주차장"), ("푸른숲캠핑장", "푸른숲캠핑장 관리실"),
    ("클라로", "클라로 주차장"), ("달맞이동산", "달맞이동산주차장"),
    ("순천만국가정원 관람차", "순천만국가정원 관람차매표소"),
    ("다대포 해변공원 몰운대", "다대포해변공원 몰운대 공영주차장"),
    ("가야랜드달빛야영장", "가야랜드 달빛야영장화장실"), ("덕하시장", "덕하시장 공중화장실"),
    ("정관신도시시장", "CU 정관신도시시장점"), ("어반우드", "어반우드테라스 주차장"),
    ("롯데월드", "롯데월드 쏘카존"),
]


def test_kakaomap_skips_accessory_place():
    for spot, place in ACCESSORY_PAIRS:
        assert k._pick_place([{"name": place}], spot, "") is None, (spot, place)
    body = {"name": "덕하공설시장 공중화장실"}, {"name": "덕하공설시장", "confirmid": "18525260"}
    assert k._pick_place(list(body), "덕하공설시장", "")["confirmid"] == "18525260"


def test_kakaomap_keeps_place_when_spot_name_is_accessory_too():
    # 행 이름도 걸리면 건너뛰지 않는다(P-164 예외 6행). 끝의 '점'을 떼지 않아 '서울대입구점'은 '입구'로 끝나지 않는다
    for name in ["낙원입구", "답동성당 사무실", "수륙양용시티투어버스 매표소", "김촌 서울대입구점", "담양 LP음악충전소"]:
        assert k._pick_place([{"name": name}], name, "") is not None, name
    assert k._pick_place([{"name": "김촌 서울대입구점"}], "김촌", "") is not None
    # 케이블카 정류장·승강장은 그 자체가 장소라 거르지 않는다
    assert k._pick_place([{"name": "여수해상케이블카 자산정류장"}], "여수 해상케이블카", "") is not None
    assert k._pick_place([{"name": "목포해상케이블카 유달산승강장"}], "목포 해상케이블카", "") is not None


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
    assert _yt("꺼거 본점", "용산 대박맛집 (꺼거, 웨이팅꿀팁) 데이트") is not None
    assert _yt("대흥식당", "대흥역 카페부터 맛집까지 데이트") is None


def test_youtube_title_keeps_name_after_60_chars():
    # 판정한 제목을 그대로 저장한다. 60자로 자르면 61자 뒤 이름이 빠져 화면이 이름 없는 영상으로 본다(P-211)
    title = "여기 한국 맞아? 나만 알고 싶은 곡성 여행 코스 가볼만한곳 Top5 곡성역, 섬진강 기차마을 증기기관차, 테라밸리, 동화정원, 침실습지 전망대 등!"
    assert _yt("침실습지", title)["title"] == title


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
