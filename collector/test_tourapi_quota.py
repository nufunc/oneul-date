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


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
