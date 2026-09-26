"""run_worker 이름 대조 회귀 테스트: python3 test_run_worker_trust.py 또는 pytest (네트워크 없이 조회·PATCH를 가짜로 바꾼다)"""
import io
import json

import supabase_worker as w

SPOT = {"id": 8585, "name": "양평 샬레 트리", "address": "경기 양평군 양평읍 양평로 1", "region": "경기",
        "area": "양평군", "location": "경기 양평군", "category": "펜션", "slot": "stay", "fail_count": 2,
        "verified": False, "summary": "숲속 샬레에서 보내는 조용한 하룻밤", "provider_ids": {}}
HEALTH_CENTER = {"id": "11111", "provider": "kakao", "name": "양평군보건소", "roadAddress": "경기 양평군 양평읍 양평로 1",
                 "category": "보건소", "x": "127.48", "y": "37.49", "thumUrl": None}


class _Res(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


def _run(places):
    patches = []

    def fake_urlopen(req, timeout=None, **kw):
        if getattr(req, "method", "GET") == "PATCH":
            patches.append(json.loads(req.data.decode("utf-8")))
            return _Res(b"")
        return _Res(json.dumps([dict(SPOT)]).encode("utf-8"))

    orig = (w.urllib.request.urlopen, w.search_naver, w.time.sleep)
    w.urllib.request.urlopen, w.search_naver, w.time.sleep = fake_urlopen, lambda q, limit=3: places, lambda s: None
    try:
        w.run_worker("http://db", "key", limit=1)
    finally:
        w.urllib.request.urlopen, w.search_naver, w.time.sleep = orig
    return patches[0]


def test_unmatched_result_does_not_verify_or_reset_fail_count():
    # 보건소 결과로 '영업 중'을 확인하지 않는다(2026-09-27 8585 양평 샬레 트리 → 양평군보건소)
    patch = _run([HEALTH_CENTER])
    assert "verified" not in patch and "fail_count" not in patch and "is_closed" not in patch
    assert "provider_ids" not in patch and "category" not in patch


def test_address_only_match_is_not_trusted():
    # 주소는 같지만 공유하는 이름 토큰이 없으면 같은 곳으로 보지 않는다
    assert not w.same_place_by_address(SPOT["name"], SPOT["address"], HEALTH_CENTER)


def test_address_and_shared_token_is_trusted():
    place = {"name": "샬레트리 펜션", "roadAddress": SPOT["address"]}
    assert not w.same_place_by_address(SPOT["name"], SPOT["address"], place)  # '샬레'·'트리'와 '샬레트리'는 다른 토큰
    place = {"name": "샬레 트리하우스", "roadAddress": SPOT["address"]}
    assert w.same_place_by_address(SPOT["name"], SPOT["address"], place)


def test_matched_result_verifies():
    patch = _run([dict(HEALTH_CENTER, name="양평 샬레 트리", category="펜션")])
    assert patch.get("verified") is True and patch.get("fail_count") == 0


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
