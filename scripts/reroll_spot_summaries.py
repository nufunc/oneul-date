#!/usr/bin/env python3
"""P-074 일회성 교정: id 목록의 summary만 고친 룰 풀로 다시 만들어 쓴다. 기본은 드라이런이고 --apply일 때만 쓴다.

Groq는 부르지 않는다(룰 풀만). 쓰기 직전에 대상 행의 원래 summary를 백업 파일에 남기고, 행마다 지금 summary가
읽어 둔 값과 같을 때만 PATCH한다(그사이 수집기가 고친 행은 건너뛴다). 쓴 뒤 DB를 다시 읽어 확인한다.

OCI 호스트에서 돌린다. COLLECTOR_DIR는 고친 fix_spot_summaries.py, groq_helper.py, state_io.py가 있는 폴더다:
  COLLECTOR_DIR=/tmp/p074 python3 reroll_spot_summaries.py reroll_ids.json --env /mnt/data/git/oneul-date/collector/.env \\
    --sample-out sample.json [--apply]
"""
import argparse
import json
import os
import random
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
import fix_spot_summaries  # noqa: E402
from state_io import open_new  # noqa: E402

KST = timezone(timedelta(hours=9))
fix_spot_summaries.get_groq_api_key = lambda: None


def connect(env_path):
    env = {}
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    base = env["SUPABASE_URL"].replace("host.docker.internal", "127.0.0.1").rstrip("/")
    key = env["SUPABASE_SERVICE_KEY"]
    return base, {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def request(url, headers, method="GET", body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=60) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def fetch_ids(base, headers, ids):
    rows = []
    cols = "id,name,category,region,area,summary,signature_items,is_closed"
    for i in range(0, len(ids), 100):
        rows += request(f"{base}/rest/v1/spots?select={cols}&id=in.({','.join(map(str, ids[i:i + 100]))})", headers)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("ids_file", help="id 배열 JSON")
    ap.add_argument("--env", required=True, help="수집기 .env 경로")
    ap.add_argument("--proposal", default="P-074")
    ap.add_argument("--sample-out", help="바뀌는 전후 문장 표본 20개를 쓸 파일")
    ap.add_argument("--changes-out", help="전체 전후 문장을 쓸 파일")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()

    ids = json.load(open(args.ids_file, encoding="utf-8"))
    assert len(ids) == len(set(ids)), "id 중복"
    base, headers = connect(args.env)
    rows = {r["id"]: r for r in fetch_ids(base, headers, ids)}
    assert set(rows) == set(ids), f"DB에 없는 id: {sorted(set(ids) - set(rows))[:10]}"

    changes = []
    for i in ids:
        r = rows[i]
        new = fix_spot_summaries.generate_curated_summary(
            r["name"], r["category"] or "", r["region"] or "", r["area"] or "", r["signature_items"] or [], spot_id=i)
        if new and new != r["summary"]:
            changes.append({"id": i, "name": r["name"], "category": r["category"], "is_closed": r["is_closed"],
                            "old": r["summary"], "new": new})
    print(f"대상 {len(ids)} · 바뀜 {len(changes)} · 그대로 {len(ids) - len(changes)}")
    if args.changes_out:
        json.dump(changes, open(args.changes_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if args.sample_out:
        sample = random.Random(7440).sample(changes, min(20, len(changes)))
        json.dump(sample, open(args.sample_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if not args.apply:
        print("드라이런이다. 쓰려면 --apply")
        return

    stamp = datetime.now(KST).strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"{args.proposal.lower().replace('-', '')}_summary_{stamp}.json")
    os.makedirs(args.backup_dir, exist_ok=True)
    with open_new(backup) as f:
        json.dump([{k: rows[i][k] for k in ("id", "name", "summary", "is_closed")} for i in ids], f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
        backup = f.name  # 같은 이름이 있으면 open_new가 -2를 붙인다
    saved = json.load(open(backup, encoding="utf-8"))
    assert len(saved) == len(ids), "백업 행 수 불일치"
    print(f"백업 {backup} rows={len(saved)}")

    done, skipped, failed = 0, [], []
    for c in changes:
        # 읽은 뒤 수집기가 summary를 고쳤으면 조건이 맞지 않아 0행이 돌아온다
        q = f"{base}/rest/v1/spots?id=eq.{c['id']}&summary=eq.{urllib.parse.quote(c['old'], safe='')}"
        try:
            got = request(q, {**headers, "Prefer": "return=representation"}, "PATCH", {"summary": c["new"]})
        except Exception as e:  # noqa: BLE001
            failed.append((c["id"], str(e)))
            continue
        if got:
            done += 1
        else:
            skipped.append(c["id"])
    print(f"씀 {done} · 건너뜀(그사이 바뀜) {len(skipped)} {skipped[:10]} · 실패 {failed[:5]}")

    after = {r["id"]: r for r in fetch_ids(base, headers, ids)}
    ok = sum(1 for c in changes if after[c["id"]]["summary"] == c["new"])
    untouched = sum(1 for i in ids if i not in {c["id"] for c in changes} and after[i]["summary"] == rows[i]["summary"])
    print(f"재조회: 바뀐 곳 {ok}/{len(changes)} · 대상이지만 안 바꾼 곳 변화 없음 {untouched}/{len(ids) - len(changes)}")


if __name__ == "__main__":
    main()
