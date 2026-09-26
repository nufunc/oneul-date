"""같은 좌표·핵심 이름 병합 규칙 회귀 테스트: python3 test_merge_samecoord.py 또는 pytest"""
from merge_duplicates import find_samecoord_groups
from supabase_worker import spot_core_name


def _r(i, name, address="강원 속초시 중앙로 1", lat=38.2, lng=128.59, kakao=None):
    return {"id": i, "name": name, "address": address, "lat": lat, "lng": lng, "provider_ids": {"kakao": kakao} if kakao else {}}


def test_core_name_strips_region_and_generic_words():
    addr = "강원 춘천시 동면 순환대로 1"
    assert spot_core_name("춘천 산토리니 카페", addr) == spot_core_name("산토리니", addr) == "산토리니"
    # 붙여 쓴 지역어('춘천산토리니')는 떼지 못한다(알려진 한계)
    assert spot_core_name("카메라타 음악감상실") == "카메라타"


def test_same_coord_same_core_is_grouped_even_with_other_lot_number():
    groups = find_samecoord_groups([_r(1, "칠성조선소"), _r(2, "속초 칠성조선소", "강원 속초시 중앙로 3")], set())
    assert [[r["id"] for r in g] for g in groups] == [[1, 2]]


def test_lodging_word_on_one_side_or_kakao_conflict_is_not_grouped():
    assert find_samecoord_groups([_r(1, "바람의언덕"), _r(2, "바람의언덕 샬레")], set()) == []
    assert find_samecoord_groups([_r(1, "모이핀", kakao="1"), _r(2, "모이핀", kakao="2")], set()) == []


def test_far_apart_is_not_grouped():
    assert find_samecoord_groups([_r(1, "칠성조선소"), _r(2, "칠성조선소", lat=38.21)], set()) == []


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
