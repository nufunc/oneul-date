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


def _run(places, spot=None):
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



def test_two_letter_shop_names_are_not_quarantined():
    # 두 글자 이름까지 닫아 부빙·윤슬·책바가 등록 직후 닫혔다(2026-09-27 하루 15곳)
    for name in ("부빙", "윤슬", "책바"):
        spot = dict(SPOT, name=name, verified=True, fail_count=0)
        patch = _run([dict(HEALTH_CENTER, name=name, category="카페")], spot)
        assert patch.get("is_closed") is not True, name


def test_emoji_one_letter_and_place_names_are_still_quarantined():
    assert w.is_noise_spot_name("🌿") and w.is_noise_spot_name("🛍️") and w.is_noise_spot_name("숲")
    assert not w.is_noise_spot_name("부빙") and not w.is_noise_spot_name("오브")
    assert not w.is_noise_spot_name("7.8") and not w.is_noise_spot_name("913")
    patch = _run([dict(HEALTH_CENTER, name="압구정", category="카페")], dict(SPOT, name="압구정"))
    assert patch.get("is_closed") is True



def test_insert_spots_skips_rows_without_category():
    posted = []

    def fake_urlopen(req, timeout=None, **kw):
        posted.extend(json.loads(req.data.decode("utf-8")))
        return _Res(b"")
    orig = w.urllib.request.urlopen
    w.urllib.request.urlopen = fake_urlopen
    try:
        out = w.insert_spots("http://db", {}, [{"id": 1, "name": "부빙", "category": "디저트카페"},
                                               {"id": 2, "name": "빈칸", "category": None}, {"id": 3, "name": "공백", "category": " "}])
        assert w.insert_spots("http://db", {}, [{"id": 4, "name": "없음"}]) == []
    finally:
        w.urllib.request.urlopen = orig
    assert [s["id"] for s in out] == [1] and [s["id"] for s in posted] == [1]



def test_enrich_quarantine_uses_same_noise_rule():
    # 5단계도 두 글자 이름을 닫아, run_worker에서 고친 뒤 되살린 행을 다시 닫을 수 있었다(2026-09-27)
    import enrich_worker as e
    patches = []

    def fake_urlopen(req, timeout=None, **kw):
        if getattr(req, "method", "GET") == "PATCH":
            patches.append((req.full_url, json.loads(req.data.decode("utf-8"))))
            return _Res(b"")
        return _Res(json.dumps([{"id": 1, "name": "부빙", "location": "서울 종로구"},
                                {"id": 2, "name": "🌿", "location": ""}]).encode("utf-8"))
    orig = (e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep)
    e.urllib.request.urlopen, e.time.sleep = fake_urlopen, lambda s: None
    e.search_youtube_hotclip = lambda *a, **k: None
    e.search_kakaomap_place = lambda *a, **k: None
    try:
        e.run_social_enrichment("http://db", "k", batch_size=2)
    finally:
        e.urllib.request.urlopen, e.search_youtube_hotclip, e.search_kakaomap_place, e.time.sleep = orig
    closed = {url.rsplit("eq.", 1)[-1] for url, body in patches if body.get("is_closed") is True}
    assert closed == {"2"}, patches


def test_other_province_name_hit_is_not_trusted():
    # 행 주소가 광주인데 대구 '풀베르트'가 이름 포함으로 맞아 좌표·권역이 대구로 바뀌었다(2026-09-29 1591 베르트)
    spot = dict(SPOT, id=1591, name="베르트", address="광주 동구 동계천로 137-7", region="영남", area="수성구",
                location="영남 수성구", category=None, slot="day")
    wrong = {"id": "940327341", "provider": "kakao", "name": "풀베르트", "roadAddress": "대구 수성구 무학로21길 88",
             "category": "꽃집,꽃배달", "x": "128.62", "y": "35.86", "thumUrl": None}
    patch = _run([wrong], spot)
    assert "provider_ids" not in patch and "verified" not in patch and patch.get("region") != "영남"
    right = dict(wrong, id="1", name="베르트", roadAddress="광주 동구 동계천로 137-7")
    assert _run([right], spot).get("region") == "호남"


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
