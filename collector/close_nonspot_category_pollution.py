#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 지오코딩 근접 POI 흡착으로 은행/신협/지하철출구/관리사무소 등
데이트 스팟이 아닌 category가 붙은 활성 스팟의 category 일괄 초기화

데이터 큐레이션 감사(oneul-date-ae)가 발견: 은행/신협/금융서비스/지하철역
출구/건물관리사무소 등 SLOT_NONSPOT_RE에 해당하는 category를 가진 활성
스팟이 있다. supabase_worker.SLOT_NONSPOT_RE는 이미 이런 category를
"근거 없음"으로 처리하지만, 이미 저장된 행을 소급 정리하지는 않는다.

주의: 처음에는 이 category를 가진 스팟을 통째로 폐업(is_closed=true)
처리하려 했으나, 실제로 조회해보니 "판교 아브뉴프랑"·"더현대 서울"·
"제주 동문재래시장 야시장" 같은 실존 인기 명소가 다수 섞여 있었다
(근처 출입구/주차장 POI를 category로 잘못 흡착한 것일 뿐 스팟 자체는
멀쩡함). 그래서 스팟을 닫는 대신 category만 NULL로 비워 다음 검증
주기에서 정상적으로 재보강되게 한다 — 데이터 손실 위험이 없다.

기본은 드라이런. --execute 를 줘야 실제 PATCH.
"""

import os
import sys
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env, SLOT_NONSPOT_RE

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_active_with_category():
    headers = build_headers()
    page_size = 1000
    offset = 0
    rows = []
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/spots?select=id,name,category"
               f"&is_closed=eq.false&category=not.is.null&order=id.asc&limit={page_size}&offset={offset}")
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


def clear_category(spot_id):
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    payload = json.dumps({"category": None}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    print("🔍 [활성 스팟 전수 로드]")
    rows = fetch_active_with_category()
    print(f"  • category 있는 활성 스팟: {len(rows):,}개")

    targets = [r for r in rows if any(p.search(r["category"]) for p in SLOT_NONSPOT_RE)]
    print(f"\n🚫 [SLOT_NONSPOT_RE 매칭] {len(targets):,}건")
    for t in targets[:15]:
        print(f"  - [{t['id']}] {t['name']} (category={t['category']!r})")
    if len(targets) > 15:
        print(f"  ... 외 {len(targets) - 15}건")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 비우려면 --execute 를 붙여 다시 실행하세요.")
        return

    print(f"\n⚡ [category 초기화 실행] {len(targets):,}건 PATCH 중...")
    success = 0
    for idx, t in enumerate(targets, 1):
        try:
            if clear_category(t["id"]):
                success += 1
        except Exception as e:
            print(f"  ❌ PATCH 오류 id={t['id']}: {e}")
        if idx % 50 == 0 or idx == len(targets):
            print(f"  진행률: {idx}/{len(targets)} — 성공 {success}")

    print(f"\n🎉 [완료] {success}/{len(targets)}건 category 초기화 (다음 검증 주기에 재보강됨)")


if __name__ == "__main__":
    main()
