"""언급 근거 장소 추출의 Claude 우선, Groq 폴백 회귀 테스트(P-533): python3 test_claude_extract.py 또는 pytest"""
import json
from types import SimpleNamespace

import groq_helper as g

TEXT = "오늘은 성수동 어니언 성수에서 빵을 먹고 서울숲을 걸었어요. 주차는 유료."
GROQ_RES = {"spots": [{"name": "어니언 성수", "signature_items": [], "parking": "paid", "date_context": []}]}


class FakeClaude:
    def __init__(self, payload=None, error=None, stop_reason="end_turn"):
        self.calls = []
        self.payload, self.error, self.stop_reason = payload, error, stop_reason
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        if self.error:
            raise self.error
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload, ensure_ascii=False))])


def _run(key, client, groq_res=GROQ_RES):
    orig = (g.get_anthropic_api_key, g.call_groq_json, g._claude_client)
    groq_calls = []
    g.get_anthropic_api_key = lambda: key
    g.call_groq_json = lambda *a, **kw: groq_calls.append(a) or groq_res
    g._claude_client = client
    try:
        return g.extract_spots_from_unstructured_text(TEXT, video_title="성수 데이트"), groq_calls
    finally:
        g.get_anthropic_api_key, g.call_groq_json, g._claude_client = orig


def test_no_key_uses_groq_only():
    fake = FakeClaude(payload={"spots": []})
    spots, groq_calls = _run(None, fake)
    assert spots == GROQ_RES["spots"]
    assert len(groq_calls) == 1 and fake.calls == []


def test_claude_response_converted_to_existing_format():
    payload = {"spots": [
        {"name": "어니언 성수", "signature_items": ["팡도르"], "parking": "paid", "date_context": ["healing"]},
        {"name": "서", "signature_items": [], "parking": "unknown", "date_context": []},  # 2자 미만은 종전처럼 버린다
    ]}
    fake = FakeClaude(payload=payload)
    spots, groq_calls = _run("test-key", fake)
    assert spots == [payload["spots"][0]]
    assert groq_calls == []
    kw = fake.calls[0]
    assert kw["model"] == "claude-haiku-5-5"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["output_config"]["format"]["schema"] is g._SPOTS_SCHEMA


def test_claude_exception_falls_back_to_groq():
    spots, groq_calls = _run("test-key", FakeClaude(error=TimeoutError("boom")))
    assert spots == GROQ_RES["spots"] and len(groq_calls) == 1


def test_claude_truncated_falls_back_to_groq():
    spots, groq_calls = _run("test-key", FakeClaude(payload={"spots": []}, stop_reason="max_tokens"))
    assert spots == GROQ_RES["spots"] and len(groq_calls) == 1


def test_both_fail_returns_empty():
    spots, _ = _run("test-key", FakeClaude(error=RuntimeError("x")), groq_res=None)
    assert spots == []


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
