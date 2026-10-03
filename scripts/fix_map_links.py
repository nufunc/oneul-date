#!/usr/bin/env python3
"""P-052 앱 지도 링크 교정. 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

area: 결과 파일(map-unfindable-YYYYMMDD.json) area_mismatch.ids 행의 area를 주소에서 다시 계산한다(수집기 derive_region_area).
  앱 mapQuery는 짧은 이름 뒤에 area를 붙이는데(main.ts 10-1) area가 주소의 시군구와 달라 틀린 지역을 찾았다(시나루 → 시나루 양천구).
  location에 옛 area가 있으면 같이 바꾼다. 주소에서 시군구를 얻지 못하거나 이미 같아진 행은 건너뛴다.
link: LINK_FIXES 표의 값으로 이름, 주소, 좌표를 고친다. 값은 결과 파일 link_fix_candidates의 근거와 카카오 조회(10-04)로 정했다.
  이름을 바꾼 행은 P-049처럼 source.note에 renamed:를 남기고 옛 이름 검색 링크를 지운다. 소속 명소 이름으로 바꿀 행에 같은 이름의
  열린 행이 이미 있으면 바꾸지 않고 병합 규약대로 합친다(분위기 값만 옮긴다). 주소를 바꾼 행은 area도 새 주소로 계산한다.
고치기 전에 지금도 열려 있고 이름이 결과 파일 때와 같은 행만 고친다.

OCI 호스트: COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 fix_map_links.py map-unfindable-20261003.json \\
  --backup-dir /home/opc/oneul-backups [--apply]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

from judge_date_fit import connect
from close_date_fit_spots import fetch_ids, request
from fix_described_names import VENUE_FIELDS, rename_body

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
from supabase_worker import derive_region_area  # noqa: E402

PROPOSAL = "P-052"
# id: (지금 DB 이름, 바꿀 값). name은 이름 교정, merge_into는 소속 명소의 열린 행으로 병합이다
LINK_FIXES = {
    263: ("로바다야 카덴", {"name": "카덴"}),  # 카카오 주소 자리의 일본식주점 카덴(1256702713)
    3093: ("모나미스토어 본사점", {"name": "모나미스토어 본사수지점"}),  # 네이버 11m
    1788818285589: ("선산5일장 (2, 7일)", {"name": "선산시장 (2, 7일)"}),  # 네이버 선산시장 20m. 장날 괄호는 검색어에서 빠진다
    6748: ("단양구경시장 원조마늘순대", {"name": "원조마늘순대"}),  # 네이버 2m
    5715: ("을왕리해수욕장 선셋로드", {"merge_into": 1790491262151}),  # 을왕리해수욕장 16m. 같은 이름 열린 행이 있다
    5401: ("모나용평 알파인코스터", {"name": "모나용평"}),  # 알파인코스터 단독 장소가 없고 리조트 대표 지점이 2.3km
    5609: ("당현천 달빛산책로 & 음악분수", {"name": "당현천"}),  # 네이버 당현천 859m
    3492: ("설매재자연휴양림 숲체험코스", {"name": "설매재자연휴양림"}),  # 네이버 338m
    # 좌표가 파주 운정카페거리(126.73723, 37.71090)였다. 카카오 주소 검색 김포한강11로140번길 8-6
    785: ("운양동 카페거리", {"lat": 37.6461753129275, "lng": 126.681626660766}),
    # 좌표, 카카오 장소(1382316002), area가 모두 영도점이고 주소만 기장본점이다. 셋에 맞춰 이름과 주소를 영도점으로 고친다
    1465: ("바릇식당", {"name": "올바릇식당 영도점", "address": "부산 영도구 해양로247번길 35"}),
    2767: ("청강도예", {"address": "경기 여주시 여양로 399"}),  # 카카오 25805473, 행 좌표 0m
    # 카카오 661574614(행의 장소 번호)는 화순 이서면이고 DB 주소와 좌표는 무등산 입구(무등로 1550)였다
    1790326402497: ("지공너덜 (무등산권 국가지질공원)",
                    {"address": "전남 화순군 이서면 영평리 산 88-1", "lat": 35.1186704581568, "lng": 127.016170050465}),
}
# 앱이 붙이는 지역어만 틀린 5곳(약사암, 다다르다, 롤파크, 보성사터, 보광사)은 area 목록에 들어 있어 area 교정으로 고친다
# 2026 인천 개편 뒤의 구. 주소가 개편 전 구(중구, 동구, 서구)로 남은 행은 area가 맞다
INCHEON_NEW = {"영종구", "제물포구", "서해구", "검단구"}


def skip_area(row, address=None):
    """area를 고치지 않는 이유. 고칠 행이면 None."""
    _, area = derive_region_area(address or row.get("address"))
    if not area:
        return "주소에서 시군구 없음"
    if area == row.get("area"):
        return "area 같음"
    if (address or row.get("address") or "").startswith("인천") and row.get("area") in INCHEON_NEW:
        return "인천 개편 area"
    return None


def area_patch(row, address=None):
    """주소에서 다시 계산한 area와 location. 바꿀 것이 없으면 빈 dict."""
    if skip_area(row, address):
        return {}
    area, old = derive_region_area(address or row.get("address"))[1], row.get("area")
    patch = {"area": area}
    loc = row.get("location") or ""
    if old and old in loc:
        patch["location"] = loc.replace(old, area)
    return patch


def note_fix(row, text, stamp):
    source = dict(row.get("source") or {})
    source["note"] = f"{(source.get('note') or '').strip()} | fixed: {PROPOSAL} {text} ({stamp[:8]})".lstrip(" |")
    return source


def plan(result, rows):
    area_ids = [i for i in result["area_mismatch"]["ids"] if i not in LINK_FIXES]
    todo, skipped = [], {}
    for i in area_ids + list(LINK_FIXES):
        row = rows.get(i)
        expect = LINK_FIXES.get(i, (None,))[0]
        if not row or row.get("is_closed"):
            skipped[i] = "행 없음" if not row else "닫힘"
            continue
        if expect and row["name"] != expect:
            skipped[i] = f"이름 바뀜: {row['name']}"
            continue
        fix = dict(LINK_FIXES.get(i, (None, {}))[1])
        if "merge_into" in fix:
            keep = rows.get(fix["merge_into"])
            if not keep or keep.get("is_closed"):
                skipped[i] = f"남길 행 {fix['merge_into']} 닫힘"
            else:
                fill = {k: row[k] for k in VENUE_FIELDS if row.get(k) and not keep.get(k)}
                todo.append({"id": i, "do": "merge", "row": row, "keep": keep, "fill": fill})
            continue
        patch = {k: v for k, v in fix.items() if k != "name"}
        patch.update(area_patch(row, fix.get("address")))
        if not patch and "name" not in fix:
            skipped[i] = skip_area(row)
            continue
        todo.append({"id": i, "do": "fix", "row": row, "name": fix.get("name"), "patch": patch})
    return todo, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("result", help="map-unfindable-YYYYMMDD.json")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()

    result = json.load(open(args.result, encoding="utf-8"))
    base, headers = connect()
    ids = set(result["area_mismatch"]["ids"]) | set(LINK_FIXES) | {f["merge_into"] for _, f in LINK_FIXES.values() if "merge_into" in f}
    rows = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    todo, skipped = plan(result, rows)
    for t in todo:
        r = t["row"]
        if t["do"] == "merge":
            print(f"  병합 {r['id']} {r['name']} → {t['keep']['id']} {t['keep']['name']} · 채울 필드 {sorted(t['fill'])}")
        else:
            change = ", ".join(f"{k} {r.get(k)!r} → {v!r}" for k, v in t["patch"].items())
            print(f"  {r['id']} {r['name']}{' → ' + t['name'] if t['name'] else ''}{' · ' + change if change else ''}")
    print(f"대상 {len(ids)} · 교정 {sum(t['do'] == 'fix' for t in todo)} · 병합 {sum(t['do'] == 'merge' for t in todo)} · "
          f"제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p052_map_links_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump({"rows": [t["row"] for t in todo] + [t["keep"] for t in todo if t["do"] == "merge"],
                   "plan": [{k: v for k, v in t.items() if k not in ("row", "keep")} for t in todo],
                   "id_map": {str(t["id"]): t["keep"]["id"] for t in todo if t["do"] == "merge"}, "skipped": skipped},
                  f, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    failed = []
    for t in todo:
        row = t["row"]
        if t["do"] == "merge":
            source = dict(row.get("source") or {})
            source["note"] = f"{(source.get('note') or '').strip()} | merged_into:{t['keep']['id']} ({stamp[:8]} {PROPOSAL} 소속 명소)".lstrip(" |")
            steps = [(row["id"], {"is_closed": True, "source": source, "updated_at": now})]  # 닫는 행을 먼저 닫는다
            if t["fill"]:
                steps.append((t["keep"]["id"], {**t["fill"], "updated_at": now}))
        else:
            body = rename_body(row, t["name"], stamp, now, PROPOSAL) if t["name"] else {"updated_at": now}
            if t["patch"]:
                text = ", ".join(f"{k} {row.get(k)}→{v}" for k, v in t["patch"].items() if k not in ("lat", "lng"))
                if "lat" in t["patch"]:
                    text = f"{text}, 좌표 {row.get('lat')},{row.get('lng')}→{t['patch']['lat']},{t['patch']['lng']}".lstrip(", ")
                body.update({**t["patch"], "source": note_fix({**row, "source": body.get("source", row.get("source"))}, text, stamp)})
            steps = [(row["id"], body)]
        for i, body in steps:
            if len(request(f"{base}/rest/v1/spots?id=eq.{i}&is_closed=eq.false", rep, "PATCH", body) or []) != 1:
                failed.append((i, t["do"]))
    print(f"실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    ok_fix = sum(not after[t["id"]]["is_closed"] and all(after[t["id"]].get(k) == v for k, v in t["patch"].items())
                 and (not t["name"] or after[t["id"]]["name"] == t["name"]) for t in todo if t["do"] == "fix")
    ok_merge = sum(after[t["id"]]["is_closed"] and f"merged_into:{t['keep']['id']}" in (after[t["id"]]["source"].get("note") or "")
                   and not after[t["keep"]["id"]]["is_closed"] for t in todo if t["do"] == "merge")
    print(f"쓰기 뒤 DB 재조회: 교정 {ok_fix}/{sum(t['do'] == 'fix' for t in todo)} · 병합 {ok_merge}/{sum(t['do'] == 'merge' for t in todo)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
