"""TourAPI 단독 유교 시설 관문(P-075) 회귀 테스트: python3 test_tourapi_confucian_gate.py 또는 pytest"""
from miners import tourapi_miner as m
from miners.tourapi_miner import (is_confucian_facility, is_popular_panel, kakao_query_names, should_close_confucian)

POPULAR = {"photos": 463, "kreview": 1, "blog": 80}      # 부여향교(2026-10-09 패널)
QUIET = {"photos": 54, "kreview": 0, "blog": 3}


def test_name_rule_matches_r21():
    for title in ("부여향교", "송곡서원(서산)", "봉화 계서당 종택", "OO사당", "OO묘각", "옥천 청산향교"):
        assert is_confucian_facility("12", title), title
    # 의사당과 다른 유형, 이름 중간에 든 경우는 대상이 아니다
    for ctype, title in (("12", "국회의사당"), ("14", "부여향교"), ("12", "향교마을"), ("12", "종묘")):
        assert not is_confucian_facility(ctype, title), (ctype, title)


def test_not_closed_when_condition_is_not_met():
    assert not should_close_confucian("12", "국회의사당", 0, None)
    assert not should_close_confucian("14", "부여향교", 0, None)
    assert not should_close_confucian("12", "순천향교", 3, QUIET)   # 500m 안에 열린 행이 있다


def test_popular_stays_open():
    assert not should_close_confucian("12", "부여향교", 0, POPULAR)
    for panel in ({"photos": 400}, {"kreview": 5}, {"blog": 30}):
        assert is_popular_panel(panel), panel
    for panel in ({"photos": 399, "kreview": 4, "blog": 29}, {"photos": None, "kreview": None, "blog": None}):
        assert not is_popular_panel(panel), panel


def test_quiet_or_failed_lookup_is_closed():
    assert should_close_confucian("12", "가뫼골서원", 0, QUIET)
    assert should_close_confucian("12", "가뫼골서원", 0, None)       # 카카오에서 못 찾았거나 조회 실패
    assert should_close_confucian("12", "가뫼골서원", None, None)    # 이웃 조회 실패


def test_kakao_query_names_drop_region_word_and_parens():
    assert kakao_query_names("옥천 청산향교") == ["옥천 청산향교", "청산향교"]
    assert kakao_query_names("송곡서원(서산)") == ["송곡서원"]
    assert kakao_query_names("부여향교") == ["부여향교"]


def test_gate_calls_lookups_only_for_candidates():
    calls = []
    orig = (m._open_neighbor_count, m._fetch_kakao_panel)
    m._open_neighbor_count = lambda *a: calls.append("neighbor") or 0
    m._fetch_kakao_panel = lambda *a: calls.append("panel") or QUIET
    try:
        assert not m.confucian_gate_closes("u", {}, "12", "국회의사당", "37", "127")
        assert calls == []
        assert m.confucian_gate_closes("u", {}, "12", "가뫼골서원", "37", "127")
        assert calls == ["neighbor", "panel"]
        calls.clear()
        m._open_neighbor_count = lambda *a: calls.append("neighbor") or 2
        assert not m.confucian_gate_closes("u", {}, "12", "가뫼골서원", "37", "127")
        assert calls == ["neighbor"]                                 # 이웃이 있으면 카카오를 부르지 않는다
    finally:
        m._open_neighbor_count, m._fetch_kakao_panel = orig


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
