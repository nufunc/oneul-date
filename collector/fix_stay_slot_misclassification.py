#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — price에 "1박"이 있는데 slot이 stay가 아닌 활성 스팟 91건 교정

데이터 큐레이션 감사(oneul-date-ae)가 발견, 직접 재검증 완료: 고택·
한옥스테이·카바나·풀빌라·독채 계열 91건이 price 텍스트에 "1박 OO원"
숙박 요금이 명시돼 있는데도 slot이 day/evening/night 또는 NULL로
남아 있었다. 그 결과 코스 생성 시 저녁/밤 방문지처럼 순서에 끼워
넣어져 "저녁엔 A 숙소, 밤엔 B 숙소"라는 말이 안 되는 동선이 나왔다.

기본은 드라이런. --execute 를 줘야 실제 PATCH.
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

TARGET_IDS = [
    9712, 9837, 9231, 7888, 9216, 9224, 9228, 8737, 8750, 8752, 9214, 9222,
    9227, 9842, 9846, 9770, 9834, 9836, 9839, 9847, 9848, 7173, 7253, 7065,
    7073, 7260, 7504, 7122, 9221, 7608, 9840, 7058, 9838, 7185, 7189, 7376,
    7607, 9835, 7074, 9215, 9226, 9850, 9280, 7131, 7127, 7611, 7597, 7805,
    9225, 8734, 7496, 8739, 9217, 9220, 9782, 9787, 9778, 9785, 9291, 9706,
    9780, 9777, 9903, 9904, 9899, 9911, 9918, 7606, 7545, 8751, 9768, 9833,
    9843, 9909, 9914, 7069, 7071, 7598, 9286, 7806, 7063, 9773, 9776, 9832,
    9844, 9849, 9901, 9916, 9212, 9223, 9230,
]


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_spots(ids):
    headers = build_headers()
    id_list = ",".join(str(i) for i in ids)
    url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,slot,price&id=in.({id_list})"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def set_stay_slot(spot_id):
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    payload = json.dumps({"slot": "stay"}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    print(f"🔍 [대상 조회] {len(TARGET_IDS)}건")
    rows = fetch_spots(TARGET_IDS)
    not_stay = [r for r in rows if r.get("slot") != "stay" and "1박" in (r.get("price") or "")]
    print(f"  • 재검증 통과(slot≠stay & price에 '1박' 포함): {len(not_stay)}건")

    print("▶ 대표 샘플 5선:")
    for r in not_stay[:5]:
        print(f"  - [{r['id']}] {r['name']} (slot={r.get('slot')!r}) — {r['price'][:40]}")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 교정하려면 --execute 를 붙여 다시 실행하세요.")
        return

    print(f"\n⚡ [slot=stay 교정 실행] {len(not_stay):,}건 PATCH 중...")
    success = 0
    for idx, r in enumerate(not_stay, 1):
        try:
            if set_stay_slot(r["id"]):
                success += 1
        except Exception as e:
            print(f"  ❌ PATCH 오류 id={r['id']}: {e}")
        if idx % 30 == 0 or idx == len(not_stay):
            print(f"  진행률: {idx}/{len(not_stay)} — 성공 {success}")

    print(f"\n🎉 [완료] {success}/{len(not_stay)}건 slot=stay로 교정")


if __name__ == "__main__":
    main()
