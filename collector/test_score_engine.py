"""score_engine 회귀 테스트: python3 test_score_engine.py 또는 pytest"""
from score_engine import _recency_bonus, calculate_hot_score


def _score(views, published=""):
    return calculate_hot_score({"url": "u", "views": views, "published_at": published}, None, True)[0]


def test_recency_bonus_by_published_text():
    assert _recency_bonus("3일 전") == 10.0
    assert _recency_bonus("2주 전") == 10.0
    assert _recency_bonus("1개월 전") == 10.0
    assert _recency_bonus("3개월 전") == 5.0
    assert _recency_bonus("1년 전") == 0.0
    assert _recency_bonus("") == 0.0


def test_recent_popular_video_reaches_hot_threshold():
    # 5만 뷰는 게시 시점을 모르면 80이라 🔥 기준 85에 닿지 않았다. 최근 게시면 넘는다
    assert _score(50000) == 80.0
    assert _score(50000, "3일 전") >= 85.0


def test_score_is_capped_at_100():
    assert _score(500000, "1일 전") <= 100.0


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
