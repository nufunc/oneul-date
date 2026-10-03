#!/usr/bin/env python3
"""P-041 일회성 교정: 좌표와 카카오 장소 id가 없는 web 출처 열린 행을 닫는다. 기본은 드라이런이고 --apply일 때만 쓴다.

대상은 docs/planning/discard-nocoords-web-20261003.json의 행이다. 라이브 DB에서 다시 읽어 지금도
열려 있고, 출처가 web이고, 좌표가 없고, 카카오 링크가 장소 id가 아닌 행만 닫는다(그사이 바뀐 행은 제외).

같은 장소의 다른 열린 행이 있으면 source.note에 merged_into:{id}를 남겨 찜·공유 링크가 그 행으로 가게 한다.
다른 행 조건: 좌표가 있는 열린 행이고 대상 목록 밖이며, 같은 시·도이고, normalize_spot_name이 같거나
한쪽이 다른 쪽을 포함한다(짧은 쪽 3자 이상). 포함 관계일 때는 숙소·상품어가 한쪽에만 있으면 묶지 않는다.
후보가 여럿이면 이름이 같은 행, 같은 시군구, 작은 id 순으로 고른다. 포함 관계는 사람이 본 뒤 틀린 것을 REVIEW_REJECTED로 뺀다.
빈 필드 이관은 이름이 같은 행에만 한다. 대상 행 값은 지도에서 찾을 수 없는 리서치 메모라 위치·분류·지표는 옮기지 않는다.
나머지는 source.note에 closed:를 남기고 닫는다. recover_naver_captcha_closures.py는 이 표시가 있으면 되열지 않는다.

OCI 호스트에서 돌린다: COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 close_nocoords_web_spots.py TARGETS [--apply]
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

COLLECTOR_DIR = os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector")
sys.path.insert(0, COLLECTOR_DIR)
from supabase_worker import normalize_spot_name, LODGING_PRODUCT_RE  # noqa: E402

KAKAO_PLACE_RE = re.compile(r"place\.map\.kakao\.com/\d+")
NO_TRANSFER = {"id", "name", "category", "source", "is_closed", "created_at", "updated_at", "address", "location", "lat", "lng",
               "region", "area", "slot", "provider_ids", "social_links", "metrics", "hot_score", "quality_score", "fail_count",
               "verified", "last_verified_at", "image_url"}
# 2026-10-03 드라이런의 포함 관계 78건을 사람이 본 결과 다른 곳을 가리키는 26건. 묶지 않고 닫기만 한다.
# 지명만 같은 행(강화도·대청호·낙동강·곤지암·수성못), 그 자리 근처 식당(해녀의집·갈매기집·노을그릴),
# 다른 시군구의 같은 이름(안성 목향원→남양주, 오산 메종드포레스트→광주), 낱말 일부만 겹친 이름(포레스트·피치 성수)
REVIEW_REJECTED = {641, 872, 1145, 1640, 3043, 3229, 3444, 3683, 3778, 3787, 4059, 4256, 4922, 4932, 4935, 4950, 4960, 5118,
                   5665, 5899, 5900, 5940, 5944, 5972, 6038, 6248}
SIDO = {"서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천", "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종",
        "경기": "경기", "강원": "강원", "충청북": "충북", "충북": "충북", "충청남": "충남", "충남": "충남", "전라북": "전북", "전북": "전북",
        "전라남": "전남", "전남": "전남", "경상북": "경북", "경북": "경북", "경상남": "경남", "경남": "경남", "제주": "제주"}


def load_env():
    env = {}
    with open(os.path.join(COLLECTOR_DIR, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    # 수집기 .env는 컨테이너용 주소라 호스트에서는 127.0.0.1의 중계 서버로 간다
    return env["SUPABASE_URL"].replace("host.docker.internal", "127.0.0.1").rstrip("/"), env["SUPABASE_SERVICE_KEY"]


def request(url, headers, method="GET", body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=60) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def fetch_ids(base, headers, ids):
    rows = []
    for i in range(0, len(ids), 100):
        rows += request(f"{base}/rest/v1/spots?select=*&id=in.({','.join(map(str, ids[i:i + 100]))})", headers)
    return rows


def fetch_open(base, headers):
    rows, last = [], 0
    while True:
        page = request(f"{base}/rest/v1/spots?select=*&is_closed=eq.false&order=id.asc&id=gt.{last}&limit=1000", headers)
        rows += page
        if len(page) < 1000:
            return rows
        last = page[-1]["id"]


def sido_of(row):
    for text in (row.get("region"), (row.get("address") or "").split(" ")[0], (row.get("location") or "").split(" ")[0]):
        for k, v in SIDO.items():
            if text and text.startswith(k):
                return v
    return None


def has_coords(row):
    return row.get("lat") not in (None, "") and row.get("lng") not in (None, "")


def still_target(row):
    url = ((row.get("social_links") or {}).get("kakaomap") or {}).get("url") or ""
    return (not row["is_closed"] and (row.get("source") or {}).get("type") == "web" and not has_coords(row)
            and not KAKAO_PLACE_RE.search(url))


def find_sibling(row, candidates):
    name, sido = normalize_spot_name(row["name"]), sido_of(row)
    if not sido or len(name) < 2:
        return None, None
    hits = []
    for c in candidates:
        if sido_of(c) != sido:
            continue
        other = normalize_spot_name(c["name"])
        if other == name:
            hits.append((0, c))
        elif min(len(other), len(name)) >= 3 and (other in name or name in other):
            if bool(LODGING_PRODUCT_RE.search(row["name"])) != bool(LODGING_PRODUCT_RE.search(c["name"])):
                continue
            hits.append((1, c))
    if not hits:
        return None, None
    hits.sort(key=lambda h: (h[0], h[1].get("area") != row.get("area"), h[1]["id"]))
    return hits[0][1], ("exact" if hits[0][0] == 0 else "contains")


def empty(v):
    return v in (None, "", [], {}, "unknown", "none")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("targets", help="discard-nocoords-web-20261003.json")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    ap.add_argument("--report", help="행별 처리 계획을 JSON으로 저장할 경로")
    args = ap.parse_args()

    base, key = load_env()
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    target_ids = [r["id"] for r in json.load(open(args.targets, encoding="utf-8"))["rows"]]
    current = fetch_ids(base, headers, target_ids)
    by_id = {r["id"]: r for r in current}
    excluded = {i: ("행 없음" if i not in by_id else "조건 바뀜") for i in target_ids
                if i not in by_id or not still_target(by_id[i])}
    targets = [by_id[i] for i in target_ids if i not in excluded]
    target_set = set(target_ids)
    candidates = [r for r in fetch_open(base, headers) if r["id"] not in target_set and has_coords(r)]

    plan = []
    for row in targets:
        sib, kind = find_sibling(row, candidates)
        if kind == "contains" and row["id"] in REVIEW_REJECTED:
            sib, kind = None, None
        fill = {k: v for k, v in row.items() if kind == "exact" and k not in NO_TRANSFER and not empty(v) and empty(sib.get(k))}
        plan.append({"row": row, "keep": sib, "kind": kind, "fill": fill})

    merged = [p for p in plan if p["keep"]]
    print(f"대상 {len(target_ids)} · 제외 {len(excluded)} {excluded} · 닫을 행 {len(plan)} · merged_into {len(merged)}"
          f"(같은 이름 {sum(p['kind'] == 'exact' for p in merged)}, 포함 {sum(p['kind'] == 'contains' for p in merged)}) · "
          f"빈 필드 채울 행 {sum(bool(p['fill']) for p in plan)}")
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump({"excluded": excluded,
                       "merged": [{"id": p["row"]["id"], "name": p["row"]["name"], "kind": p["kind"], "into": p["keep"]["id"],
                                   "into_name": p["keep"]["name"], "into_address": p["keep"].get("address"),
                                   "fill_fields": sorted(p["fill"])} for p in merged]},
                      f, ensure_ascii=False, indent=1)
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p041_close_nocoords_web_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as f:
        # 대상 563행 전체(제외 행 포함)와 빈 필드를 채울 남길 행의 원본, id 매핑을 남긴다
        json.dump({"rows": current, "keep_rows": [p["keep"] for p in plan if p["fill"]],
                   "id_map": {str(p["row"]["id"]): p["keep"]["id"] for p in merged}}, f, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    closed = filled = 0
    failed = []
    for p in plan:
        row, keep = p["row"], p["keep"]
        source = dict(row.get("source") or {})
        tag = (f"merged_into:{keep['id']} ({stamp[:8]} P-041 좌표·카카오 장소 id 없는 web 행, 같은 이름 열린 행으로)" if keep
               else f"closed: P-041 좌표·카카오 장소 id 없는 web 행, 지도에서 찾을 수 없음 ({stamp[:8]})")
        source["note"] = f"{(source.get('note') or '').strip()} | {tag}".lstrip(" |")
        # 남길 행이 지금도 열려 있는지 쓰기 직전에 다시 본다
        if keep and not request(f"{base}/rest/v1/spots?select=id&id=eq.{keep['id']}&is_closed=eq.false", headers):
            failed.append((row["id"], "남길 행이 닫힘"))
            continue
        res = request(f"{base}/rest/v1/spots?id=eq.{row['id']}&is_closed=eq.false", rep, "PATCH",
                      {"is_closed": True, "source": source, "updated_at": now})
        if len(res or []) != 1:
            failed.append((row["id"], "닫기 응답 0행"))
            continue
        closed += 1
        if p["fill"]:
            res = request(f"{base}/rest/v1/spots?id=eq.{keep['id']}&is_closed=eq.false", rep, "PATCH", {**p["fill"], "updated_at": now})
            filled += len(res or []) == 1
    print(f"닫음 {closed} · 빈 필드 채움 {filled} · 실패 {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
