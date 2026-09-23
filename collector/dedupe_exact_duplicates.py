#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 완전 중복(name+address 일치) 및 큐레이션 메타 콘텐츠 오염 정리

2026-09-22 데이터 큐레이션 감사(oneul-date-ae)가 발견, 직접 재검증 완료:
- name+address가 완전히 일치하는 활성 스팟 154그룹/632행 (surplus 478행)
- "🗺️ 권역별 20선 큐레이션 맵" 등 큐레이션 메타 콘텐츠가 실제 스팟처럼
  잘못 들어간 행 42건 (주소·카테고리 전부 NULL, created_at이 전부 동일해
  2026-09-05 단발 배치 삽입 사고로 판단 — 현재 코드에 재발 경로 없음)

기본은 드라이런(무엇을 지울지 출력만). --execute 를 줘야 실제 DELETE.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

JUNK_META_NAME_PREFIXES = ("🗺️", "🗺")

# 2026-09-23 데이터 큐레이션 감사 6회차 발견: 같은 2026-09-05 배치에서
# "Part 1./Chapter 2./카테고리 1." 같은 리스티클 챕터 제목, "OO 20선 비교
# 분석 매트릭스" 같은 정리글 제목, "Selection Criteria" 같은 글 서문·범례
# 문구가 개별 스팟으로 잘못 들어간 56건. 이모지 접두어가 제각각이라
# 패턴 매칭 대신 사람이 직접 확인한 id 목록을 쓴다. 전부 address·category
# NULL, 실재하지 않는 "장소" 확인 완료.
JUNK_LISTICLE_FRAGMENT_IDS = {
    7759, 9103, 8425, 7344, 8420, 9297, 7342, 10055, 7097, 7756, 7755, 7281,
    7447, 9767, 7908, 8236, 8430, 8733, 8839, 7446, 7489, 7530, 8153, 8532,
    7448, 7758, 7694, 7800, 7931, 8234, 8384, 8885, 9527, 9744, 10052, 10063,
    10091, 10095, 10097, 9985, 10008, 8419, 8427, 8754, 8816, 9873, 9896,
    9190, 9211, 9443, 9550, 9595, 8862, 7909, 8429, 10100,
    25,  # "큐레이션 기준" — 7회차 추가 발견
    # 이름 60자 초과 조건 나열형 검색 문구 조각 33건 — 2026-09-23 추가
    9254, 9275, 8579, 8689, 8711, 7178, 9551, 8600, 8622, 8645, 8817, 8840,
    8863, 8886, 8972, 8994, 9038, 9081, 9146, 9168, 9379, 9505, 9528, 9015,
    9104, 9897, 9963, 9986, 10030, 8363, 8950, 9573, 8667,
}


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_all_active():
    headers = build_headers()
    page_size = 1000
    offset = 0
    rows = []
    fields = "id,name,address,category,lat,lng,image_url,summary,created_at"
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/spots?select={fields}"
               f"&is_closed=eq.false&order=id.asc&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as res:
            chunk = json.loads(res.read().decode("utf-8"))
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def completeness_score(row):
    score = 0
    if row.get("lat") and row.get("lng"):
        score += 2
    if row.get("category"):
        score += 1
    if row.get("image_url"):
        score += 1
    if row.get("summary") and len(row["summary"]) > 15:
        score += 1
    return score


def delete_spot(spot_id):
    headers = build_headers()
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    req = urllib.request.Request(url, headers=headers, method="DELETE")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    print("🔍 [활성 스팟 전수 로드]")
    rows = fetch_all_active()
    print(f"  • 총 {len(rows):,}건")

    # 1. 큐레이션 메타 콘텐츠 (이름이 지도/큐레이션 이모지로 시작하고 주소가 없음
    #    + 사람이 직접 확인한 리스티클 챕터/비교표/서문 파편 id 목록)
    junk_ids = [
        r["id"] for r in rows
        if (r["name"].startswith(JUNK_META_NAME_PREFIXES) and not r.get("address"))
        or r["id"] in JUNK_LISTICLE_FRAGMENT_IDS
    ]
    print(f"\n📦 [메타 콘텐츠 오염] {len(junk_ids)}건")
    for r in rows:
        if r["id"] in junk_ids[:3]:
            print(f"  - [{r['id']}] {r['name']!r}")

    # 2. 완전 중복 (name+address 일치, 활성 스팟 기준)
    groups = defaultdict(list)
    for r in rows:
        if r["id"] in junk_ids:
            continue  # 메타 콘텐츠는 1번에서 이미 전부 삭제 대상이라 중복 그룹에서 제외
        key = (r["name"], r.get("address") or "")
        groups[key].append(r)

    dupe_ids = []
    dupe_groups = {k: v for k, v in groups.items() if len(v) > 1}
    for (name, addr), group_rows in dupe_groups.items():
        ranked = sorted(group_rows, key=lambda r: (-completeness_score(r), r["id"]))
        keep = ranked[0]
        drop = ranked[1:]
        dupe_ids.extend(r["id"] for r in drop)

    print(f"\n🔁 [완전 중복] {len(dupe_groups)}그룹 / 삭제 대상 {len(dupe_ids)}행")
    top = sorted(dupe_groups.items(), key=lambda kv: -len(kv[1]))[:10]
    for (name, addr), group_rows in top:
        ranked = sorted(group_rows, key=lambda r: (-completeness_score(r), r["id"]))
        keep_id = ranked[0]["id"]
        drop_ids = [r["id"] for r in ranked[1:]]
        print(f"  - {name!r} | {addr[:30]!r} → 유지 id={keep_id}, 삭제 {drop_ids}")

    all_delete_ids = junk_ids + dupe_ids
    print(f"\n⚡ [삭제 대상 합계] {len(all_delete_ids):,}건")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 지우려면 --execute 를 붙여 다시 실행하세요.")
        return

    print("\n🗑️  실제 삭제를 시작합니다...")
    success = 0
    for idx, sid in enumerate(all_delete_ids, 1):
        try:
            if delete_spot(sid):
                success += 1
        except Exception as e:
            print(f"  ❌ 삭제 실패 id={sid}: {e}")
        if idx % 100 == 0 or idx == len(all_delete_ids):
            print(f"  진행률: {idx}/{len(all_delete_ids)} — 성공 {success}")

    print(f"\n🎉 [완료] {success}/{len(all_delete_ids)}건 삭제")


if __name__ == "__main__":
    main()
