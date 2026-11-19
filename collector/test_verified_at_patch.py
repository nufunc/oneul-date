import ast
import os

# run_worker 안의 patch_data 딕셔너리 리터럴만 소스에서 읽는다. 네트워크와 DB를 부르지 않는다(P-522)
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "supabase_worker.py"), encoding="utf-8").read()
literals = []
for node in ast.walk(ast.parse(src)):
    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
        if any(isinstance(t, ast.Name) and t.id == "patch_data" for t in node.targets):
            literals.append({k.value for k in node.value.keys if isinstance(k, ast.Constant)})

trusted = [k for k in literals if "quality_score" in k]
others = [k for k in literals if "quality_score" not in k]
assert len(trusted) == 1 and "last_verified_at" in trusted[0], trusted
assert len(others) >= 2, others
assert all("last_verified_at" not in k for k in others), others

# sync_live_spots는 requests를 가져오므로 가져오지 않고 소스에서 읽는다
sync_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_live_spots.py"), encoding="utf-8").read()
unused = next(
    {e.value for e in n.value.elts}
    for n in ast.walk(ast.parse(sync_src))
    if isinstance(n, ast.Assign) and isinstance(n.value, ast.Set) and any(getattr(t, "id", "") == "CLIENT_UNUSED_KEYS" for t in n.targets)
)
assert "last_verified_at" in unused, unused
print("ok")
