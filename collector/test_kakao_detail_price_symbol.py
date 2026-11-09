"""13단계 패널 가격 기호(ai_mate.price_level.symbol) 판정 회귀 테스트(P-333): python3 test_kakao_detail_price_symbol.py 또는 pytest
DB와 패널 호출은 test_kakao_detail의 가짜를 쓴다. 표본 대조는 docs/planning/p333_sample.json 전체에 판정 함수를 적용한다.
"""
import json
import os
import tempfile

import kakao_detail as k
from test_kakao_detail import ADDR, _row, _run

SAMPLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "planning", "p333_sample.json")


def _panel(symbol=None, prices=(), name="장소1"):
    p = {"summary": {"status": "Y", "name": name, "address": ADDR},
         "menu": {"menus": {"items": [{"name": f"메뉴{i}", "price": v} for i, v in enumerate(prices)]}}}
    if symbol is not None:
        p["ai_mate"] = {"price_level": {"symbol": symbol}}
    return p


def _tier(panel, **row):
    return k.price_tier_from_panel(panel, _row(1, category="한식", **row))


def test_symbol_only_without_menu_maps_one_step_down():
    assert _tier(_panel("₩")) == "₩"          # 쑥굴레 평화광장점
    assert _tier(_panel("₩₩")) == "₩"
    assert _tier(_panel("₩₩₩")) == "₩₩"
    assert _tier(_panel("₩₩₩₩₩")) == "₩₩₩₩"


def test_symbol_with_fewer_than_three_menu_prices_uses_symbol_tier():
    assert _tier(_panel("₩₩₩", [20500])) == "₩₩"    # 도디치
    assert _tier(_panel("₩₩₩", [20500, -1, 0])) == "₩₩"


def test_symbol_and_menu_mean_tier_must_agree():
    assert _tier(_panel("₩₩", [10000, 10000, 12000])) == "₩"            # 같은 등급
    assert _tier(_panel("₩₩₩", [25000, 25000, 26000])) == "₩₩"          # 돈파스타 계열
    assert _tier(_panel("₩₩₩", [10000, 10000, 12000])) is None          # 메뉴는 ₩, 기호는 ₩₩: 장안집
    assert _tier(_panel("₩₩", [16000, 17000, 16000])) is None           # 메뉴는 ₩₩, 기호는 ₩: 여수서대
    assert _tier(_panel("₩₩₩₩₩", [90000, 90000, 100000])) == "₩₩₩₩"


def test_four_won_symbol_is_left_empty_even_if_menu_is_cheap():
    assert _tier(_panel("₩₩₩₩")) is None
    assert _tier(_panel("₩₩₩₩", [8000] * 3)) is None


def test_no_symbol_keeps_menu_won_rule():
    assert _tier(_panel(None, [14999] * 3)) == "₩"
    assert _tier(_panel(None, [15000] * 3)) is None
    assert _tier(_panel(None, [8000, 9000])) is None
    assert _tier(_panel("")) is None
    assert _tier(_panel("알 수 없음", [8000] * 3)) == "₩"    # 모르는 기호는 없는 것으로 본다


def test_name_must_match_even_with_symbol():
    assert _tier(_panel("₩", name="전혀 다른 집")) is None
    assert _tier(_panel("₩", name="")) is None
    assert _tier(_panel("₩", name="장소1 본점")) == "₩"


def _written(panel, **row):
    patches, _, _, _ = _run({"1": panel}, rows=[_row(1, **{"category": "한식", **row})])
    return [b.get("price_tier") for _, b in patches] if patches else []


def test_only_price_empty_dining_rows_are_written_and_filled_cells_are_kept():
    assert _written(_panel("₩₩₩", [20500])) == ["₩₩"]
    for kw in ({"price_tier": "₩₩₩"}, {"avg_price_per_person": 12000}, {"price": "매장별 상이"}):
        assert _written(_panel("₩₩₩", [20500]), **kw) == [], kw
    for cat in ("육류,고기", "회", "술집", "호프,요리주점", "일본식주점", "펜션", ""):    # 육류·횟집·주점과 식음료 밖은 비운다
        assert _written(_panel("₩₩", [8000] * 3), category=cat) == [], cat
        assert _written(_panel("₩₩₩₩₩"), category=cat) == [], cat


def test_written_record_is_made_before_patch_and_never_writes_avg_or_price():
    d = tempfile.mkdtemp()
    rows = [_row(1, category="카페"), _row(2, category="카페", price_tier="₩₩"), _row(3, category="카페")]
    panels = {"1": _panel("₩₩₩", [20500]), "2": _panel("₩₩₩", [20500], name="장소2"), "3": _panel("₩₩₩₩", name="장소3")}
    patches, _, _, _ = _run(panels, rows=rows, backup_dir=d)
    assert [set(b) for _, b in patches] == [{"price_tier", "updated_at"}]
    [rec] = [f for f in os.listdir(d) if f.startswith("p333_written_")]
    assert json.load(open(os.path.join(d, rec))) == [{"id": 1, "price_tier": "₩₩"}]
    [p300] = [f for f in os.listdir(d) if f.startswith("p300_")]
    assert [r["id"] for r in json.load(open(os.path.join(d, p300)))] == [1, 3]


def test_sample_rows_match_proposal_expectations():
    if not os.path.exists(SAMPLE):    # 컨테이너(/app)에는 docs가 없다
        return
    rows = json.load(open(SAMPLE))

    def decide(r):
        """표본 행의 기호와 메뉴 통계로 만든 패널에 판정 함수를 적용한다. 범주는 보지 않는다"""
        n = r["menu_prices"]
        prices = [round(r["menu_mean"])] * n if n else []
        return k.price_tier_from_panel(_panel(r["symbol"], prices), _row(1, category="한식"))

    fwd = [r for r in rows if r["group"] in ("fwd_din_evening", "fwd_din_day")]
    known = [r for r in rows if r["group"] == "known_tier"]
    got = {r["name"] for r in fwd if decide(r)}
    # P-333 근거(표본): 방문 예정 식음료 16행 중 새 규칙 10행이고 현행 메뉴 규칙 8행에서 장안집과 온의미반이 빠지고 네 행이 더해진다
    want = {"묵그리고", "쑥굴레 평화광장점", "돈파스타", "바리에 충장점", "가배도 노량진점", "오베르망 본점", "슬램커피로스터스", "도디치", "연의양과", "백담황태사랑"}
    assert got == want, (got ^ want)
    current = {r["name"] for r in fwd if r["menu_rule_tier"]}
    assert (current - got, got - current) == ({"장안집", "온의미반"}, {"쑥굴레 평화광장점", "도디치", "돈파스타", "바리에 충장점"})
    # 같은 근거: 등급 있는 대조 14행 중 9행에 쓰고 DB 등급과 같은 행이 8행, 다른 행이 맥파이앤타이거 성수티룸 한 행
    wrote = {r["name"]: decide(r) for r in known if decide(r)}
    assert len(wrote) == 9
    assert {n for n, t in wrote.items() if t != next(r["db_tier"] for r in known if r["name"] == n)} == {"맥파이앤타이거 성수티룸"}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
