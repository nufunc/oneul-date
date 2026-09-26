"""find_duplicate_spot 회귀 테스트: python3 test_find_duplicate_spot.py 또는 pytest (네트워크 없이 조회를 가짜로 바꾼다)"""
import re
import urllib.parse

import supabase_worker as w

ROWS = [
    {"id": 1, "name": "동궁과 월지", "address": "경상북도 경주시 원화로 102", "provider_ids": {}},
    {"id": 2, "name": "카페루시아", "address": "제주특별자치도 서귀포시 안덕면 난드르로 49-17 2층", "provider_ids": {"kakao": "1666998566"}},
    {"id": 3, "name": "주소없는집", "address": "", "provider_ids": {}},
    {"id": 4, "name": "올리오", "address": "서울 강남구 테헤란로 1", "provider_ids": {}},
    {"id": 5, "name": "서울베이글", "address": "경기도 성남시 분당구 판교역로10번길 22", "provider_ids": {},
     "lat": 37.38496646, "lng": 127.1119794},
]


def _fake_get(url, headers):
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    if any(k.startswith("provider_ids->>") for k in q):
        key = next(k for k in q if k.startswith("provider_ids->>"))
        prov, val = key.split("->>")[1], q[key][0][3:]
        return [r for r in ROWS if r["provider_ids"].get(prov) == val][:1]
    if "or" in q:
        names = re.findall(r'name\.eq\."([^"]*)"', q["or"][0])
        return [r for r in ROWS if r["name"] in names]
    if "name" in q:
        core = q["name"][0][len("ilike."):].replace("*", "")
        return [r for r in ROWS if all(ch in r["name"].replace(" ", "") for ch in core)]
    return []


def _dup(name, address="", pids=None, lat=None, lng=None):
    orig = w._get_rows
    w._get_rows = _fake_get
    try:
        return w.find_duplicate_spot("http://db", {}, name, address, pids, lat, lng)
    finally:
        w._get_rows = orig


def test_same_place_id_is_duplicate_even_with_other_name():
    assert _dup("전혀다른이름", "서울 중구 세종대로 1", {"kakao": "1666998566"})


def test_spacing_and_branch_suffix_variants_with_same_address():
    assert _dup("동궁과월지", "경북 경주시 원화로 102")
    assert _dup("카페루시아 본점", "제주특별자치도 서귀포시 안덕면 난드르로 49-17")


def test_variant_name_at_other_address_is_not_duplicate():
    assert not _dup("동궁과월지", "서울 강남구 테헤란로 1")


def test_existing_row_without_address_blocks_same_name():
    assert _dup("주소없는집", "서울 마포구 와우산로 1")


def test_exact_name_other_branch_is_not_duplicate():
    assert not _dup("올리오", "부산 해운대구 달맞이길 30")


def test_same_name_within_50m_is_duplicate_even_with_other_lot_number():
    # 서울베이글: 번지 22와 14-3, 좌표는 같은 곳(2026-09-26 discovery 재삽입)
    assert _dup("서울베이글", "경기 성남시 분당구 판교역로10번길 14-3", None, 37.3849664568, 127.1119794013)
    assert _dup("서울 베이글", "경기 성남시 분당구 판교역로10번길 14-3", None, 37.38497, 127.11198)


def test_same_name_far_away_is_not_duplicate():
    assert not _dup("서울베이글", "경기 성남시 분당구 판교역로 99", None, 37.40, 127.13)


def test_lookup_failure_is_fail_closed():
    orig = w._get_rows

    def boom(url, headers):
        raise OSError("down")
    w._get_rows = boom
    try:
        assert w.find_duplicate_spot("http://db", {}, "아무가게", "서울 중구 세종대로 1")
    finally:
        w._get_rows = orig


def test_place_name_matches_for_worker():
    # run_worker가 같은 건물의 다른 가게 속성을 옮기지 않도록 이름을 대조한다(2026-09-27 롯데슈퍼프레시 사례)
    assert w.place_name_matches("청주 데어데어 베이커리", "데어데어")
    assert not w.place_name_matches("세종 써밋뷰 루프탑라운지", "롯데슈퍼프레시 세종점")
    assert not w.place_name_matches("전주 서학예술마을 갤러리카페 산들다헌", "서학예술마을도서관")


def test_normalize_spot_name():
    assert w.normalize_spot_name("동궁과 월지") == w.normalize_spot_name("동궁과월지")
    assert w.normalize_spot_name("카페루시아 본점") == w.normalize_spot_name("카페루시아")
    assert w.normalize_spot_name("맛점") == "맛점"  # 떼고 나서 두 글자 미만이면 떼지 않는다


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
