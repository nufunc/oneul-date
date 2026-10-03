"""merge_verified_spots 계획 회귀 테스트: python3 scripts/test_merge_verified_spots.py 또는 pytest. 값은 2026-10-04 라이브 행을 줄인 것이다."""
from merge_verified_spots import keep_fix_patch, plan


def test_keep_fix_patch():
    row = {"id": 2405, "name": "베이커리씨어터", "address": "경기 남양주시 화도읍 경춘로2696번길 4-15", "area": "남양주시",
           "provider_ids": {"kakao": "377836008"}, "source": {"note": "n"},
           "social_links": {"kakaomap": {"url": "https://place.map.kakao.com/377836008", "rating": 4.2}, "youtube": {"url": "y"}}}
    body = keep_fix_patch(row, {"kakao": "1877911730"}, "20261004-090000", "now", "P-053")
    assert body["provider_ids"] == {"kakao": "1877911730"}
    assert body["social_links"] == {"kakaomap": {"url": "https://place.map.kakao.com/1877911730"}, "youtube": {"url": "y"}}  # 옛 평점은 버린다
    assert body["source"]["note"] == "n | fixed: P-053 kakao 377836008→1877911730 (20261004)"
    cleared = keep_fix_patch(row, {"kakao": None}, "20261004-090000", "now", "P-053")
    assert cleared["provider_ids"] == {} and "kakaomap" not in cleared["social_links"]
    moved = keep_fix_patch({**row, "address": "대구 중구 동성로 19-3 3층", "area": "중구"}, {"address": "대구 중구 동성로6길 45"},
                           "20261004-090000", "now", "P-053")
    assert moved["address"] == "대구 중구 동성로6길 45" and "area" not in moved  # 시군구가 같으면 area는 그대로


def test_plan_skips_closed_and_changed():
    result = {"merge": [{"keep": {"id": 1, "name": "르라보 성수"},
                         "merge": [{"id": 2, "name": "르라보 성수 플래그십"}, {"id": 3, "name": "르라보 성수 플래그십스토어"}]}]}
    rows = {1: {"id": 1, "name": "르라보 성수", "is_closed": False, "category": "향수", "hours": None},
            2: {"id": 2, "name": "르라보 성수 플래그십", "is_closed": False, "category": None, "hours": "10:00"},
            3: {"id": 3, "name": "르라보 성수 플래그십스토어", "is_closed": True}}
    merges, fills, skipped = plan("P-053", result, rows)
    assert [d["id"] for d in merges[0]["dups"]] == [2] and skipped == {3: "닫힘"}
    assert merges[0]["fill"] == {"hours": "10:00"}  # category는 옮기지 않는다
    assert fills == []


if __name__ == "__main__":
    test_keep_fix_patch()
    test_plan_skips_closed_and_changed()
    print("ok")
