"""사진 관문 회귀 테스트(P-141): python3 test_image_url_gate.py 또는 pytest (네트워크 없이 조회를 가짜로 바꾼다)"""
import os

import supabase_worker as w

KAKAO = "https://t1.kakaocdn.net/thumb/T800x0.q50/?fname=https%3A%2F%2Fa.jpg"
BLOG = "https://blog.kakaocdn.net/dn/abc/img.jpg"
YANOLJA = "https://yaimg.yanolja.com/v5/room.jpg"
STICKER = "https://storep-phinf.pstatic.net/ogq_5c4d0f3bd1d86/original_22.png?type=p100_100"
SEOUL = (37.5665, 126.9780)


def _with_db(rows, fn):
    """image_url=eq 조회가 rows를 돌려주게 하고 fn을 실행한다. rows가 예외면 조회 실패다."""
    env = {k: os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")}
    orig = w._get_rows
    os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"] = "http://db", "k"

    def fake(url, headers):
        assert "is_closed=eq.false" in url and "image_url=eq." in url
        if isinstance(rows, Exception):
            raise rows
        return rows
    w._get_rows = fake
    try:
        return fn()
    finally:
        w._get_rows = orig
        for k, v in env.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)


def _rec(url, lat=SEOUL[0], lng=SEOUL[1], **kw):
    return {"name": "x", "image_url": url, "lat": lat, "lng": lng, **kw}


def test_allowed_hosts_keep_photo():
    for url in (KAKAO, BLOG, "http://tong.visitkorea.or.kr/cms/resource/1.jpg"):
        assert w.sanitize_spot(_rec(url))["image_url"] == url


def test_host_outside_allowlist_is_dropped():
    for url in (YANOLJA, STICKER, "https://i.ytimg.com/vi/x/hqdefault.jpg", "https://evil.example.com/a.jpg"):
        assert w.sanitize_spot(_rec(url))["image_url"] is None


def test_url_used_by_row_over_300m_away_is_dropped():
    far = {"id": 9, "lat": SEOUL[0] + 0.01, "lng": SEOUL[1]}  # 약 1.1km
    assert _with_db([far], lambda: w.sanitize_spot(_rec(KAKAO))["image_url"]) is None


def test_url_used_by_nearby_row_is_kept():
    near = {"id": 9, "lat": SEOUL[0] + 0.001, "lng": SEOUL[1]}  # 약 110m, 같은 장소의 중복 행
    assert _with_db([near], lambda: w.sanitize_spot(_rec(KAKAO))["image_url"]) == KAKAO


def test_own_row_is_not_another_row():
    far = {"id": 9, "lat": SEOUL[0] + 0.01, "lng": SEOUL[1]}
    assert _with_db([far], lambda: w.sanitize_spot(_rec(KAKAO, id=9))["image_url"]) == KAKAO


def test_lookup_failure_keeps_photo():
    assert _with_db(OSError("down"), lambda: w.sanitize_spot(_rec(KAKAO))["image_url"]) == KAKAO


def test_no_coordinates_skips_reuse_check():
    far = {"id": 9, "lat": SEOUL[0] + 0.01, "lng": SEOUL[1]}
    assert _with_db([far], lambda: w.sanitize_spot(_rec(KAKAO, lat=None, lng=None))["image_url"]) == KAKAO


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
