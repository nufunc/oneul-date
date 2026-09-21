#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 주소 기반 권역(Region)/세부지역(Area) 전수 자동 교정 스크립트
"""

import os
import sys
import json
import urllib.request
from collections import defaultdict

# 상위 디렉토리 import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import derive_region_area, load_env

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

# 2026년 인천 행정구역 개편으로 새로 생긴 area 명칭. address 문자열은 개편 전
# 표기가 남아있는 경우가 많아 derive_region_area(주소만 봄)가 옛 표기로
# 되돌리려 든다. area가 이미 신명칭이면 손대지 않는다.
INCHEON_NEW_AREA_NAMES = {
    "영종구", "검단구", "서해구", "제물포구", "강화군", "옹진군",
    "계양구", "남동구", "미추홀구", "부평구", "연수구", "중구",
}

def build_headers(extra=None):
    """SUPABASE_KEY가 없으면(자체 호스팅 PostgREST가 인증을 요구하지 않는
    경우) apikey/Authorization 헤더 자체를 보내지 않는다."""
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_all_active_spots():
    """자체 호스팅 PostgREST는 count=exact를 줘도 Content-Range 총건수가
    '*'(미상)로 올 수 있어 신뢰하지 않는다. 응답 건수가 limit보다 적어질
    때까지 반복 조회한다(cleanup_spots_and_dedup.py와 동일한 방식)."""
    headers = build_headers()
    page_size = 1000
    offset = 0
    spots = []
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/spots?select=id,name,region,area,address,location,lat,lng"
               f"&is_closed=eq.false&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as res:
            chunk = json.loads(res.read().decode("utf-8"))
        if not chunk:
            break
        spots.extend(chunk)
        offset += len(chunk)
        if len(chunk) < page_size:
            break
    return spots

def update_spot(spot_id, update_fields):
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    req = urllib.request.Request(url, data=json.dumps(update_fields).encode("utf-8"), headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)

def main():
    print("🚀 [주소-권역 전수 자동 교정] 스팟 데이터베이스 전체 로드 중...")
    spots = fetch_all_active_spots()
    print(f"  • 총 로드된 Active 스팟: {len(spots):,}개")
    
    to_update = []
    region_changes = defaultdict(int)
    
    for s in spots:
        addr = s.get("address")
        if not addr or not isinstance(addr, str) or not addr.strip():
            continue
            
        correct_region, correct_area = derive_region_area(addr)
        if not correct_region:
            continue
            
        cur_region = s.get("region")
        cur_area = s.get("area")
        
        needs_patch = False
        updates = {}
        
        # 1. region 불일치
        if cur_region != correct_region:
            needs_patch = True
            updates["region"] = correct_region
            region_changes[f"{cur_region} -> {correct_region}"] += 1
            
        # 2. area 불일치. 인천은 2026년 행정구역 개편으로 area가 이미 신명칭인데
        # address 문자열엔 옛 표기가 남아있는 경우가 많다. 그 경우 derive_region_area가
        # address만 보고 옛 이름으로 되돌리려 드는데, 이미 맞는 값을 깨뜨리는 것이니
        # 손대지 않는다.
        is_incheon_already_correct = cur_region == "인천" and cur_area in INCHEON_NEW_AREA_NAMES
        if correct_area and cur_area != correct_area and not is_incheon_already_correct:
            needs_patch = True
            updates["area"] = correct_area
            
        if needs_patch:
            new_reg = updates.get("region", cur_region)
            new_area = updates.get("area", cur_area)
            updates["location"] = f"{new_reg} {new_area}".strip()
            
            to_update.append((s["id"], s["name"], s["address"], cur_region, cur_area, updates))
            
    print(f"\n📊 [교정 대상 선별 완료] 총 {len(to_update):,}개 스팟이 교정 대상입니다.")
    print("  • 권역(Region) 변경 집계:")
    for change, cnt in sorted(region_changes.items(), key=lambda x: x[1], reverse=True):
        print(f"    - {change}: {cnt}건")
        
    print("\n▶ 대표 교정 샘플 10선:")
    for item in to_update[:10]:
        sid, sname, saddr, orig_r, orig_a, patch = item
        print(f"  - [{sname}] (주소: {saddr})")
        print(f"    ❌ [{orig_r}] {orig_a}  -->  ✅ [{patch.get('region', orig_r)}] {patch.get('area', orig_a)}")
        
    print(f"\n⚡ Supabase DB 전수 일괄 교정(PATCH) 시작 (총 {len(to_update):,}건)...")
    success_count = 0
    fail_count = 0
    
    for idx, item in enumerate(to_update, 1):
        sid, sname, saddr, orig_r, orig_a, patch = item
        try:
            if update_spot(sid, patch):
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            fail_count += 1
            print(f"  ❌ 업데이트 실패 ID {sid} ({sname}): {e}")
            
        if idx % 100 == 0 or idx == len(to_update):
            print(f"  진행률: {idx}/{len(to_update)} ({idx/len(to_update)*100:.1f}%) — 성공: {success_count}, 실패: {fail_count}")
            
    print(f"\n🎉 [교정 완료] 성공: {success_count}건, 실패: {fail_count}건")

if __name__ == "__main__":
    main()
