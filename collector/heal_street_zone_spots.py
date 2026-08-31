#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 상권·골목·거리형 스팟 전수 검토 및 자동 교정 스크립트
'광명사거리 먹자골목', '해리단길', '을지로 노가리골목' 등 단일 POI 검색이 어려운 골목/상권 스팟을
지오코딩 및 다단계 랜드마크 검색으로 좌표, 주소, 권역을 복원하고 폐업 오판정에서 구제합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import (
    load_env, derive_region_area, derive_slot,
    is_zone_street_spot, search_address_or_landmark, search_naver,
    HEADERS
)

def heal_street_zone_spots():
    env = load_env()
    supabase_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    if not supabase_url or not service_key:
        print("❌ Supabase 환경변수가 설정되지 않았습니다.")
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🔍 [1회성 전수 검토] Supabase 스팟 목록 조회 중...")
    
    # 1. 전체 스팟 조회 (1000개 단위 페이징)
    all_spots = []
    offset = 0
    while True:
        url = f"{supabase_url}/rest/v1/spots?select=*&order=id.asc&offset={offset}&limit=1000"
        req = urllib.request.Request(url, headers=api_headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                batch = json.loads(res.read().decode('utf-8'))
                if not batch:
                    break
                all_spots.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
        except Exception as e:
            print(f"❌ DB 조회 실패: {e}")
            break

    print(f"📊 총 {len(all_spots)}개 스팟 로드 완료. 골목/거리/상권형 및 좌표 누락 스팟 정밀 검토 시작...")

    healed_count = 0
    unclosed_count = 0

    for spot in all_spots:
        s_id = spot["id"]
        name = spot.get("name", "")
        addr = spot.get("address", "")
        loc = spot.get("location", "")
        reg = spot.get("region", "")
        lat = spot.get("lat")
        lng = spot.get("lng")
        is_closed = spot.get("is_closed", False)

        is_street_zone = is_zone_street_spot(name) or is_zone_street_spot(spot.get("category", "") or "")

        # 검토 대상: 
        # 1) 골목/상권 스팟인데 좌표가 없거나 is_closed=True인 경우
        # 2) 골목/상권 스팟인데 주소/권역이 불분명한 경우
        # 3) '광명사거리' 등 핵심 상권 키워드를 포함한 스팟
        needs_review = is_street_zone or (not lat or not lng) or ("광명" in name and "먹자" in name)

        if not needs_review:
            continue

        patch = {}

        # 1. 좌표 및 주소 보정 시도
        search_target = f"{name} {loc or reg or ''}".strip()
        geo_info = search_address_or_landmark(name)
        if not geo_info:
            geo_info = search_address_or_landmark(search_target)
        if not geo_info and addr:
            geo_info = search_address_or_landmark(addr)

        if geo_info:
            road_addr = geo_info.get("roadAddress")
            x_coord = geo_info.get("x")
            y_coord = geo_info.get("y")

            if road_addr and (not addr or len(addr) < len(road_addr)):
                patch["address"] = road_addr
                d_reg, d_area = derive_region_area(road_addr)
                if d_reg and d_reg != reg:
                    patch["region"] = d_reg
                if d_area and d_area != spot.get("area"):
                    patch["area"] = d_area
                if d_reg or d_area:
                    patch["location"] = f"{d_reg or reg} {d_area or spot.get('area') or ''}".strip()

            if x_coord and y_coord and (not lat or not lng):
                patch["lat"] = float(y_coord)
                patch["lng"] = float(x_coord)

        # 2. 골목/거리 스팟 오폐업 해제 및 검증 정상화
        if is_street_zone:
            if is_closed:
                patch["is_closed"] = False
                unclosed_count += 1
                print(f"  ✨ [폐업 오판정 해제] id={s_id}, name='{name}' (골목/상권 명소 정상 복원)")
            patch["verified"] = True
            patch["fail_count"] = 0

        # 3. DB PATCH
        if patch:
            patch["updated_at"] = datetime.now(timezone.utc).isoformat()
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            patch_bytes = json.dumps(patch).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_bytes, headers=api_headers, method='PATCH')
            try:
                urllib.request.urlopen(patch_req, timeout=5)
                healed_count += 1
                print(f"  🔧 [교정 완료] id={s_id}, name='{name}', patch={list(patch.keys())}")
            except Exception as pe:
                print(f"  ❌ 교정 실패 id={s_id}: {pe}")

        time.sleep(0.05)

    print(f"\n🎉 [교정 완료] 총 {healed_count}개 스팟 메타/좌표 보정 완료 (골목/상권 오폐업 구제: {unclosed_count}건)")

if __name__ == "__main__":
    heal_street_zone_spots()
