#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — price 자유텍스트에서 price_tier/avg_price_per_person 일괄 역산 스크립트

price_tier·avg_price_per_person은 100% 공백이었지만, price 자유텍스트가
86.4% 채워져 있고 규칙 기반 파싱으로 그 중 90.4%(전체 활성 기준 78.1%)를
역산할 수 있다(supabase_worker.derive_price_tier_from_text, 2026-09-21
실측). 새 수집 로직 없이 기존 텍스트만으로 두 필드를 채운다.
"""

import os
import sys
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env, derive_price_tier_from_text

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_targets():
    headers = build_headers()
    page_size = 1000
    offset = 0
    rows = []
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/spots?select=id,price,price_tier,avg_price_per_person"
               f"&is_closed=eq.false&price_tier=is.null&avg_price_per_person=is.null"
               f"&order=id.asc&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as res:
            batch = json.loads(res.read().decode('utf-8'))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def patch_spot(spot_id, price_tier, avg_price):
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    payload = json.dumps({"price_tier": price_tier, "avg_price_per_person": avg_price}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    print("🔍 [백필 대상 조회] price_tier IS NULL AND avg_price_per_person IS NULL")
    targets = fetch_targets()
    print(f"  • 대상: {len(targets):,}개")

    converted = [(t["id"], *derive_price_tier_from_text(t.get("price") or "")) for t in targets]
    converted = [(sid, tier, avg) for sid, tier, avg in converted if tier]
    print(f"  • 실제 변환 가능: {len(converted):,}개 (나머지는 price 텍스트가 서술형이라 그대로 공백 유지)")

    print("▶ 대표 샘플 10선:")
    for sid, tier, avg in converted[:10]:
        print(f"  - [{sid}] {tier} / 평균 {avg:,.0f}원")

    print(f"\n⚡ [백필 실행] {len(converted):,}건 PATCH 중...")
    success = 0
    for idx, (sid, tier, avg) in enumerate(converted, 1):
        try:
            if patch_spot(sid, tier, avg):
                success += 1
        except Exception as e:
            print(f"  ❌ PATCH 오류 id={sid}: {e}")
        if idx % 500 == 0 or idx == len(converted):
            print(f"  진행률: {idx}/{len(converted)} — 성공 {success}")

    print(f"\n🎉 [완료] {success}/{len(converted)}건 성공")


if __name__ == "__main__":
    main()
