"""P-206 회귀 테스트: python3 test_tourapi_parking.py 또는 pytest
TourAPI 수집기는 주차 필드를 읽지 않으므로 새 행에 parking_info를 넣지 않고 DB 기본값 {"type":"unknown"}을 받는다.
"""
import ast
from pathlib import Path

MINER = Path(__file__).parent / "miners" / "tourapi_miner.py"


def test_new_spot_row_has_no_parking_info_key():
    keys = [k.value for node in ast.walk(ast.parse(MINER.read_text(encoding="utf-8")))
            if isinstance(node, ast.Dict) for k in node.keys if isinstance(k, ast.Constant)]
    assert "source" in keys and "curation_badges" in keys  # 행 dict를 실제로 읽었는지
    assert "parking_info" not in keys


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
