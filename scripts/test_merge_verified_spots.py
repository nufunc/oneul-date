"""merge_verified_spots 계획 회귀 테스트: python3 scripts/test_merge_verified_spots.py 또는 pytest. 값은 2026-10-04 라이브 행을 줄인 것이다."""
from merge_verified_spots import fix_body, fix_list, keep_fix_patch, plan


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


def test_plan_p101_pairs():
    result = {"merge": [{"keep": 3905, "close": 4821, "rows": [{"id": 3905, "name": "진미통닭"}, {"id": 4821, "name": "수원 행궁동 통닭거리 진미통닭"}]},
                        {"keep": 1331, "close": 9501, "rows": [{"id": 1331, "name": "카페 포"}, {"id": 9501, "name": "여수카페포"}]}]}
    rows = {3905: {"id": 3905, "name": "진미통닭", "is_closed": False, "category": "치킨", "hours": None},
            4821: {"id": 4821, "name": "수원 행궁동 통닭거리 진미통닭", "is_closed": False, "category": "한식", "hours": "12:00"},
            1331: {"id": 1331, "name": "카페 포", "is_closed": True},
            9501: {"id": 9501, "name": "여수카페포", "is_closed": False}}
    merges, _, skipped = plan("P-101", result, rows)
    assert [(m["keep"]["id"], [d["id"] for d in m["dups"]]) for m in merges] == [(3905, [4821])]
    assert merges[0]["fill"] == {"hours": "12:00"} and skipped == {9501: "남길 행 1331 닫힘"}


def test_fix_body_kakao_address_category():
    row = {"id": 518, "name": "울트라마린", "address": "제주특별자치도 제주시 한경면 판포리 1611-3", "area": "제주시",
           "category": "카페", "provider_ids": {}, "source": {"note": "n"}, "social_links": {}}
    body = fix_body(row, {"name": "우투아", "category": "카페", "kakao": "1697574060", "address": "제주특별자치도 제주시 한경면 일주서로 4611",
                          "lat": 33.36, "lng": 126.2}, "20261004-090000", "now", "P-056")
    assert body["name"] == "우투아" and body["provider_ids"] == {"kakao": "1697574060"} and (body["lat"], body["lng"]) == (33.36, 126.2)
    assert body["social_links"] == {"kakaomap": {"url": "https://place.map.kakao.com/1697574060"}}
    assert body["source"]["note"] == ("n | renamed: P-056 울트라마린 (20261004) | fixed: P-056 kakao None→1697574060, address "
                                      "제주특별자치도 제주시 한경면 판포리 1611-3→제주특별자치도 제주시 한경면 일주서로 4611 (20261004)"
                                      " | fixed: P-056 category 카페→카페, lat None→33.36, lng None→126.2 (20261004)")
    assert fix_body(row, {"category": "중식"}, "20261004-090000", "now", "P-055")["category"] == "중식"  # P-055 꼴은 그대로


def test_p548_merge_fills_parking_and_fix_is_idempotent():
    rows = {1789407849101: {"id": 1789407849101, "name": "덕수궁", "is_closed": False, "category": "고궁,궁", "closed_days": [],
                            "parking_info": {"type": "unknown"}, "curation_badges": {}},
            1790386510260: {"id": 1790386510260, "name": "덕수궁 대한문", "is_closed": False, "category": "관광지", "closed_days": ["월요일"],
                            "parking_info": {"type": "impossible", "detail": "불가"}, "curation_badges": {"tour_api": "한국관광공사 관광정보"}},
            5996: {"id": 5996, "name": "덕수궁돌담길", "is_closed": False, "address": "서울 중구 덕수궁길 15", "lat": 37.56456211,
                   "lng": 126.97560817, "category": "전망대", "price": "정동전망대 무료", "image_url": "k"},
            3168: {"id": 3168, "name": "덕수궁 돌담길 예술장터", "is_closed": False, "address": "서울 중구 덕수궁길 15", "lat": 37.5677154,
                   "lng": 126.9744616, "category": "전망대", "price": "전통 모티브 공예품 15,000원~"}}
    merges, _, _ = plan("P-548", {}, rows)
    assert merges[0]["fill"] == {"closed_days": ["월요일"], "parking_info": {"type": "impossible", "detail": "불가"},
                                 "curation_badges": {"tour_api": "한국관광공사 관광정보"}}
    skipped = {}
    fixes = fix_list("P-548", {}, rows, skipped)
    assert [f["row"]["id"] for f in fixes] == [5996, 3168] and skipped == {}
    assert set(fixes[0]["patch"]) == {"address", "lat", "lng", "category", "price", "image_url"}
    assert fixes[1]["patch"] == {"address": "서울 중구 세종대로19길 24", "category": "도보여행"}  # 3168 좌표는 이미 맞고 가격은 건드리지 않는다
    for f in fixes:
        rows[f["row"]["id"]].update(f["patch"])
    rows[1790386510260]["is_closed"] = True
    assert fix_list("P-548", {}, rows, {}) == [] and plan("P-548", {}, rows)[0] == []  # 재실행은 아무것도 쓰지 않는다


if __name__ == "__main__":
    test_keep_fix_patch()
    test_plan_skips_closed_and_changed()
    test_plan_p101_pairs()
    test_p548_merge_fills_parking_and_fix_is_idempotent()
    test_fix_body_kakao_address_category()
    print("ok")
