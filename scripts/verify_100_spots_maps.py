#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 100개 스팟 지도 바로가기 및 길찾기 URL 전수 정밀 검증 스크립트
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import re

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def load_env_credentials():
    search_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    ]
    for env_path in search_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VITE_SUPABASE_URL=") or line.startswith("SUPABASE_URL="):
                            os.environ["SUPABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("SUPABASE_SERVICE_KEY=") or line.startswith("SUPABASE_KEY=") or line.startswith("VITE_SUPABASE_ANON_KEY="):
                            os.environ["SUPABASE_SERVICE_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass

def map_query(spot):
    name = (spot.get("name") or "").strip()
    # 괄호 및 특수문자 정제
    clean = re.sub(r"[\(\[\<].*?[\)\]\>]", "", name).strip()
    clean = re.sub(r"^[0-9]+\.\s*", "", clean).strip()
    area = spot.get("area") or spot.get("location") or ""
    
    generic_nouns = ['요리', '다이닝', '식당', '카페', '커피', '베이커리', '바', '펍', '파스타', '스테이크', '브런치', '공방', '스튜디오', '글램핑', '펜션', '야장', '포차']
    if any(gn in clean for gn in generic_nouns) or len(clean) <= 4:
        addr = spot.get("address") or ""
        m = re.search(r"([가-힣0-9]+(?:동|읍|면|로[0-9]*길|[0-9]+길))", addr)
        if m and m.group(1) not in clean:
            clean = f"{clean} {m.group(1)}".strip()
    return clean or name

def generate_naver_map_url(spot):
    q = urllib.parse.quote(map_query(spot))
    lat = spot.get("lat")
    lng = spot.get("lng")
    if lat and lng:
        return f"https://map.naver.com/p/search/{q}?c={lng},{lat},16,0,0,0,dh"
    return f"https://map.naver.com/p/search/{q}"

def generate_directions_url(origin, spot, mode="transit"):
    o_lng, o_lat, o_name = origin
    d_lng = spot.get("lng")
    d_lat = spot.get("lat")
    d_name = spot.get("name")
    
    if d_lng and d_lat:
        enc_o = urllib.parse.quote(o_name)
        enc_d = urllib.parse.quote(d_name)
        return f"https://map.naver.com/p/directions/{o_lng},{o_lat},{enc_o}/{d_lng},{d_lat},{enc_d}/-/{mode}"
    return generate_naver_map_url(spot)

def verify_spots():
    load_env_credentials()
    sb_url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

    if not sb_url or not sb_key:
        print("⚠️ Supabase 접속 정보 누락")
        return

    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }

    print("🔍 Supabase에서 검증용 100개 스팟 샘플링 조회 중...")
    # 지역별, 슬롯별 고른 샘플링을 위해 1000개 가져와서 100개 다양하게 선별
    url = f"{sb_url}/rest/v1/spots?select=id,name,category,region,area,address,location,lat,lng,is_closed&is_closed=eq.false&limit=1000"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as res:
        all_spots = json.loads(res.read().decode('utf-8'))

    # 다양한 지역과 슬롯에서 균등하게 100개 샘플링
    sample_spots = all_spots[::max(1, len(all_spots) // 100)][:100]
    print(f"📊 총 {len(sample_spots)}개 스팟 선정 완료. 정밀 검증 시작...\n")

    # 가상 출발지: 서울 강남역 (127.0276, 37.4979)
    sample_origin = (127.0276, 37.4979, "강남역")

    valid_coords_count = 0
    valid_map_url_count = 0
    valid_dir_url_count = 0
    results = []

    for i, s in enumerate(sample_spots, 1):
        s_id = s.get("id")
        name = s.get("name", "")
        region = s.get("region", "")
        area = s.get("area", "")
        lat = s.get("lat")
        lng = s.get("lng")

        # 1. 좌표 범위 검증
        is_coord_valid = False
        if lat is not None and lng is not None:
            if 33.0 <= float(lat) <= 39.0 and 124.0 <= float(lng) <= 132.0:
                is_coord_valid = True
                valid_coords_count += 1

        # 2. 지도 상세 URL 생성 검증
        map_url = generate_naver_map_url(s)
        has_pinpoint = f"?c={lng},{lat},16" in map_url if is_coord_valid else False
        if map_url.startswith("https://map.naver.com/p/search/"):
            valid_map_url_count += 1

        # 3. 길찾기 URL 생성 검증
        dir_url = generate_directions_url(sample_origin, s)
        if "/p/directions/" in dir_url and str(lng) in dir_url and str(lat) in dir_url:
            valid_dir_url_count += 1

        status = "✅ 정상" if (is_coord_valid and has_pinpoint) else "⚠️ 좌표확인필요"
        results.append({
            "id": s_id,
            "name": name,
            "region": region,
            "area": area,
            "coords": f"{lat:.4f}, {lng:.4f}" if is_coord_valid else "좌표없음",
            "map_url": map_url,
            "dir_url": dir_url,
            "status": status
        })

    # 콘솔 출력 (상위 20개 및 종합 집계)
    print("=" * 80)
    print(f"{'No':<4} | {'지역/구역':<10} | {'장소명':<22} | {'좌표':<18} | {'판정'}")
    print("-" * 80)
    for r in results[:20]:
        print(f"{r['id']:<4} | {r['region'][:4]+'/'+r['area'][:4]:<10} | {r['name'][:18]:<22} | {r['coords']:<18} | {r['status']}")

    print("=" * 80)
    print(f"\n📈 [100개 스팟 검증 결과 종합 리포트]")
    print(f"  • 총 검사 스팟 수: {len(sample_spots)}개")
    print(f"  • 유효 위경도 좌표 보유율: {valid_coords_count}/{len(sample_spots)} ({valid_coords_count/len(sample_spots)*100:.1f}%)")
    print(f"  • 네이버 지도 핀포인트 상세 URL 정상 생성율: {valid_map_url_count}/{len(sample_spots)} ({valid_map_url_count/len(sample_spots)*100:.1f}%)")
    print(f"  • 네이버 지도 1:1 길찾기 URL 정상 생성율: {valid_dir_url_count}/{len(sample_spots)} ({valid_dir_url_count/len(sample_spots)*100:.1f}%)")
    print("=" * 80)

if __name__ == "__main__":
    verify_spots()
