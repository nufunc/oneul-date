"""P-300 카카오 패널 메뉴 가격으로 양 끝 가격대를 채우는 13단계 회귀 테스트: python3 test_kakao_price_tier.py 또는 pytest
DB와 패널 호출은 test_kakao_detail의 가짜를 쓴다.
"""
import json
import os
import tempfile

import kakao_detail as k
from test_kakao_detail import ADDR, P_ALL, _id, _row, _run


def _panel(prices, name="장소1", status="Y", with_hours=False):
    items = [{"name": f"메뉴{i}", "price": p} for i, p in enumerate(prices)]
    p = {"summary": {"status": status, "name": name, "address": ADDR}, "menu": {"menus": {"items": items}}}
    if with_hours:
        p["open_hours"] = P_ALL["open_hours"]
    return p


def _tiers(panel, **row):
    patches, _, _, _ = _run({"1": panel}, rows=[_row(1, **{"category": "음식점 > 한식", **row})])
    return [b.get("price_tier") for _, b in patches] if patches else []


def test_writes_only_extreme_tiers_by_mean_boundaries():
    assert _tiers(_panel([14999, 14999, 14999])) == ["₩"]
    assert _tiers(_panel([15000, 15000, 15000])) == []       # 가운데는 비운다
    assert _tiers(_panel([29999, 29999, 29999])) == []
    assert _tiers(_panel([30000, 30000, 30000])) == ["₩₩₩"]
    assert _tiers(_panel([49999, 49999, 49999])) == ["₩₩₩"]
    assert _tiers(_panel([50000, 50000, 50000])) == ["₩₩₩₩"]
    assert _tiers(_panel([10000, 10000, 25000])) == []        # 평균 15,000


def test_never_writes_avg_price_or_price_text():
    patches, _, _, _ = _run({"1": _panel([9000, 8000, 7000])}, rows=[_row(1, category="카페")])
    assert set(patches[0][1]) == {"price_tier", "updated_at"}


def test_needs_three_valid_menu_prices():
    assert _tiers(_panel([8000, 9000])) == []
    assert _tiers(_panel([8000, 9000, -1, 0])) == []          # -1은 '변동가격'
    assert _tiers(_panel([8000, 9000, 7000, -1])) == ["₩"]


def test_name_must_match_either_direction():
    assert _tiers(_panel([8000] * 3, name="전혀 다른 집")) == []
    assert _tiers(_panel([8000] * 3, name="장소1 본점")) == ["₩"]    # 패널 이름이 DB 이름을 포함
    assert _tiers(_panel([8000] * 3, name="장소"), name="장소 1 호점") == ["₩"]    # DB 이름이 패널 이름을 포함
    assert _tiers(_panel([8000] * 3, name="")) == []


def test_status_road_and_missing_menu_skip():
    assert _tiers(_panel([8000] * 3, status="N")) == []
    assert _tiers(_panel([8000] * 3), address="서울 마포구 연희동 123-4") == []   # 지번 주소만
    assert _tiers({"summary": {"status": "Y", "name": "장소1", "address": ADDR}}) == []


def test_non_dining_rows_are_skipped():
    assert _tiers(_panel([8000] * 3), category="펜션") == []
    assert _tiers(_panel([8000] * 3), category="") == []


def test_prefilled_rows_are_skipped():
    for kw in ({"price_tier": "₩₩"}, {"avg_price_per_person": 12000}, {"price": "매장별 상이"}):
        assert _tiers(_panel([8000] * 3), **kw) == [], kw
    assert _tiers(_panel([8000] * 3), price="", price_tier=None, avg_price_per_person=None) == ["₩"]


def test_shares_one_patch_with_hours_and_keeps_updated_at_condition():
    patches, _, _, _ = _run({"1": _panel([8000] * 3, with_hours=True)}, rows=[_row(1, updated_at="t0", category="카페")])
    assert len(patches) == 1 and "updated_at=eq.t0" in patches[0][0]
    assert patches[0][1]["price_tier"] == "₩" and patches[0][1]["business_hours"] == {"영업시간": "매일 10:00 ~ 18:00"}


def test_price_filled_row_still_gets_hours_without_touching_price():
    patches, _, _, _ = _run({"1": _panel([8000] * 3, with_hours=True)}, rows=[_row(1, price_tier="₩₩", category="카페")])
    assert "price_tier" not in patches[0][1] and "business_hours" in patches[0][1]


def test_p300_backup_lists_price_empty_rows_with_read_values():
    d = tempfile.mkdtemp()
    rows = [_row(1, updated_at="t1", category="카페"), _row(2, price="무료", category="카페"), _row(3, category="펜션")]
    _run({"1": _panel([8000] * 3), "2": _panel([8000] * 3, name="장소2"), "3": _panel([8000] * 3, name="장소3")}, rows=rows, backup_dir=d)
    [p300] = [f for f in os.listdir(d) if f.startswith("p300_")]
    assert json.load(open(os.path.join(d, p300))) == [
        {"id": 1, "name": "장소1", "price_tier": None, "avg_price_per_person": None, "updated_at": "t1"}]


def test_tier_boundaries_are_shared_with_text_derivation():
    from supabase_worker import derive_price_tier_from_text as d
    for avg in (14999, 15000, 29999, 30000, 49999, 50000):
        assert k.price_tier_from_avg(avg) == d(f"{avg:,}원")[0], avg


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
