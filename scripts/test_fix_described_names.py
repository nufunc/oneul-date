"""fix_described_names 판정 회귀 테스트: python3 scripts/test_fix_described_names.py 또는 pytest. 값은 2026-10-03 라이브 행과 네이버 결과다."""
from fix_described_names import addr_keys, query_variants, rename_body, same_name


def test_same_name():
    assert same_name("화성궐리사", "궐리사")  # 앞에 지역 두 글자가 붙은 공식 이름
    assert same_name("국립유명산자연휴양림자생식물원", "유명산자연휴양림 자생식물원")
    assert not same_name("메가MGC커피 천안신부문화거리점", "신부문화거리")  # 거리 이름을 단 카페는 그 거리가 아니다
    assert not same_name("블렌디 스튜디오", "베이킹공방")


def test_addr_keys():
    db = addr_keys("서울 영등포구 여의공원로 68 여의도공원 잔디마당")
    assert db & addr_keys("서울특별시 영등포구 여의공원로 68-1 서울달")  # 부번만 다르면 같은 자리로 본다
    assert not db & addr_keys("서울특별시 영등포구 여의공원로 101")
    assert addr_keys("경기도 오산시 궐동 141") & addr_keys("경기도 오산시 궐동 141-2")


def test_query_variants():
    assert query_variants("서울달 계류식 가스기구", "서울 영등포구 여의공원로 68")[0] == "서울달"
    assert "르라보 성수" in query_variants("르라보 성수 플래그십스토어", "서울 성동구 성수이로 1")
    assert "무인양품 동탄점" in query_variants("무인양품 타임테라스 동탄점", "경기 화성시 동탄구 동탄대로 1")


def test_rename_body():
    row = {"id": 1, "name": "서울달 계류식 가스기구", "source": {"type": "web", "note": "Live_Research.md"},
           "social_links": {"kakaomap": {"url": "https://map.kakao.com/link/search/%EC%84%9C"}, "youtube": {"url": "y"}}}
    body = rename_body(row, "서울달", "20261003-220000", "now")
    assert body["name"] == "서울달"
    assert body["source"]["note"] == "Live_Research.md | renamed: P-049 서울달 계류식 가스기구 (20261003)"
    assert body["social_links"] == {"youtube": {"url": "y"}}  # 옛 이름 검색 링크만 지운다
    place = {**row, "social_links": {"kakaomap": {"url": "https://place.map.kakao.com/273193967", "rating": 4.1}}}
    assert "social_links" not in rename_body(place, "서울달", "20261003-220000", "now")


if __name__ == "__main__":
    test_same_name()
    test_addr_keys()
    test_query_variants()
    test_rename_body()
    print("ok")
