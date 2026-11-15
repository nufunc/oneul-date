"""열 형식 spots.cols.json 생성 시험: cd collector && python3 test_spots_columns.py (P-453)"""
import json
import sys
import types

sys.modules.setdefault("requests", types.ModuleType("requests"))  # 네트워크를 쓰지 않으므로 없는 환경에서도 불러온다
from sync_live_spots import columns_text

ROWS = [
    {"id": 1, "name": "가", "price": None, "tags": ["a"], "hours": {"영업시간": "9-18"}},
    {"id": 3, "name": "나", "price": 10000, "tags": [], "hours": {}},
]

# 1. 칸마다 행 수만큼의 배열이고 칸 순서와 null이 그대로다
cols = json.loads(columns_text(ROWS))
assert list(cols) == ["id", "name", "price", "tags", "hours"], list(cols)
assert cols["id"] == [1, 3] and cols["price"] == [None, 10000], cols

# 2. 실제 spots.json도 되돌리면 같은 행이다
with open("../public/data/spots.json", encoding="utf-8") as f:
    rows = json.load(f)
cols = json.loads(columns_text(rows))
assert len(cols["id"]) == len(rows)

# 3. 행마다 칸 목록이나 순서가 다르면 쓰지 않는다
for bad in ([{"id": 1, "a": 1}, {"id": 2}], [{"id": 1, "a": 1}, {"a": 1, "id": 2}]):
    try:
        columns_text(bad)
    except AssertionError:
        pass
    else:
        raise SystemExit(f"칸이 다른 행을 통과시켰다: {bad}")

print(f"ok test_spots_columns ({len(rows)}행)")
