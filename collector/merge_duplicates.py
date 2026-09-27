#!/usr/bin/env python3
"""열린 중복 스팟을 찾아 소프트 병합한다. 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

자동 병합 대상은 둘이다.
1. normalize_spot_name이 같고 normalize_spot_address도 같은 열린 행들.
2. 10m 이내이고 지역어·일반어를 뗀 핵심 이름(spot_core_name)이 같은 열린 행들(2026-09-27 추가, 드라이런 192군집).
   숙소·상품어가 한쪽에만 있거나 kakao 장소 번호가 서로 다르면 묶지 않는다.
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

from supabase_worker import (load_env, normalize_spot_address, normalize_spot_name, spot_core_name,
                             LODGING_PRODUCT_RE, place_name_matches)

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


SAME_COORD_M = 10


def find_samecoord_groups(rows, merged_ids):
    """자동 병합 그룹 2: 10m 이내이고 지역어·일반어를 뗀 핵심 이름(spot_core_name)이 같은 열린 행들
    ('카메라타'/'카메라타 음악감상실'). 주소 번지가 달라도 묶는다. 숙소·상품어가 한쪽에만 있거나,
    두 행의 kakao 장소 번호가 서로 다르면 묶지 않는다. 좌표는 이름 검색으로 붙은 경우가 많아 핵심 이름 일치를 필수로 둔다."""
    grid = {}
    for r in rows:
        if r["id"] in merged_ids or r.get("lat") in (None, "") or r.get("lng") in (None, ""):
            continue
        key = spot_core_name(r.get("name"), r.get("address"))
        if len(key) < 3:
            continue
        r["_core"] = key
        grid.setdefault((key, round(float(r["lat"]), 3), round(float(r["lng"]), 3)), []).append(r)
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_id = {}
    for (key, la, lo), bucket in grid.items():
        near = [r for dla in (-0.001, 0, 0.001) for dlo in (-0.001, 0, 0.001)
                for r in grid.get((key, round(la + dla, 3), round(lo + dlo, 3)), [])]
        for a in bucket:
            for b in near:
                if a["id"] >= b["id"]:
                    continue
                d = _distance_m(a, b)
                if d is None or d > SAME_COORD_M:
                    continue
                if bool(LODGING_PRODUCT_RE.search(a["name"])) != bool(LODGING_PRODUCT_RE.search(b["name"])):
                    continue
                ka, kb = (a.get("provider_ids") or {}).get("kakao"), (b.get("provider_ids") or {}).get("kakao")
                if ka and kb and ka != kb:
                    continue
                by_id[a["id"]], by_id[b["id"]] = a, b
                parent[find(a["id"])] = find(b["id"])
    groups = {}
    for i in by_id:
        groups.setdefault(find(i), []).append(by_id[i])
    return [sorted(g, key=lambda r: r["id"]) for g in groups.values() if len(g) >= 2]


def coord_to_addresses(lat, lng, kakao_key):
    """카카오 좌표→주소 변환. 도로명·지번 주소의 정규화 값 집합(없으면 빈 집합)."""
    url = f"https://dapi.kakao.com/v2/local/geo/coord2address.json?x={lng}&y={lat}"
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {kakao_key}"})
        docs = json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8")).get("documents") or []
    except Exception:
        return set()
    out = set()
    for d in docs:
        for k in ("road_address", "address"):
            a = (d.get(k) or {}).get("address_name")
            if a:
                out.add(normalize_spot_address(a))
    return out


def resolve_address_group(group, kakao_key):
    """주소가 다른 같은 좌표 그룹에서 남길 행을 근거로 고른다. 공유 좌표를 주소로 바꿔 정규화 주소가 맞는 행을 남긴다.
    맞는 행이 없거나, 맞는 행들의 주소가 서로 다르거나, 핵심 이름이 3자 이하(흔한 이름)면 None(검토)."""
    if len(group[0].get("_core") or spot_core_name(group[0].get("name"), group[0].get("address"))) <= 3:
        return None
    lat = sum(float(r["lat"]) for r in group) / len(group)
    lng = sum(float(r["lng"]) for r in group) / len(group)
    truth = coord_to_addresses(lat, lng, kakao_key)
    matched = [r for r in group if normalize_spot_address(r.get("address") or "") in truth]
    if not matched or len({normalize_spot_address(r["address"]) for r in matched}) > 1:
        return None
    keep = min(matched, key=lambda r: r["id"])
    # 좌표 자체가 이름 검색으로 다른 지점에 붙었을 수 있다('그라운드시소 서촌' 좌표가 세종대로 14를 가리킴).
    # 좌표 100m 안에서 핵심 이름으로 카카오 장소를 찾아, 이름이 맞는 장소의 주소가 남길 행의 주소와 같을 때만 확정한다
    if not _poi_confirms(keep, lat, lng, kakao_key):
        return None
    return [keep] + [r for r in group if r is not keep]


def _poi_confirms(row, lat, lng, kakao_key, radius=100):
    q = urllib.parse.quote(row.get("name") or "")
    url = (f"https://dapi.kakao.com/v2/local/search/keyword.json?size=15&sort=distance&x={lng}&y={lat}&radius={radius}&query={q}")
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {kakao_key}"})
        docs = json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8")).get("documents") or []
    except Exception:
        return False
    target = normalize_spot_address(row.get("address") or "")
    for d in docs:
        if not place_name_matches(row.get("name"), d.get("place_name")):
            continue
        addrs = {normalize_spot_address(d.get("road_address_name") or ""), normalize_spot_address(d.get("address_name") or "")}
        if target in addrs:
            return True
    return False


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
    ap.add_argument("--include-address-differs", action="store_true", help="주소가 다른 같은 좌표 그룹도 병합한다(기본은 건너뜀)")
    args = ap.parse_args()
    return run_merge(apply=args.apply, backup_dir=args.backup_dir, report_path=args.report,
                     skip_address_differs=not args.include_address_differs)


def run_merge(apply=False, backup_dir=None, report_path=None, log=print, skip_address_differs=True):
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
    in_groups = {r["id"] for g in groups for r in g}
    coord_groups = find_samecoord_groups(rows, in_groups)
    # 주소가 다른 좌표 그룹은 좌표가 이름 검색으로 한쪽에 붙었을 수 있고, 남길 최소 id의 주소가 틀린 쪽일 수 있다.
    # 근거로 남길 행을 고르기 전까지 기본은 건너뛴다(2026-09-27 호스트 검토: 피커스 클라이밍 구로점, 에이트 등)
    differs = lambda g: len({normalize_spot_address(r.get("address") or "") for r in g}) > 1
    skipped_addr = [g for g in coord_groups if differs(g)] if skip_address_differs else []
    coord_groups = [g for g in coord_groups if not (skip_address_differs and differs(g))]
    # 주소가 다른 그룹은 카카오 키가 있으면 공유 좌표의 주소와 그 자리의 카카오 장소로 남길 행을 고른다.
    # 고르지 못한 그룹(맞는 행 없음, 흔한 이름, 장소 확인 실패)은 계속 건너뛴다
    resolved_addr = []
    kakao_key = os.getenv("KAKAO_REST_API_KEY") or env.get("KAKAO_REST_API_KEY") or ""
    if skipped_addr and kakao_key:
        still = []
        for g in skipped_addr:
            ordered = resolve_address_group(g, kakao_key)
            (resolved_addr if ordered else still).append(ordered or g)
            time.sleep(0.2)
        skipped_addr = still
    coord_groups += resolved_addr
    coord_plans = [plan_merge(g) for g in coord_groups]
    resolved_keep_ids = {g[0]["id"] for g in resolved_addr}
    plans += coord_plans
    merged_ids = {d["id"] for _, dups, _ in plans for d in dups}
    review = find_review_pairs(rows, merged_ids)
    addr_diff = sum(1 for g in coord_groups if differs(g))

    log(f"열린 행 {len(rows)}개 · 자동 병합 {len(groups)}+{len(coord_groups)}그룹(정규화 이름·주소 + 같은 좌표·핵심 이름, "
        f"닫을 행 {len(merged_ids)}개, 주소가 달라 좌표 주소로 남길 행을 고른 그룹 {len(resolved_addr)}, 주소 달라 건너뜀 {len(skipped_addr)}) · "
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
                                  "kind": ("same_coord_core_resolved" if k["id"] in resolved_keep_ids else "same_coord_core")
                                          if (k, ds, fl) in coord_plans else "name_address",
                                  "address_differs": len({normalize_spot_address(r.get("address") or "") for r in [k, *ds]}) > 1,
                                  "rows": [{x: r.get(x) for x in ("id", "name", "address", "lat", "lng", "category")} for r in [k, *ds]]}
                                 for k, ds, fl in plans],
                "skipped_far": [[r["id"] for r in g] for g in skipped_far],
                "skipped_address_differs": [[{x: r.get(x) for x in ("id", "name", "address", "lat", "lng")} for r in g] for g in skipped_addr],
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
        # 바꿀 행 전부(남길 행과 닫을 행)의 원래 값을 남긴다. 종전에는 정규화 이름·주소 그룹만 저장해
        # 같은 좌표 그룹으로 닫은 행과 채운 남길 행의 원본이 빠졌다(2026-09-27 262행)
        json.dump({"rows": [r for k, ds, _ in plans for r in [k, *ds]],
                   "id_map": {str(d["id"]): k["id"] for k, ds, _ in plans for d in ds}}, f, ensure_ascii=False, indent=2)
    log(f"백업과 id 매핑: {backup_path}")

    now = datetime.now(timezone.utc).isoformat()
    closed = 0
    for keep, dups, fill in plans:
        # 병합될 행을 먼저 닫는다. 도중에 멈춰도 열린 중복이 남을 뿐 남길 행이 잘못 바뀌지는 않는다
        for d in dups:
            source = d.get("source") if isinstance(d.get("source"), dict) else {}
            note = (source.get("note") or "").strip()
            reason = ("같은 좌표·핵심 이름 중복, 좌표 주소와 맞는 행을 남김" if keep["id"] in resolved_keep_ids
                      else "같은 좌표·핵심 이름 중복" if (keep, dups, fill) in coord_plans else "정규화 이름·주소 중복")
            source = {**source, "note": f"{note} | merged_into:{keep['id']} ({stamp[:8]} {reason})".lstrip(" |")}
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
