#!/usr/bin/env python3
"""검색으로 같은 장소를 확인한 중복 병합과 카테고리 채움(P-053, P-051, P-054). 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

P-053: 결과 파일(duplicate-merge-YYYYMMDD.json)의 merge 묶음을 병합 규약대로 합치고, 남길 행 12곳은 KEEP_FIX 값으로 고친다.
  keep_fix는 결과 파일에 문장으로만 있어 값을 KEEP_FIX 표로 옮겼다. 장소 번호를 바꾸면 카카오 장소 링크도 새 번호로 바꾸고(옛 평점은 버린다),
  주소를 바꾸면 area를 새 주소로 다시 계산한다.
P-051, P-054: MERGES와 FILLS 표의 행만 쓴다. 닫기는 close_date_fit_spots.py --ids로 따로 한다.
병합은 닫는 행 source.note에 merged_into를 남기고 남는 행의 빈 필드만 채운다(category는 옮기지 않는다). 소속 명소로 합치는 행(야경, 공연)은
영업시간과 가격이 명소의 값이 아니어서 분위기 값만 옮긴다. 쓰기 직전에 다시 읽어 지금도 열려 있고 이름이 결과 파일 때와 같은 행만 고친다.

OCI 호스트: COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 merge_verified_spots.py P-053 \\
  --result duplicate-merge-20261004.json --backup-dir /home/opc/oneul-backups [--apply]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

from judge_date_fit import connect
from close_date_fit_spots import fetch_ids, request
from fix_described_names import VENUE_FIELDS, rename_body, same_name_open
from fix_map_links import area_patch

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
from merge_duplicates import plan_merge  # noqa: E402

# P-053 남길 행 교정(duplicate-merge-20261004.json keep_fix). kakao가 None이면 장소 번호를 비운다
KEEP_FIX = {
    1790355376055: {"kakao": "2047650111"},  # 보현산댐 짚와이어. 장소 번호 없음
    4657: {"kakao": "12728272", "address": "전남 목포시 미항로 115"},  # 목포춤추는바다분수
    514: {"kakao": None},  # 1713644487은 입점 업장 마켓나이트야시장(9497과 같은 번호)
    1790307188322: {"address": "충남 아산시 염치읍 백암리 502-3"},  # 주소가 송곡리뿐이었다
    2405: {"kakao": "1877911730"},  # 377836008은 옛 번호
    6830: {"address": "경기 화성시 효행구 정남면 보통내길219번길 13-12"},
    1295: {"kakao": "8070550"},  # 22020080은 등산로 주산지입구분기점
    1407: {"address": "경남 사천시 해안관광로 381-5"},  # 씨맨스카페
    2328: {"address": "대구 중구 동성로6길 45"},
    8256: {"name": "티하우스에덴"},  # 카카오, 네이버 상호
    597: {"kakao": "1977926085"},
    1790132442986: {"kakao": "540198932"},  # 18661190은 호텔 그랜드 하얏트 서울
}
MERGES = {}  # P-051, P-054 병합: 닫을 id: (지금 이름, 남길 id, 옮길 값)
FILLS = {}  # 카테고리 채움: id: (지금 이름, 카테고리, 바꿀 이름)


def merge_list(proposal, result):
    """(닫을 id, 지금 이름, 남길 id, 남길 행 이름 또는 None, 옮길 값)."""
    if proposal == "P-053":
        return [(m["id"], m["name"], g["keep"]["id"], g["keep"]["name"], "same") for g in result["merge"] for m in g["merge"]]
    return [(i, name, into, None, kind) for i, (name, into, kind) in MERGES.get(proposal, {}).items()]


def keep_fix_patch(keep, fix, stamp, now, proposal):
    """KEEP_FIX 한 줄을 남길 행에 쓸 필드로 바꾼다. note에는 바꾼 값을 남긴다."""
    body, text = {}, []
    if "name" in fix:
        body = rename_body(keep, fix["name"], stamp, now, proposal)
    if "kakao" in fix:
        ids = dict(keep.get("provider_ids") or {})
        old = ids.pop("kakao", None)
        links = dict(keep.get("social_links") or {})
        if fix["kakao"]:
            ids["kakao"] = fix["kakao"]
            if not (links.get("kakaomap") or {}).get("url", "").endswith(f"/{fix['kakao']}"):
                links["kakaomap"] = {"url": f"https://place.map.kakao.com/{fix['kakao']}"}
        elif old and str(old) in (links.get("kakaomap") or {}).get("url", ""):
            del links["kakaomap"]
        body.update({"provider_ids": ids, "social_links": links})
        text.append(f"kakao {old}→{fix['kakao']}")
    if "address" in fix:
        body["address"] = fix["address"]
        body.update(area_patch(keep, fix["address"]))
        text.append(f"address {keep.get('address')}→{fix['address']}")
    if text:
        source = dict(body.get("source") or keep.get("source") or {})
        source["note"] = f"{(source.get('note') or '').strip()} | fixed: {proposal} {', '.join(text)} ({stamp[:8]})".lstrip(" |")
        body["source"] = source
    return body


def plan(proposal, result, rows):
    """병합 묶음과 채움 목록, 건너뛴 행과 이유."""
    groups, skipped = {}, {}
    for i, name, into, into_name, kind in merge_list(proposal, result):
        row, keep = rows.get(i), rows.get(into)
        if not row or row.get("is_closed") or row["name"] != name:
            skipped[i] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif not keep or keep.get("is_closed") or (into_name and keep["name"] != into_name):
            skipped[i] = f"남길 행 {into} " + ("닫힘" if keep and keep.get("is_closed") else "이름 바뀜" if keep else "없음")
        else:
            groups.setdefault(into, []).append((row, kind))
    merges = []
    for keep_id, dups in groups.items():
        keep, fill = rows[keep_id], {}
        for row, kind in dups:
            _, _, f = plan_merge([keep, row])
            if kind == "venue":
                f = {k: v for k, v in f.items() if k in VENUE_FIELDS}
            fill.update({k: v for k, v in f.items() if k not in fill})
        merges.append({"keep": keep, "dups": [r for r, _ in dups], "fill": fill,
                       "fix": KEEP_FIX.get(keep_id) if proposal == "P-053" else None})
    fills = []
    for i, (name, category, new_name) in FILLS.get(proposal, {}).items():
        row = rows.get(i)
        if not row or row.get("is_closed") or row["name"] != name:
            skipped[i] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif row.get("category"):
            skipped[i] = f"카테고리 있음: {row['category']}"
        else:
            fills.append({"row": row, "category": category, "name": new_name})
    return merges, fills, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("proposal", choices=["P-053"])
    ap.add_argument("--result", help="P-053 결과 파일(duplicate-merge-YYYYMMDD.json)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()
    assert args.proposal != "P-053" or args.result, "P-053은 --result가 필요하다"

    result = json.load(open(args.result, encoding="utf-8")) if args.result else {}
    ids = {x for i, _, into, _, _ in merge_list(args.proposal, result) for x in (i, into)} | set(FILLS.get(args.proposal, {}))
    base, headers = connect()
    rows = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    merges, fills, skipped = plan(args.proposal, result, rows)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    now = datetime.now(timezone.utc).isoformat()
    for m in merges:
        m["patch"] = {**m["fill"], **(keep_fix_patch({**m["keep"], **m["fill"]}, m["fix"], stamp, now, args.proposal) if m["fix"] else {})}
        print(f"  병합 {[d['id'] for d in m['dups']]} → {m['keep']['id']} {m['keep']['name']} · 남는 행 고칠 필드 "
              f"{sorted(k for k in m['patch'] if k not in ('source', 'updated_at'))}")
    # 이름을 바꿀 행에 같은 이름의 열린 행이 300m 안에 있으면 이름은 두고 카테고리만 채운다
    for f in fills:
        if f["name"] and (dup := same_name_open(base, headers, f["name"], f["row"])):
            skipped[f["row"]["id"]] = f"이름 그대로(300m 안 같은 이름 열린 행 {dup})"
            f["name"] = None
        print(f"  채움 {f['row']['id']} {f['row']['name']} · {f['category']}{' · 이름 → ' + f['name'] if f['name'] else ''}")
    unfixed = set(KEEP_FIX) - {m["keep"]["id"] for m in merges} if args.proposal == "P-053" else set()
    print(f"병합 {sum(len(m['dups']) for m in merges)}행 → {len(merges)}행 · 남길 행 교정 {sum(bool(m['fix']) for m in merges)}"
          f"(못 함 {sorted(unfixed)}) · 채움 {len(fills)} · 제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    backup = os.path.join(args.backup_dir, f"{args.proposal.lower().replace('-', '')}_merge_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as fp:
        json.dump({"rows": [r for m in merges for r in (m["keep"], *m["dups"])] + [f["row"] for f in fills],
                   "id_map": {str(d["id"]): m["keep"]["id"] for m in merges for d in m["dups"]},
                   "patches": {str(m["keep"]["id"]): m["patch"] for m in merges},
                   "fills": {str(f["row"]["id"]): [f["category"], f["name"]] for f in fills}, "skipped": skipped},
                  fp, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    rep = {**headers, "Prefer": "return=representation"}
    failed = []

    def patch(i, body, what):
        if len(request(f"{base}/rest/v1/spots?id=eq.{i}&is_closed=eq.false", rep, "PATCH", {**body, "updated_at": now}) or []) != 1:
            failed.append((i, what))

    for m in merges:
        # 닫는 행을 먼저 닫는다. 도중에 멈춰도 남길 행이 잘못 바뀌지는 않는다
        for d in m["dups"]:
            source = dict(d.get("source") or {})
            source["note"] = f"{(source.get('note') or '').strip()} | merged_into:{m['keep']['id']} ({stamp[:8]} {args.proposal} 중복)".lstrip(" |")
            patch(d["id"], {"is_closed": True, "source": source}, "close")
        if m["patch"]:
            patch(m["keep"]["id"], m["patch"], "keep")
    for f in fills:
        body = rename_body(f["row"], f["name"], stamp, now, args.proposal) if f["name"] else {}
        patch(f["row"]["id"], {**body, "category": f["category"]}, "fill")
    print(f"실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    ok_close = sum(after[d["id"]]["is_closed"] and f"merged_into:{m['keep']['id']}" in (after[d["id"]]["source"].get("note") or "")
                   for m in merges for d in m["dups"])
    ok_keep = sum(not after[m["keep"]["id"]]["is_closed"] and all(after[m["keep"]["id"]].get(k) == v for k, v in m["patch"].items()
                                                                  if k != "updated_at") for m in merges)
    ok_fill = sum(not after[f["row"]["id"]]["is_closed"] and after[f["row"]["id"]]["category"] == f["category"]
                  and (not f["name"] or after[f["row"]["id"]]["name"] == f["name"]) for f in fills)
    print(f"쓰기 뒤 DB 재조회: 닫힘·merged_into {ok_close}/{sum(len(m['dups']) for m in merges)} · 남는 행 열림·고침 "
          f"{ok_keep}/{len(merges)} · 채움 {ok_fill}/{len(fills)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
