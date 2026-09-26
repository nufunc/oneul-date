"""find_duplicate_spot 회귀 테스트: python3 test_find_duplicate_spot.py 또는 pytest (네트워크 없이 조회를 가짜로 바꾼다)"""
import re
import urllib.parse

import supabase_worker as w

ROWS = [
    {"id": 1, "name": "동궁과 월지", "address": "경상북도 경주시 원화로 102", "provider_ids": {}},
    {"id": 2, "name": "카페루시아", "address": "제주특별자치도 서귀포시 안덕면 난드르로 49-17 2층", "provider_ids": {"kakao": "1666998566"}},
    {"id": 3, "name": "주소없는집", "address": "", "provider_ids": {}},
    {"id": 4, "name": "올리오", "address": "서울 강남구 테헤란로 1", "provider_ids": {}},
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


def _dup(name, address="", pids=None):
    orig = w._get_rows
    w._get_rows = _fake_get
    try:
        return w.find_duplicate_spot("http://db", {}, name, address, pids)
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


def test_lookup_failure_is_fail_closed():
    orig = w._get_rows

    def boom(url, headers):
        raise OSError("down")
    w._get_rows = boom
    try:
        assert w.find_duplicate_spot("http://db", {}, "아무가게", "서울 중구 세종대로 1")
    finally:
        w._get_rows = orig


def test_normalize_spot_name():
    assert w.normalize_spot_name("동궁과 월지") == w.normalize_spot_name("동궁과월지")
    assert w.normalize_spot_name("카페루시아 본점") == w.normalize_spot_name("카페루시아")
    assert w.normalize_spot_name("맛점") == "맛점"  # 떼고 나서 두 글자 미만이면 떼지 않는다


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
