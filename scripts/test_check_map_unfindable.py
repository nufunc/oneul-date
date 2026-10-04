"""check_map_unfindable 회귀 테스트: python3 scripts/test_check_map_unfindable.py 또는 pytest. 값은 2026-10-03 라이브 행과 앱 검색어다."""
from check_map_unfindable import in_group, similar, variants


def test_variants():
    assert variants("시나루 양천구", "시나루", "양천구") == ["시나루"]  # 앱이 붙인 지역어를 뗀 이름 하나뿐이다
    assert variants("도치피자 성수점", "도치피자 성수점", "성동구") == ["도치피자", "성수점", "도치피자성수점"]
    assert variants("앤더슨씨 나인원한남", "앤더슨씨 나인원한남", "용산구") == ["앤더슨씨", "나인원한남", "앤더슨씨나인원한남"]


def test_similar():
    assert similar("싱글핀에일웍스 성수", "싱글핀에일웍스")
    assert not similar("로에베퍼퓸 성수", "도치피자")


def test_in_group():
    base = {"source": {"type": "web"}, "verified": False, "lat": 37.5, "lng": 127.0, "provider_ids": {}, "social_links": {}}
    assert in_group(base)
    assert not in_group({**base, "provider_ids": {"kakao": "1"}})
    assert not in_group({**base, "social_links": {"kakaomap": {"url": "https://place.map.kakao.com/273193967"}}})
    assert in_group({**base, "social_links": {"kakaomap": {"url": "https://map.kakao.com/link/search/%EC%84%9C"}}})
    assert not in_group({**base, "verified": True})
    assert in_group({**base, "verified": True, "name": "애월 한담해변 산책로"})  # R5 행은 verified와 무관하다(P-058)
    assert not in_group({**base, "source": {"type": "tourapi"}})


if __name__ == "__main__":
    test_variants()
    test_similar()
    test_in_group()
    print("ok")
