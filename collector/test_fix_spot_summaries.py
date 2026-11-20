"""풀 선택과 과대 문장 회귀 테스트(P-074, P-080): python3 test_fix_spot_summaries.py 또는 pytest"""
import io
import json
import re
from types import SimpleNamespace

import fix_spot_summaries as f
import groq_helper as g

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

# 만들기(공방) 풀 문장과 그 풀에서만 쓰는 도입구(P-080)
_MAKER_OPENERS = set(f.OPENER_BANK["creative"]) - set(f.OPENER_BANK["exhibit"])
_MAKER_CLAIM = re.compile(r"공방|원데이 클래스|만들어가는|만든 작품|손끝에서 완성|손수 만든|빚어내며|작업대")


def _summaries(name, cat, n=200):
    return [f.generate_curated_summary(name, cat, "서울", "", None, spot_id=i) for i in range(1, n + 1)]


def _has_maker_claim(text):
    return bool(_MAKER_CLAIM.search(text)) or any(text.startswith(o) for o in _MAKER_OPENERS)


def test_non_workshop_places_do_not_get_maker_sentences():
    # 라이브에서 레일바이크와 조각미술관이 만들기 문장을 받았다
    for name, cat in [("영종 씨사이드파크 레일바이크", "레포츠/체험"), ("바우지움조각미술관", "문화시설"),
                      ("바우지움조각미술관", "미술관"), ("국립중앙박물관", "박물관"), ("좋아하는서점", "서점"),
                      ("경주화백컨벤션센터", "문화시설"), ("청도 레일바이크", "체험여행"), ("어느 공연장", "공연")]:
        assert not any(_has_maker_claim(t) for t in _summaries(name, cat)), (name, cat)


def test_workshop_category_still_gets_maker_pool():
    for cat in ["공방", "도자기공방", "가죽공예", "향수", "원데이클래스"]:
        assert any(_has_maker_claim(t) for t in _summaries("어느 가게", cat, 40)), cat


def test_no_unsupported_popularity_claims():
    src = open(f.__file__, encoding="utf-8").read()
    pools = re.findall(r'^\s+f?"([^"\n]{10,}[.])",?\s*$', src, re.M)
    assert len(pools) > 100
    assert [p for p in pools if OVERCLAIM.search(p)] == []


# Claude 경로(P-533 단위 2)
class FakeClaude:
    def __init__(self, payload=None, error=None):
        self.calls, self.payload, self.error = [], payload, error
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        if self.error:
            raise self.error
        return SimpleNamespace(stop_reason="end_turn",
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload, ensure_ascii=False))])


def _with_claude(key, client, fn):
    orig = (g.get_anthropic_api_key, g._claude_client)
    g.get_anthropic_api_key, g._claude_client = (lambda: key), client
    try:
        return fn()
    finally:
        g.get_anthropic_api_key, g._claude_client = orig


GOOD = "따뜻한 조명 아래 마주 앉아 천천히 이야기 나누기 좋은 곳이에요."


def test_claude_summary_ends_with_period():
    fake = FakeClaude(payload={"summary": GOOD.rstrip(".")})
    assert _with_claude("test-key", fake, lambda: f.claude_summary("어느 카페", "카페", "서울", "")) == GOOD


def test_claude_success():
    fake = FakeClaude(payload={"summary": GOOD})
    assert _with_claude("test-key", fake, lambda: f.claude_summary("어느 카페", "카페", "서울", "성수", ["라떼"])) == GOOD
    assert fake.calls[0]["output_config"]["format"]["schema"] is f._SUMMARY_SCHEMA


def test_claude_error_or_no_key_returns_none():
    assert _with_claude("test-key", FakeClaude(error=TimeoutError("boom")),
                        lambda: f.claude_summary("어느 카페", "카페", "서울", "")) is None
    fake = FakeClaude(payload={"summary": GOOD})
    assert _with_claude(None, fake, lambda: f.claude_summary("어느 카페", "카페", "서울", "")) is None
    assert fake.calls == []


def test_claude_invalid_output_returns_none():
    for bad in ["trendy, romantic", "짧다", "어느 카페에서 따뜻한 조명 아래 이야기 나누기 좋은 곳이에요.", "가" * 61]:
        assert _with_claude("test-key", FakeClaude(payload={"summary": bad}),
                            lambda: f.claude_summary("어느 카페", "카페", "서울", "")) is None, bad


def _run_fix(dry_run, claude):
    """GET은 스팟 7곳(같은 summary 6회 중복 + 영문 태그 1곳)을 내고 PATCH는 기록만 한다"""
    spots = [{"id": i, "name": f"가게{i}", "category": "카페", "region": "서울", "area": "",
              "summary": "같은 문장이 여러 번 반복되는 설명이에요.", "signature_items": []} for i in range(1, 7)]
    spots.append({"id": 7, "name": "가게7", "category": "카페", "region": "서울", "area": "", "summary": "trendy", "signature_items": []})
    patches, backups = [], []

    class Resp(io.BytesIO):
        status = 204

    def fake_urlopen(req, timeout=0):
        if req.get_method() == "PATCH":
            patches.append(req.full_url)
            return Resp(b"")
        return Resp(json.dumps(spots).encode())

    orig = (f.urllib.request.urlopen, f._backup_summaries, f.time.sleep)
    f.urllib.request.urlopen = fake_urlopen
    f._backup_summaries = lambda targets: backups.append([t["id"] for t in targets]) or "backup.json"
    f.time.sleep = lambda *a: None
    try:
        _with_claude("test-key", claude, lambda: f.fix_all_spot_summaries("http://db", "k", dry_run=dry_run))
    finally:
        f.urllib.request.urlopen, f._backup_summaries, f.time.sleep = orig
    return patches, backups


def test_dry_run_does_not_patch_or_backup():
    claude = FakeClaude(payload={"summary": GOOD})
    patches, backups = _run_fix(3, claude)
    assert patches == [] and backups == []
    assert len(claude.calls) == 3


def test_real_run_backs_up_before_patch():
    patches, backups = _run_fix(0, FakeClaude(error=TimeoutError("boom")))  # Claude 실패는 기존 경로로 대체
    assert backups == [[1, 2, 3, 4, 5, 6, 7]]
    assert len(patches) == 7


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
