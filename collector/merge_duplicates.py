#!/usr/bin/env python3
"""열린 중복 스팟을 찾아 소프트 병합한다. 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

자동 병합 대상은 하나다: normalize_spot_name이 같고 normalize_spot_address도 같은 열린 행들.
2026-09-26 실측 70그룹/141행이었고 표본이 전부 같은 가게였다(동궁과 월지/동궁과월지, 카페루시아/카페루시아 본점).
정규화 주소에 번지 숫자가 없거나(동까지만 남은 주소) 그룹 안 좌표가 200m 넘게 떨어지면 자동 병합하지 않는다.

검토 목록만 내는 유형: 이름이 같고 50m 이내인데 같은 도로·동에서 번지만 다른 행들(오기로 보이는 62그룹).
좌표가 이름 검색으로 붙은 경우가 많아 좌표만으로는 같은 곳이라는 근거가 되지 못하므로 사람이 본다.

병합 규약(project_merge_script_convention):
- hard DELETE를 하지 않는다. 가장 작은 id를 남긴다.
- 남길 행의 빈 필드만 병합될 행 값으로 채운다. category는 옮기지 않는다.
- 병합될 행은 is_closed=true로 닫고 source.note에 merged_into:{id}를 남긴다.
- 쓰기 전에 대상 행 전체를 백업하고 id 매핑을 남긴다.

사용: python3 merge_duplicates.py [--apply] [--backup-dir DIR]
"""
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone

from supabase_worker import load_env, normalize_spot_address, normalize_spot_name

NO_TRANSFER_FIELDS = {"id", "name", "category", "is_closed", "source", "created_at", "updated_at"}
MAX_GROUP_DISTANCE_M = 200
REVIEW_DISTANCE_M = 50
_ROAD_NUM_RE = re.compile(r'(\S+(?:로|길|동|리|가))\s+(\d+(?:-\d+)?)')


def _request(url, headers, method="GET", body=None, attempts=4):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == attempts:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts:
                raise
        time.sleep(10)


def fetch_open_spots(base_url, headers):
    """열린 행 전체를 id 키셋으로 받는다(offset은 도중에 행이 닫히면 한 칸씩 밀려 행을 빠뜨린다)."""
    rows, last_id = [], 0
    while True:
        page = _request(f"{base_url}/rest/v1/spots?select=*&is_closed=eq.false&order=id.asc&id=gt.{last_id}&limit=1000", headers)
        if not page:
            return rows
        rows.extend(page)
        last_id = page[-1]["id"]
        if len(page) < 1000:
            return rows


def _distance_m(a, b):
    if None in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return None
    lat1, lng1, lat2, lng2 = map(math.radians, (float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def _max_distance(rows):
    ds = [d for i, a in enumerate(rows) for b in rows[i + 1:] if (d := _distance_m(a, b)) is not None]
    return max(ds) if ds else 0


def _empty(v):
    return v is None or v == "" or v == [] or v == {}


def find_merge_groups(rows):
    """자동 병합 그룹: 정규화 이름 + 정규화 주소가 같은 열린 행들."""
    buckets = {}
    for r in rows:
        addr = normalize_spot_address(r.get("address") or "")
        name = normalize_spot_name(r.get("name"))
        if not addr or not re.search(r"\d", addr) or len(name) < 2:
            continue
        buckets.setdefault((name, addr), []).append(r)
    groups, skipped_far = [], []
    for g in buckets.values():
        if len(g) < 2:
            continue
        g.sort(key=lambda r: r["id"])
        (skipped_far if _max_distance(g) > MAX_GROUP_DISTANCE_M else groups).append(g)
    return groups, skipped_far


def find_review_pairs(rows, merged_ids):
    """검토 목록: 이름이 같고 50m 이내인데, 같은 시군구·같은 도로(동)에서 번지만 다른 쌍."""
    by_name = {}
    for r in rows:
        if r["id"] in merged_ids:
            continue
        name = normalize_spot_name(r.get("name"))
        if len(name) >= 2:
            by_name.setdefault(name, []).append(r)
    pairs = []
    for g in by_name.values():
        for i, a in enumerate(g):
            for b in g[i + 1:]:
                d = _distance_m(a, b)
                if d is None or d > REVIEW_DISTANCE_M:
                    continue
                ta, tb = (a.get("address") or "").split(), (b.get("address") or "").split()
                ma, mb = _ROAD_NUM_RE.search(a.get("address") or ""), _ROAD_NUM_RE.search(b.get("address") or "")
                if (len(ta) > 1 and len(tb) > 1 and ta[1] == tb[1] and ma and mb
                        and ma.group(1) == mb.group(1) and ma.group(2) != mb.group(2)):
                    pairs.append((a, b, round(d, 1)))
    return pairs


def plan_merge(group):
    """남길 행(최소 id)에 채울 빈 필드와 닫을 행을 계산한다. 앞선 행의 값을 우선한다."""
    keep, dups = group[0], group[1:]
    fill = {}
    for dup in dups:
        for k, v in dup.items():
            if k in NO_TRANSFER_FIELDS or _empty(v):
                continue
            if _empty(keep.get(k)) and k not in fill:
                fill[k] = v
    return keep, dups, fill


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다(기본은 드라이런)")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    ap.add_argument("--report", help="드라이런 결과(병합 그룹·검토 목록)를 JSON으로 저장할 경로")
    args = ap.parse_args()
    return run_merge(apply=args.apply, backup_dir=args.backup_dir, report_path=args.report)


def run_merge(apply=False, backup_dir=None, report_path=None, log=print):
    env = load_env()
    base_url = (os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY") or ""  # main.py와 같은 순서
    if not base_url:
        log("SUPABASE_URL이 없어 중단한다")
        return 1
    headers = {"Content-Type": "application/json"}
    if key:
        headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    rows = fetch_open_spots(base_url, headers)
    groups, skipped_far = find_merge_groups(rows)
    plans = [plan_merge(g) for g in groups]
    merged_ids = {d["id"] for _, dups, _ in plans for d in dups}
    review = find_review_pairs(rows, merged_ids)

    log(f"열린 행 {len(rows)}개 · 자동 병합 {len(groups)}그룹(닫을 행 {len(merged_ids)}개) · "
        f"좌표가 {MAX_GROUP_DISTANCE_M}m 넘게 떨어져 제외 {len(skipped_far)}그룹 · 검토 목록 {len(review)}쌍")
    for keep, dups, fill in plans[:10]:
        log(f"  남김 {keep['id']} {keep['name']} | {keep.get('address')}")
        for d in dups:
            log(f"    닫음 {d['id']} {d['name']} | {d.get('address')}")
        if fill:
            log(f"    채울 필드: {sorted(fill)}")

    if report_path:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump({
                "merge_groups": [{"keep": k["id"], "close": [d["id"] for d in ds], "fill_fields": sorted(fl),
                                  "rows": [{x: r.get(x) for x in ("id", "name", "address", "lat", "lng", "category")} for r in [k, *ds]]}
                                 for k, ds, fl in plans],
                "skipped_far": [[r["id"] for r in g] for g in skipped_far],
                "review_pairs": [{"a": a["id"], "b": b["id"], "name": [a["name"], b["name"]],
                                  "address": [a.get("address"), b.get("address")], "distance_m": d} for a, b, d in review],
            }, f, ensure_ascii=False, indent=2)
        log(f"보고서: {report_path}")

    if not apply or not plans:
        if not apply:
            log("드라이런: DB에 쓰지 않았다. 실제 병합은 --apply")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    os.makedirs(backup_dir, exist_ok=True)
    backup_path = os.path.join(backup_dir, f"merge_duplicates_{stamp}.json")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump({"rows": [r for g in groups for r in g],
                   "id_map": {str(d["id"]): k["id"] for k, ds, _ in plans for d in ds}}, f, ensure_ascii=False, indent=2)
    log(f"백업과 id 매핑: {backup_path}")

    now = datetime.now(timezone.utc).isoformat()
    closed = 0
    for keep, dups, fill in plans:
        # 병합될 행을 먼저 닫는다. 도중에 멈춰도 열린 중복이 남을 뿐 남길 행이 잘못 바뀌지는 않는다
        for d in dups:
            source = d.get("source") if isinstance(d.get("source"), dict) else {}
            note = (source.get("note") or "").strip()
            source = {**source, "note": f"{note} | merged_into:{keep['id']} ({stamp[:8]} 정규화 이름·주소 중복)".lstrip(" |")}
            _request(f"{base_url}/rest/v1/spots?id=eq.{d['id']}", {**headers, "Prefer": "return=minimal"}, "PATCH",
                     {"is_closed": True, "source": source, "updated_at": now})
            closed += 1
        if fill:
            _request(f"{base_url}/rest/v1/spots?id=eq.{keep['id']}", {**headers, "Prefer": "return=minimal"}, "PATCH",
                     {**fill, "updated_at": now})
    log(f"병합 완료: {len(plans)}그룹, {closed}행을 닫았다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
