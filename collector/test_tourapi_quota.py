"""TourAPI 한도 초과(429) 처리 회귀 테스트: python3 test_tourapi_quota.py 또는 pytest (네트워크를 가짜로 바꾼다)"""
import io
import os
import sys
import tempfile
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "miners"))

import tourapi_quota as q


def _with_429(fn):
    orig_open, orig_file = q.urllib.request.urlopen, q.USAGE_FILE
    q.USAGE_FILE = os.path.join(tempfile.mkdtemp(), "usage.json")

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, io.BytesIO(b""))
    q.urllib.request.urlopen = boom
    try:
        return fn()
    finally:
        q.urllib.request.urlopen, q.USAGE_FILE = orig_open, orig_file


def test_fetchers_raise_instead_of_returning_none():
    import event_period
    import tour_fee
    for fetch in (lambda: event_period.fetch_event_period("k", "1"), lambda: tour_fee.fetch_usefee("k", "1")):
        try:
            _with_429(fetch)
        except q.TourApiRateLimited:
            continue
        raise AssertionError("429가 조용히 넘어갔다")


def test_miner_stops_without_advancing_region():
    import tourapi_miner as m
    saved = {}
    orig = (m._load_checkpoint, m._save_checkpoint, m.insert_spots)
    m._load_checkpoint = lambda: {"area_index": 3, "page_by_combo": {}}
    m._save_checkpoint = lambda c: saved.update(c)
    m.insert_spots = lambda *a, **k: []
    try:
        assert _with_429(lambda: m.run_tourapi_mining("http://db", "k", tour_api_key="x")) == 0
    finally:
        m._load_checkpoint, m._save_checkpoint, m.insert_spots = orig
    assert saved.get("area_index", 3) == 3


def test_usage_is_counted_per_day():
    def run():
        try:
            q.tour_get_json("http://x")
        except q.TourApiRateLimited:
            pass
        return q.usage_today()
    assert _with_429(run) == 1



def test_miner_drops_name_pattern_but_keeps_whitelist_miss():
    """상호명 패턴(어린이 시설)은 버리고, 콘텐츠 유형이 화이트리스트 밖이라는 사유는 통과시킨다."""
    import tourapi_miner as m
    items = [{"contentid": "1", "title": "울산어린이천문대", "addr1": "울산 북구"},
             {"contentid": "2", "title": "더좋은 펜션 캠핑장", "addr1": "강원 홍천군"}]
    checked = []
    orig = (m._load_checkpoint, m._save_checkpoint, m.insert_spots, m.fetch_tourapi_spots, m._cotid_exists, m.time.sleep)
    m._load_checkpoint = lambda: {"area_index": 0, "page_by_combo": {}}
    m._save_checkpoint = lambda c: None
    m.insert_spots = lambda *a, **k: []
    m.fetch_tourapi_spots = lambda *a, **k: items
    m.time.sleep = lambda s: None

    def cotid(url, headers, cid):
        checked.append(cid)
        return True  # 게이트를 지난 항목만 여기에 온다. 이미 있는 것으로 보고 멈춘다
    m._cotid_exists = cotid
    try:
        m.run_tourapi_mining("http://db", "k", tour_api_key="x")
    finally:
        m._load_checkpoint, m._save_checkpoint, m.insert_spots, m.fetch_tourapi_spots, m._cotid_exists, m.time.sleep = orig
    assert "1" not in checked and "2" in checked



def _with_response(status, body, fn):
    """urlopen이 status와 JSON 본문을 돌려주게 바꾼다(200이면 정상 응답, 그 밖은 HTTPError)."""
    import json as _json
    orig_open, orig_file = q.urllib.request.urlopen, q.USAGE_FILE
    q.USAGE_FILE = os.path.join(tempfile.mkdtemp(), "usage.json")

    class Res(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake(req, timeout=None):
        raw = _json.dumps(body).encode()
        if status == 200:
            return Res(raw)
        raise urllib.error.HTTPError(req.full_url, status, "err", {}, io.BytesIO(raw))
    q.urllib.request.urlopen = fake
    try:
        return fn()
    finally:
        q.urllib.request.urlopen, q.USAGE_FILE = orig_open, orig_file


LIMIT_BODY = {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"errMsg": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
                                                           "returnReasonCode": "22"}}}


def test_limit_code_22_is_rate_limited_with_any_status():
    for status in (200, 403):
        try:
            _with_response(status, LIMIT_BODY, lambda: q.tour_get_json("http://x"))
        except q.TourApiRateLimited:
            continue
        raise AssertionError(f"{status} 코드 22가 한도 초과로 올라오지 않았다")


def test_fetchers_raise_failed_instead_of_empty_after_retries():
    import event_period
    import tour_fee
    body = {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"errMsg": "SERVICE ERROR", "returnReasonCode": "99"}}}
    orig = (event_period.time.sleep, tour_fee.time.sleep)
    event_period.time.sleep = tour_fee.time.sleep = lambda s: None
    try:
        for fetch in (lambda: event_period.fetch_event_period("k", "1"), lambda: tour_fee.fetch_usefee("k", "1")):
            try:
                _with_response(500, body, fetch)
            except q.TourApiFetchFailed:
                continue
            raise AssertionError("재시도 실패가 빈 값으로 넘어갔다")
    finally:
        event_period.time.sleep, tour_fee.time.sleep = orig


def test_list_failure_keeps_page():
    import tourapi_miner as m
    saved = {}
    orig = (m._load_checkpoint, m._save_checkpoint, m.insert_spots, m.time.sleep)
    m._load_checkpoint = lambda: {"area_index": 0, "page_by_combo": {"1:14": 4}}
    m._save_checkpoint = lambda c: saved.update(c)
    m.insert_spots = lambda *a, **k: []
    m.time.sleep = lambda s: None
    try:
        _with_response(500, {"x": 1}, lambda: m.run_tourapi_mining("http://db", "k", tour_api_key="x"))
    finally:
        m._load_checkpoint, m._save_checkpoint, m.insert_spots, m.time.sleep = orig
    assert saved["page_by_combo"]["1:14"] == 4


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
