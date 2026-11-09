"""13단계 패널 주차 판정 회귀 테스트(P-332): python3 test_kakao_detail_parking.py 또는 pytest"""
import kakao_detail as k


def panel(texts=None, icons=(), is_parking=None, summary=""):
    facilities = {} if is_parking is None else {"is_parking": is_parking}
    return {"summary": {"status": "Y", "address": {"road": "고양대로 1955"}},
            "place_add_info": {"simple_parking_infos": {"texts": texts, "summary": summary},
                               "store_facility_icons": [{"text": i} for i in icons], "facilities": facilities}}


ROW = {"address": "경기 고양시 고양대로 1955", "parking_info": {}, "business_hours": {"영업시간": "x"}}


def test_free_text_and_free_icon_is_free():
    assert k.parking_from_panel(panel(["무료 주차"], ["무료주차"])) == {"type": "free", "detail": "무료 주차"}


def test_free_with_condition_in_summary_drops_to_available():
    p = panel(["무료 주차"], ["무료주차"], summary="식사 후 결제 시 1시간 무료주차")
    assert k.parking_from_panel(p) == {"type": "available", "detail": "식사 후 결제 시 1시간 무료주차"}


def test_text_and_icon_disagree_is_available_not_free_or_paid():
    assert k.parking_from_panel(panel(["무료 주차"], ["유료주차"]))["type"] == "available"
    assert k.parking_from_panel(panel(["유료 주차"], ["무료주차"]))["type"] == "available"


def test_one_sided_signal_is_available():
    assert k.parking_from_panel(panel(["무료 주차"]))["type"] == "available"
    assert k.parking_from_panel(panel(None, ["유료주차"]))["type"] == "available"


def test_paid_needs_both_signals():
    assert k.parking_from_panel(panel(["유료 주차"], ["유료주차"]))["type"] == "paid"


def test_no_parking_text_is_impossible():
    assert k.parking_from_panel(panel(["주차장 없음"], is_parking=False)) == {"type": "impossible", "detail": "주차장 없음"}
    # 아이콘이 있거나 is_parking이 True면 불가능으로 쓰지 않는다
    assert k.parking_from_panel(panel(["주차장 없음"], ["주차가능"]))["type"] == "available"
    assert k.parking_from_panel(panel(["주차장 없음"], is_parking=True))["type"] == "available"


def test_is_parking_false_alone_writes_nothing():
    assert k.parking_from_panel(panel(None, is_parking=False)) is None
    assert k.parking_from_panel(panel(None, is_parking=True)) is None
    assert k.parking_from_panel(panel(["주차정보"], summary="근처 공영주차장 이용")) is None


def test_no_parking_field_writes_nothing():
    assert k.parking_from_panel({"summary": {"status": "Y"}}) is None
    assert k.parking_from_panel({"place_add_info": {}}) is None


def test_empty_cells_are_targets_and_filled_cells_are_not():
    for empty in ({}, None, {"type": "unknown"}, {"detail": "x"}):
        assert k.parking_empty({"parking_info": empty})
    assert not k.parking_empty({"parking_info": {"type": "available", "detail": "x"}})
    assert not k.parking_empty({"parking_info": {"type": "impossible"}})


def test_panel_fields_writes_parking_only_to_empty_cell():
    p = panel(["무료 주차"], ["무료주차"])
    fields, why = k.panel_fields(p, ROW)
    assert fields == {"parking_info": {"type": "free", "detail": "무료 주차"}} and why is None
    filled = {**ROW, "parking_info": {"type": "paid", "detail": "유료"}}
    assert k.panel_fields(p, filled) == ({}, "empty")
    assert k.panel_fields(p, {**ROW, "parking_info": {"type": "unknown"}})[0]["parking_info"]["type"] == "free"


def test_panel_fields_skips_road_mismatch_and_status():
    p = panel(["무료 주차"], ["무료주차"])
    assert k.panel_fields(p, {**ROW, "address": "경기 용인시 주북로 10"}) == ({}, "road")
    p["summary"]["status"] = "N"
    assert k.panel_fields(p, ROW) == ({}, "status")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
