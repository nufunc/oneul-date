"""check_map_unfindable 회귀 테스트: python3 scripts/test_check_map_unfindable.py 또는 pytest. 값은 2026-10-03 라이브 행과 앱 검색어다."""
from check_map_unfindable import TYPE_WORDS, app_queries, in_group, similar, similar_k, stale_naver, variants


def test_variants():
    assert variants("시나루 양천구", "시나루", "양천구") == ["시나루"]  # 앱이 붙인 지역어를 뗀 이름 하나뿐이다
    assert variants("도치피자 성수점", "도치피자 성수점", "성동구") == ["도치피자", "성수점", "도치피자성수점"]
    assert variants("앤더슨씨 나인원한남", "앤더슨씨 나인원한남", "용산구") == ["앤더슨씨", "나인원한남", "앤더슨씨나인원한남"]


def test_similar():
    assert similar("싱글핀에일웍스 성수", "싱글핀에일웍스")
    assert not similar("로에베퍼퓸 성수", "도치피자")


def test_similar_k():
    # 지점 꼬리만 겹치는 다른 업장은 같지 않다(P-062 2903). 같은 상호의 다른 지점은 같다
    assert similar("그믐달셀프스튜디오 전주신시가지점", "잼클라이밍 전주신시가지점")
    assert not similar_k("그믐달셀프스튜디오 전주신시가지점", "잼클라이밍 전주신시가지점")
    assert similar_k("잼클라이밍 전주점", "잼클라이밍 전주신시가지점")
    assert similar_k("본점", "본점")  # 떼고 2자 미만이면 그대로 견준다
    assert "책방" in TYPE_WORDS and "바" in TYPE_WORDS  # 책방 이음, 바 무사의 첫 어절은 카카오로 찾지 않는다


def test_stale_naver():
    hits = {"1#0": {"q": "서른책방 영통구"}, "1#1": {"q": "서른 책방"}, "2#0": {"q": "터칭북스"}, "3#0": {"q": "다른 행"}}
    plan_q = {1: ["서른책방 영통구", "서른책방"], 2: ["터칭북스"]}
    assert stale_naver(hits, plan_q) == ["1#1"]  # 이번 대상이 아닌 3#0은 건드리지 않는다


def test_in_group():
    base = {"source": {"type": "web"}, "verified": False, "lat": 37.5, "lng": 127.0, "provider_ids": {}, "social_links": {}}
    assert in_group(base)
    assert not in_group({**base, "provider_ids": {"kakao": "1"}})
    assert not in_group({**base, "social_links": {"kakaomap": {"url": "https://place.map.kakao.com/273193967"}}})
    assert in_group({**base, "social_links": {"kakaomap": {"url": "https://map.kakao.com/link/search/%EC%84%9C"}}})
    assert in_group({**base, "verified": True, "name": "몽까페"})  # verified와 무관하다(P-064)
    assert in_group({**base, "verified": True, "name": "애월 한담해변 산책로"})  # R5 행(P-058)
    assert not in_group({**base, "source": {"type": "tourapi"}})


def test_app_queries():
    rows = [{"id": 7168, "name": "태안 풀빌라 케럿", "area": "태안군", "region": "충청", "address": "충남 태안군 근흥면 갈음이길 234-7"},
            {"id": 2588, "name": "여주 온실카페 무이숲", "area": "여주시", "region": "경기", "address": "경기 여주시 매화둔전로 30-15"},
            {"id": 6107, "name": "아산 스파비스", "area": "아산시", "region": "충청", "address": "충남 아산시 음봉면 아산온천로 157-29"},
            {"id": 1790854410571, "name": "2·28 기념중앙공원", "area": "중구", "region": "영남", "address": "대구 중구 공평동 2-1"}]
    # 지역어만 남지 않는다(P-061). 수식어 뒤 상호를 붙이고, 뒤가 없으면 자르지 않는다. 숫자 사이 가운뎃점은 온점이다
    assert app_queries(rows) == {7168: "태안 케럿", 2588: "여주 무이숲", 6107: "아산 스파비스", 1790854410571: "2.28 기념중앙공원"}


if __name__ == "__main__":
    test_variants()
    test_similar()
    test_similar_k()
    test_stale_naver()
    test_in_group()
    test_app_queries()
    print("ok")
