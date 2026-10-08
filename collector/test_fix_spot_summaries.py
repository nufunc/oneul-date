"""풀 선택과 과대 문장 회귀 테스트(P-074): python3 test_fix_spot_summaries.py 또는 pytest"""
import re

import fix_spot_summaries as f

# 룰 풀만 쓴다. Groq 키가 있으면 문장이 바뀌어 풀 판정을 할 수 없다
f.get_groq_api_key = lambda: None

_BAR_ONLY = set(f.OPENER_BANK["bar"]) - {o for k, v in f.OPENER_BANK.items() if k != "bar" for o in v}
OVERCLAIM = re.compile(r"인기|핫플|실패 없|약속|강력 추천|SNS|자랑")


def _is_bar(name, cat):
    return all(f.generate_curated_summary(name, cat, "서울", "", None, spot_id=i).split(",")[0] + "," in _BAR_ONLY
               for i in range(1, 41))


def _is_never_bar(name, cat):
    return not any(f.generate_curated_summary(name, cat, "서울", "", None, spot_id=i).split(",")[0] + "," in _BAR_ONLY
                   for i in range(1, 201))


def test_non_bar_names_with_ba_do_not_get_bar_pool():
    # 라이브 시트에서 레일바이크가 와인 다이닝 바, 조각미술관이 주점 문장을 받았다
    assert _is_never_bar("영종 씨사이드파크 레일바이크", "레포츠/체험")
    assert _is_never_bar("바우지움조각미술관", "문화시설")
    assert _is_never_bar("선두바다낚시터", "관광지")


def test_bar_category_still_gets_bar_pool():
    assert _is_bar("어느 가게", "와인바")
    assert _is_bar("어느 가게", "칵테일바")
    assert _is_bar("어느 가게", "바")
    assert _is_bar("어느 가게", "주점")


def test_name_used_only_when_category_empty():
    assert _is_bar("루프탑 와인바", "")
    # 이름 끝 '바'는 카테고리가 아니라 보지 않는다. 지점 꼬리 '광주점'도 '주점'이 아니다
    assert _is_never_bar("스시 바", None)
    assert _is_never_bar("스시산 광주점", "")
    assert _is_bar("달빛 주점", "")
    assert _is_never_bar("영종 레일바이크", "")
    assert _is_never_bar("바다회사랑", "")
    # 카테고리가 있으면 이름의 카페 낱말을 보지 않는다
    assert _is_never_bar("어느 바 카페", "관광지")


def test_no_unsupported_popularity_claims():
    src = open(f.__file__, encoding="utf-8").read()
    pools = re.findall(r'^\s+f?"([^"\n]{10,}[.])",?\s*$', src, re.M)
    assert len(pools) > 100
    assert [p for p in pools if OVERCLAIM.search(p)] == []


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
