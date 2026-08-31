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
from supabase_worker import derive_region_area

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uyhwhnnzzfhtxjernfit.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aHdobm56emZodHhqZXJuZml0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjkyMDI3NywiZXhwIjoyMTAyNDk2Mjc3fQ.xHrjNL8KkcewQcHHKBB6KuMDepXwosZcpABh2s3a-40")

def fetch_all_active_spots():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "count=exact"
    }
    
    url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,region,area,address,location,lat,lng&is_closed=eq.false&limit=1000&offset=0"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as res:
        cr = res.headers.get("Content-Range")
        total = int(cr.split("/")[1]) if cr else 1000
        spots = json.loads(res.read().decode("utf-8"))
        
    for offset in range(1000, total, 1000):
        url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,region,area,address,location,lat,lng&is_closed=eq.false&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as res:
            chunk = json.loads(res.read().decode("utf-8"))
            spots.extend(chunk)
            
    return spots

def update_spot(spot_id, update_fields):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
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
            
        # 2. area 불일치
        if correct_area and cur_area != correct_area:
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
