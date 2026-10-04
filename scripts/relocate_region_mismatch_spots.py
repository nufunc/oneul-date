#!/usr/bin/env python3
"""P-050 일회성 교정: 출처 지역과 주소가 다른 행을 출처 지역의 같은 이름 지점으로 옮긴다. 기본은 드라이런이고 --apply일 때만 쓴다.

결과 파일 fix 목록의 행마다 검증 때 쓴 검색어로 카카오를 다시 찾아 목표 지점(같은 도로명 주소)을 고른다.
목표 지점이 이미 DB에 열린 행으로 있으면 옮기지 않고 병합 규약대로 합친다: 이 행을 닫고 source.note에 merged_into:{id}를 남기며,
남는 행의 빈 필드만 이 행의 장소와 무관한 값(영상, 분위기)으로 채운다. 주소, 사진, 영업시간은 옛 지점 값이라 옮기지 않는다.
목표 지점이 닫힌 행으로만 있거나 조회가 실패하면 건드리지 않고 보고한다.
없으면 이름, 주소, 좌표, 시군구, 카카오 장소 번호와 링크를 바꾸고 옛 지점 사진과 지점 고유 값(영업시간, 휴무일, 가격)을 비운다
(수집기 재검증이 새 지점 값을 채운다). 카테고리는 바꾸지 않는다(병합 규약: 검수 뒤에만).
--followup은 이동을 마친 백업 파일을 받아, 아직 옛 지점 값 그대로인 지점 고유 값을 비우고 --category-ids 행의 카테고리를
백업에 남긴 카카오 카테고리의 마지막 단계로 바꾼다(사이클 39 리드 결정: 미크, 산스). 카카오를 부르지 않는다.

OCI 호스트에서 돌린다:
COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 relocate_region_mismatch_spots.py region-mismatch-20261003.json \\
  --backup-dir /home/opc/oneul-backups [--apply]
후속: ... relocate_region_mismatch_spots.py --followup p050_relocate_YYYYMMDD-HHMMSS.json --category-ids 1,2 [--apply]
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from judge_date_fit import connect
from close_date_fit_spots import fetch_ids, request

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
from state_io import open_new  # noqa: E402
from supabase_worker import _find_duplicate  # noqa: E402

PROPOSAL = "P-050"
MERGE_FIELDS = ("mood", "mood_tags", "date_contexts")  # 장소와 무관한 값. 영상은 social_links.youtube로 따로 옮긴다
# 옛 지점 값이라 옮길 때 비우는 지점 고유 필드와 빈 값. 평점과 리뷰 수는 social_links.kakaomap을 새로 쓰며 버린다
PLACE_FIELDS = {"business_hours": {}, "break_time": {}, "closed_days": [], "is_24h": False, "price": None, "price_tier": None,
                "avg_price_per_person": None}


def kakao_key():
    collector = os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector")
    with open(os.path.join(collector, ".env"), encoding="utf-8") as f:
        return next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in f if line.startswith("KAKAO_REST_API_KEY="))


def kakao_place(query, road_addr, key):
    url = "https://dapi.kakao.com/v2/local/search/keyword.json?" + urllib.parse.urlencode({"query": query, "size": 15})
    with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"}), timeout=15) as res:
        docs = json.loads(res.read().decode("utf-8"))["documents"]
    return next((d for d in docs if d.get("road_address_name") == road_addr), None)


def followup(args, base, headers):
    """이동 백업 이후에도 옛 값 그대로인 지점 고유 필드를 비우고, 지정한 행의 카테고리를 새 지점 카카오 카테고리로 바꾼다."""
    moved = json.load(open(args.followup, encoding="utf-8"))
    old = {r["id"]: r for r in moved["rows"]}
    kakao_cat = {p["id"]: p["kakao"]["category_name"].split(" > ")[-1] for p in moved["plan"] if p["do"] == "move"}
    cat_ids = {int(i) for i in args.category_ids.split(",")} if args.category_ids else set()
    current = {r["id"]: r for r in fetch_ids(base, headers, list(kakao_cat))}
    patches = {}
    for i, row in current.items():
        body = {k: v for k, v in PLACE_FIELDS.items() if row.get(k) != v and row.get(k) == old[i].get(k)}
        if i in cat_ids and row.get("category") != kakao_cat[i]:
            body["category"] = kakao_cat[i]
        if body and not row.get("is_closed"):
            patches[i] = body
            print(f"  {i} {row['name']}: " + ", ".join(f"{k} {row.get(k)!r} → {v!r}" for k, v in body.items()))
    print(f"이동 행 {len(current)} · 고칠 행 {len(patches)}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p050_followup_{stamp}.json")
    with open_new(backup) as f:
        json.dump({"rows": [current[i] for i in patches], "patches": {str(i): b for i, b in patches.items()}}, f, ensure_ascii=False, indent=1)
    print(f"백업: {f.name}")
    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    failed = [i for i, body in patches.items()
              if len(request(f"{base}/rest/v1/spots?id=eq.{i}&is_closed=eq.false", rep, "PATCH", {**body, "updated_at": now}) or []) != 1]
    after = {r["id"]: r for r in fetch_ids(base, headers, list(patches))}
    ok = sum(all(after[i].get(k) == v for k, v in body.items()) for i, body in patches.items())
    print(f"실패 {failed} · 쓰기 뒤 DB 재조회: 반영 {ok}/{len(patches)}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("result", nargs="?", help="region-mismatch-YYYYMMDD.json")
    ap.add_argument("--followup", help="이동 백업 파일(p050_relocate_*.json). 주면 이동 대신 후속 정리만 한다")
    ap.add_argument("--category-ids", help="--followup에서 카테고리를 새 지점 카카오 카테고리로 바꿀 id(쉼표 구분)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()
    if args.followup:
        return followup(args, *connect())

    result = json.load(open(args.result, encoding="utf-8"))
    labeled = {r["id"]: r for r in result["rows"]}
    base, headers = connect()
    key = kakao_key()
    current = {r["id"]: r for r in fetch_ids(base, headers, [x["id"] for x in result["fix"]])}

    plan, skipped = [], {}
    for x in result["fix"]:
        row = current.get(x["id"])
        if not row or row.get("is_closed"):
            skipped[x["id"]] = "행 없음" if not row else "닫힘"
            continue
        found = labeled[x["id"]]["kakao"]["hint_region"][0]
        place = kakao_place(found["query"], found["same_name"][0]["addr"], key)
        if not place:
            skipped[x["id"]] = f"카카오 '{found['query']}'에서 {found['same_name'][0]['addr']} 지점을 다시 찾지 못함"
            continue
        lat, lng = float(place["y"]), float(place["x"])
        is_dup, dup = _find_duplicate(base, headers, place["place_name"], place["road_address_name"], {"kakao": place["id"]}, lat, lng)
        if is_dup and dup is None:
            skipped[x["id"]] = "기존 행 조회 실패"
        elif dup and dup["id"] != row["id"] and dup.get("is_closed"):
            skipped[x["id"]] = f"목표 지점 행 {dup['id']}({dup['name']})이 닫혀 있음"
        elif dup and dup["id"] != row["id"]:
            plan.append({"do": "merge", "row": row, "into": fetch_ids(base, headers, [dup["id"]])[0], "place": place})
        else:
            plan.append({"do": "move", "row": row, "place": place, "lat": lat, "lng": lng})

    for p in plan:
        r, pl = p["row"], p["place"]
        dest = f"병합 → {p['into']['id']} {p['into']['name']}" if p["do"] == "merge" else "이동"
        print(f"  {r['id']} {r['name']} ({r['address']}) {dest}: {pl['place_name']} · {pl['road_address_name']} · kakao {pl['id']}")
    print(f"대상 {len(result['fix'])} · 이동 {sum(p['do'] == 'move' for p in plan)} · 병합 {sum(p['do'] == 'merge' for p in plan)} "
          f"· 제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p050_relocate_{stamp}.json")
    with open_new(backup) as f:
        json.dump({"rows": [r for p in plan for r in (p["row"], p.get("into")) if r],
                   "id_map": {str(p["row"]["id"]): p["into"]["id"] for p in plan if p["do"] == "merge"},
                   "plan": [{"id": p["row"]["id"], "do": p["do"], "kakao": p["place"]} for p in plan], "skipped": skipped},
                  f, ensure_ascii=False, indent=1)
    print(f"백업과 id 매핑: {f.name}")

    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    done, failed = {"move": 0, "merge": 0}, []
    for p in plan:
        row, pl = p["row"], p["place"]
        source = dict(row.get("source") or {})
        links = dict(row.get("social_links") or {})
        if p["do"] == "merge":
            # 닫는 행을 먼저 닫는다. 도중에 멈춰도 남길 행이 잘못 바뀌지는 않는다
            source["note"] = f"{(source.get('note') or '').strip()} | merged_into:{p['into']['id']} ({stamp[:8]} {PROPOSAL} 출처 지역 지점)".lstrip(" |")
            ok = len(request(f"{base}/rest/v1/spots?id=eq.{row['id']}&is_closed=eq.false", rep, "PATCH",
                             {"is_closed": True, "source": source, "updated_at": now}) or []) == 1
            into = p["into"]
            fill = {k: row[k] for k in MERGE_FIELDS if row.get(k) and not into.get(k)}
            if links.get("youtube") and not (into.get("social_links") or {}).get("youtube"):
                fill["social_links"] = {**(into.get("social_links") or {}), "youtube": links["youtube"]}
            if ok and fill:
                ok = len(request(f"{base}/rest/v1/spots?id=eq.{into['id']}&is_closed=eq.false", rep, "PATCH",
                                 {**fill, "updated_at": now}) or []) == 1
        else:
            area = pl["road_address_name"].split()[1]
            source["note"] = (f"{(source.get('note') or '').strip()} | relocated: {PROPOSAL} {row['name']} · {row['address']}"
                              f" → 출처 지역 지점 ({stamp[:8]})").lstrip(" |")
            links["kakaomap"] = {"url": pl["place_url"].replace("http://", "https://")}  # 평점·리뷰 수는 옛 지점 값이라 버린다
            body = {"name": pl["place_name"], "address": pl["road_address_name"], "lat": p["lat"], "lng": p["lng"], "area": area,
                    "location": f"{row.get('region') or ''} {area}".strip(), "image_url": None, "social_links": links,
                    "provider_ids": {**(row.get("provider_ids") or {}), "kakao": pl["id"]}, "source": source, "updated_at": now,
                    **PLACE_FIELDS}
            ok = len(request(f"{base}/rest/v1/spots?id=eq.{row['id']}&is_closed=eq.false", rep, "PATCH", body) or []) == 1
        if ok:
            done[p["do"]] += 1
        else:
            failed.append((row["id"], p["do"]))
    print(f"이동 {done['move']} · 병합 {done['merge']} · 실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, [p["row"]["id"] for p in plan])}
    moved = sum(not after[p["row"]["id"]]["is_closed"] and after[p["row"]["id"]]["address"] == p["place"]["road_address_name"]
                and (after[p["row"]["id"]].get("provider_ids") or {}).get("kakao") == p["place"]["id"] for p in plan if p["do"] == "move")
    merged = sum(after[p["row"]["id"]]["is_closed"] and f"merged_into:{p['into']['id']}" in (after[p["row"]["id"]]["source"].get("note") or "")
                 for p in plan if p["do"] == "merge")
    print(f"쓰기 뒤 DB 재조회: 새 주소·장소 번호 {moved}/{sum(p['do'] == 'move' for p in plan)} · "
          f"닫힘·merged_into {merged}/{sum(p['do'] == 'merge' for p in plan)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
