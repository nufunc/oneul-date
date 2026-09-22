#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 이름 표기만 다른 근접 중복 수동 병합 (사람이 확인한 목록 전용)

완전 일치(name+address) dedup에는 안 걸리지만 실제로는 같은 업장인
사례를 데이터 큐레이션 감사(oneul-date-ae)가 웹 검색으로 확인하고,
여기서 주소·카테고리까지 재검증한 것만 담는다. 자동 유사도 매칭이
아니라 사람이 확인한 고정 목록이라 오판 병합 위험이 없다.

기본은 드라이런. --execute 를 줘야 실제 DELETE.
"""

import os
import sys
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

# (유지할 id, 삭제할 id, 확인 근거) — 2026-09-23 재검증 완료분만 담는다.
VERIFIED_MERGES = [
    (7708, 10066, "오르페오 서울 한남 — 대사관로 35 사운즈한남, 주소·카테고리(공간대여) 일치"),
    (2206, 1789511522267, "주렁주렁 영등포 타임스퀘어점 — 영중로 15, 주소·카테고리(실내동물원) 일치"),
    (4822, 6713, "수원 지동시장 순대타운 원조엄마네 — 팔달문로 19, 주소·카테고리(한식) 일치"),
    (8219, 1727, "라티튜드 32 — 잠실로 209 소피텔 앰배서더 서울, 주소·카테고리(와인바) 일치"),
    (3305, 6364, "태화강국가정원 십리대숲 — 태화강국가정원길 154, 주소·카테고리(국가정원) 일치"),
    (3305, 5650, "태화강국가정원 십리대숲 — 위와 동일 그룹"),
]


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_spot(spot_id):
    headers = build_headers()
    url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,address&id=eq.{spot_id}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        rows = json.loads(res.read().decode("utf-8"))
    return rows[0] if rows else None


def delete_spot(spot_id):
    headers = build_headers()
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    req = urllib.request.Request(url, headers=headers, method="DELETE")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    print(f"🔍 [검증된 병합 목록] {len(VERIFIED_MERGES)}건")
    for keep_id, drop_id, reason in VERIFIED_MERGES:
        keep = fetch_spot(keep_id)
        drop = fetch_spot(drop_id)
        print(f"  - 유지 [{keep_id}] {keep['name'] if keep else '(조회 실패)'}")
        print(f"    삭제 [{drop_id}] {drop['name'] if drop else '(조회 실패, 이미 삭제됐을 수 있음)'}")
        print(f"    근거: {reason}")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 병합하려면 --execute 를 붙여 다시 실행하세요.")
        return

    print(f"\n⚡ [병합 실행] {len(VERIFIED_MERGES)}건 삭제 중...")
    success = 0
    for keep_id, drop_id, _ in VERIFIED_MERGES:
        try:
            if delete_spot(drop_id):
                success += 1
                print(f"  ✅ [{drop_id}] 삭제 완료 (유지: {keep_id})")
        except Exception as e:
            print(f"  ❌ 삭제 실패 id={drop_id}: {e}")

    print(f"\n🎉 [완료] {success}/{len(VERIFIED_MERGES)}건 병합")


if __name__ == "__main__":
    main()
