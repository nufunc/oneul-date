"""blog_mining·auto_discovery 시군구 관문 회귀 테스트: python3 test_discovery_gate.py 또는 pytest"""
import discovery_engine
from discovery_engine import query_area_mismatch as mismatch


def test_other_district_with_same_name_is_rejected():
    """P-057 이번 유입의 시군구 불일치 6곳(쿼리, 쿼리 area, 주소)"""
    for q, area, addr in [
        ("서울 약수동 블루리본 서베이 2026 추천 맛집", "중구", "서울 성동구 성수동1가 720"),
        ("인천 굴포천 백년가게 전통 로컬 맛집", "부평구", "인천 남동구 문화서로4번길 61-14"),
        ("인천 부평역 백년가게 전통 로컬 맛집", "부평구", "인천 서해구 중봉대로612번길 10-12"),
        ("영남 남해다랭이마을 정갈한 솥밥 한정식 미식 데이트", "울산/경남", "대구 남구 현충로15길 30"),
        ("영남 남해다랭이마을 정갈한 솥밥 한정식 미식 데이트", "울산/경남", "대구 달성군 다사읍 서재본길 42"),
        ("경기 문수산 숲속 프라이빗 글램핑 캠핑", "김포시", "경기 파주시 돌곶이길 178-3"),
    ]:
        assert mismatch(q, area, addr), (q, addr)


def test_same_district_passes():
    """P-057 이번 유입에서 쿼리와 주소가 맞은 행"""
    for q, area, addr in [
        ("호남 여수돌산밤바다 낭만 포차 야시장 먹거리 데이트", "여수/순천/담양", "전남 여수시 하멜로 78"),
        ("호남 구례산수유마을 숲속 대형 베이커리 정원 카페", "보성/구례/화순", "전남 구례군 광의면 한국통신로 83-22"),
        ("영남 남해다랭이마을 정갈한 솥밥 한정식 미식 데이트", "울산/경남", "경남 남해군 남면 남면로679번길 21"),
        ("인천 부평역 백년가게 전통 로컬 맛집", "부평구", "인천 부평구 부평대로 1"),
        ("부산 해운대 광안리 오션뷰 데이트", "해운대구", "부산 수영구 광안해변로 219"),
    ]:
        assert not mismatch(q, area, addr), (q, addr)


def test_ambiguous_district_alone_is_not_checked():
    """대구 동성로의 area 중구는 여러 시도에 있어 대조하지 않는다(권역 대조만 남는다)"""
    assert not mismatch("대구 동성로 교동 LP 감성 와인바", "중구", "대구 북구 침산로 1")


def test_auto_insert_is_off_by_default():
    assert discovery_engine.DISCOVERY_AUTO_INSERT is False
    assert discovery_engine.CANDIDATE_FILE.endswith("discovery_candidates.jsonl")


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
