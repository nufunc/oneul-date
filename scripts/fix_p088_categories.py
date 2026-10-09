#!/usr/bin/env python3
"""P-088 일회성 교정: 카카오로 비식음 시설임을 확인한 행의 식음 카테고리를 고치고, 다른 업소를 가리키는 카카오맵 링크를 지운다. 기본은 드라이런이고 --apply일 때만 쓴다.

대상은 p088_category_fix_ids.json의 rows(카테고리, 숙박이면 slot)와 kakaomap_removed(social_links.kakaomap)다.
라이브 DB에서 다시 읽어 지금도 열려 있고 카테고리가 확인 때 값 그대로인 행만 고친다. 링크는 확인한 장소 id를 아직 가리킬 때만 지운다.

OCI 호스트에서 돈다(judge_date_fit.py와 r*_ids.json을 같은 폴더에 둔다):
COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 fix_p088_categories.py --backup-dir /home/opc/oneul-backups [--apply]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import quote

from judge_date_fit import connect
from close_date_fit_spots import fetch_ids, request

IDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "p088_category_fix_ids.json")


def plan_patches(ids, by_id):
    """{id: patch}와 {id: 건너뛴 사유}. 같은 행에 카테고리와 링크가 함께 걸리면 patch 하나로 묶는다"""
    plan, skipped = {}, {}
    for key, item in ids["rows"].items():
        row = by_id.get(int(key))
        if row is None or row.get("is_closed"):
            skipped[int(key)] = "행 없음" if row is None else "닫힘"
        elif row.get("category") != item["old_category"]:
            skipped[int(key)] = f"카테고리 바뀜: {row.get('category')}"
        else:
            plan[int(key)] = {"category": item["new_category"], **({"slot": item["new_slot"]} if item.get("new_slot") else {})}
    for key, item in ids["kakaomap_removed"].items():
        row = by_id.get(int(key))
        links = dict((row or {}).get("social_links") or {})
        if row is None or row.get("is_closed"):
            skipped[int(key)] = "행 없음" if row is None else "닫힘"
        elif not (links.get("kakaomap") or {}).get("url", "").endswith(f"/{item['place_id']}"):
            skipped.setdefault(int(key), f"링크 바뀜: {(links.get('kakaomap') or {}).get('url')}")
        else:
            links.pop("kakaomap")
            plan.setdefault(int(key), {})["social_links"] = links
    return plan, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()

    ids = json.load(open(IDS_FILE, encoding="utf-8"))
    targets = sorted({int(k) for k in ids["rows"]} | {int(k) for k in ids["kakaomap_removed"]})
    base, headers = connect()
    current = fetch_ids(base, headers, targets)
    plan, skipped = plan_patches(ids, {r["id"]: r for r in current})
    print(f"대상 {len(targets)} · 고칠 행 {len(plan)} · 건너뜀 {len(skipped)} {skipped}")
    for i, patch in sorted(plan.items()):
        print(f"  {i}: {', '.join(k if k == 'social_links' else f'{k}={v}' for k, v in patch.items())}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p088_category_{stamp}.json")
    with open(backup, "x", encoding="utf-8") as f:
        json.dump({"rows": current, "plan": plan, "skipped": skipped}, f, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    by_id = {r["id"]: r for r in current}
    done, failed = 0, []
    for i, patch in plan.items():
        cond = f"&category=eq.{quote(by_id[i]['category'], safe='')}" if "category" in patch else ""
        res = request(f"{base}/rest/v1/spots?id=eq.{i}&is_closed=eq.false{cond}", rep, "PATCH", {**patch, "updated_at": now})
        done += len(res or []) == 1
        if len(res or []) != 1:
            failed.append(i)
    print(f"고침 {done} · 실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, list(plan))}
    ok = sum(all(after[i].get(k) == v for k, v in patch.items()) for i, patch in plan.items())
    print(f"쓰기 뒤 DB 재조회: 계획대로 {ok}/{len(plan)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
