"""번호 소유 관문과 이름 판정 거리 상한 회귀 테스트(P-145): python3 test_provider_number_gate.py 또는 pytest (네트워크 없이 조회를 가짜로 바꾼다)"""
import io
import json
import os

import enrich_worker as e
import supabase_worker as w

SPOT = {"id": 508, "name": "가리왕산", "address": "강원 정선군 정선읍 1", "region": "강원", "area": "정선군", "location": "강원 정선군",
        "category": "관광지", "slot": "day", "fail_count": 0, "verified": True, "summary": "s", "provider_ids": {},
        "lat": 37.4600, "lng": 128.5400, "image_url": "https://t1.daumcdn.net/a.jpg"}
CABLE_CAR = {"id": "22222", "provider": "kakao", "name": "정선가리왕산케이블카 숙암역", "roadAddress": "강원 정선군 남면 가리왕산로 1",
             "category": "관광,명소", "x": "128.5400", "y": "37.5000", "thumUrl": None}  # 약 4.4km 북쪽
NEAR_CABLE_CAR = dict(CABLE_CAR, y="37.4610")  # 약 110m


class _Res(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


def _with_owners(owners, fn):
    """provider_ids 소유 조회가 owners를 돌려주게 하고 fn을 실행한다. owners가 예외면 조회 실패다."""
    env = {k: os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")}
    orig = w._get_rows
    os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"] = "http://db", "k"

    def fake(url, headers):
        if "provider_ids->>" not in url:
            return []  # 사진 관문 등 다른 조회
        assert "is_closed=eq.false" in url
        if isinstance(owners, Exception):
            raise owners
        return owners
    w._get_rows = fake
    try:
        return fn()
    finally:
        w._get_rows = orig
        for k, v in env.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)


def _run_worker(places, spot=None):
    spot = spot or SPOT
    patches = []

    def fake_urlopen(req, timeout=None, **kw):
        if getattr(req, "method", "GET") == "PATCH":
            patches.append(json.loads(req.data.decode("utf-8")))
            return _Res(b"")
        return _Res(json.dumps([dict(spot)]).encode("utf-8"))

    orig = (w.urllib.request.urlopen, w.search_naver, w.time.sleep)
    w.urllib.request.urlopen, w.search_naver, w.time.sleep = fake_urlopen, lambda q, limit=3: places, lambda s: None
    try:
        w.run_worker("http://db", "key", limit=1)
    finally:
        w.urllib.request.urlopen, w.search_naver, w.time.sleep = orig
    return patches[0]


def test_number_owned_by_other_open_row():
    assert _with_owners([{"id": 9}], lambda: w.provider_number_owned_elsewhere("kakao", "22222", 508)) is True


def test_own_row_is_not_another_row():
    assert _with_owners([{"id": 508}], lambda: w.provider_number_owned_elsewhere("kakao", "22222", 508)) is False


def test_lookup_failure_does_not_block():
    assert _with_owners(OSError("down"), lambda: w.provider_number_owned_elsewhere("kakao", "22222", 508)) is False


def test_without_env_does_not_block():
    assert w.provider_number_owned_elsewhere("kakao", "22222", 508) is False


def test_run_worker_writes_free_number():
    patch = _with_owners([], lambda: _run_worker([NEAR_CABLE_CAR], dict(SPOT, name="정선가리왕산케이블카 숙암역")))
    assert patch["provider_ids"] == {"kakao": "22222"}


def test_run_worker_skips_number_owned_by_other_open_row():
    patch = _with_owners([{"id": 9}], lambda: _run_worker([NEAR_CABLE_CAR], dict(SPOT, name="정선가리왕산케이블카 숙암역")))
    assert patch.get("verified") is True  # 이름이 맞는 결과라 영업 확인은 그대로 한다
    assert "provider_ids" not in patch


def test_run_worker_keeps_number_the_row_already_has():
    spot = dict(SPOT, name="정선가리왕산케이블카 숙암역", provider_ids={"kakao": "22222"})
    patch = _with_owners([{"id": 9}], lambda: _run_worker([NEAR_CABLE_CAR], spot))
    assert patch["provider_ids"] == {"kakao": "22222"}


def test_containment_over_1km_is_not_a_name_match():
    assert w.place_name_matches("가리왕산", "정선가리왕산케이블카 숙암역", None)  # 거리를 모르면 종전대로
    assert w.place_name_matches("가리왕산", "정선가리왕산케이블카 숙암역", 900)
    assert not w.place_name_matches("가리왕산", "정선가리왕산케이블카 숙암역", 4388)


def test_far_containment_result_does_not_give_number():
    patch = _with_owners([], lambda: _run_worker([CABLE_CAR]))
    assert "provider_ids" not in patch and "verified" not in patch


def test_place_distance_needs_both_coordinates():
    assert 4300 < w.place_distance_m(SPOT, CABLE_CAR) < 4500
    assert w.place_distance_m({"id": 1}, CABLE_CAR) is None
    assert w.place_distance_m(SPOT, {"name": "x"}) is None


def test_keep_place_link_skips_number_owned_elsewhere():
    old = {"url": "https://place.map.kakao.com/7878763"}
    new = {"url": "https://place.map.kakao.com/22222", "rating": 4.1, "addresses": ["강원 정선군 남면 가리왕산로 1"]}
    assert _with_owners([{"id": 9}], lambda: e.keep_place_link(dict(new), old, "강원 정선군 남면 가리왕산로 1", 508)) == old
    assert _with_owners([{"id": 9}], lambda: e.keep_place_link(dict(new), None, "", 508)) is None
    out = _with_owners([], lambda: e.keep_place_link(dict(new), old, "강원 정선군 남면 가리왕산로 1", 508))
    assert out["url"] == new["url"]


def test_keep_place_link_refreshes_own_number():
    same = {"url": "https://place.map.kakao.com/22222", "rating": 4.1}
    out = _with_owners([{"id": 9}], lambda: e.keep_place_link(dict(same), {"url": same["url"]}, "", 508))
    assert out["rating"] == 4.1


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
