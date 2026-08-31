#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 중복 스팟 통합 제거 및 7대 부적합 업종(유흥주점, 스터디카페 등) 전수 클린업
"""

import os
import sys
import json
import re
import urllib.request
from collections import defaultdict

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uyhwhnnzzfhtxjernfit.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aHdobm56emZodHhqZXJuZml0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjkyMDI3NywiZXhwIjoyMTAyNDk2Mjc3fQ.xHrjNL8KkcewQcHHKBB6KuMDepXwosZcpABh2s3a-40")

DISALLOWED_CATEGORIES = [
    # 1. 유흥주점 / 성인 / 가요방
    "유흥주점", "단란주점", "노래클럽", "룸살롱", "나이트클럽", "가요방", "노래광장", "노래바", "노래주점", "성인용품",
    # 2. 학업 / 스터디 / 독서실
    "스터디카페", "스터디룸", "독서실", "고시원", "고시텔",
    # 3. 키즈 / 영유아
    "키즈카페", "서울형키즈카페", "베이비카페",
    # 4. 인터넷쇼핑몰 / 사무소 / 무역
    "인터넷쇼핑몰", "인터넷쇼핑", "온라인쇼핑", "무역", "수출입", "인터내셔널",
    # 5. 단순 의류 / 가구 / 잡화 / 수선
    "의류판매", "여성의류", "남성의류", "수입의류", "의류수선", "의상실", "양복", "가구판매", "침구판매",
    # 6. 장기회원제 운동 / 체육
    "요가원", "필라테스", "헬스장", "피트니스", "당구장", "포켓볼",
    # 7. 단순 대중목욕탕
    "대중목욕탕",
    # 기타 사용자 지적 스팟 키워드
    "영영코리아", "꿀잠스토어"
]

def normalize_name(name):
    if not name:
        return ""
    return re.sub(r'[^a-zA-Z0-9가-힣]', '', name).lower()

def normalize_addr(addr):
    if not addr:
        return ""
    return re.sub(r'\s+', '', addr)

def fetch_all_active_spots():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "count=exact"
    }
    
    url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,region,area,category,address,summary,image_url,lat,lng,quality_score,source,is_closed&is_closed=eq.false&limit=1000&offset=0"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as res:
        cr = res.headers.get("Content-Range")
        total = int(cr.split("/")[1]) if cr else 1000
        spots = json.loads(res.read().decode("utf-8"))
        
    for offset in range(1000, total, 1000):
        url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,region,area,category,address,summary,image_url,lat,lng,quality_score,source,is_closed&is_closed=eq.false&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as res:
            chunk = json.loads(res.read().decode("utf-8"))
            spots.extend(chunk)
            
    return spots

def close_spots_batch(spot_ids):
    if not spot_ids:
        return True
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    # 50개씩 나눠서 PATCH 실행
    chunk_size = 50
    success = True
    for i in range(0, len(spot_ids), chunk_size):
        chunk = spot_ids[i:i+chunk_size]
        ids_param = ",".join(str(sid) for sid in chunk)
        url = f"{SUPABASE_URL}/rest/v1/spots?id=in.({ids_param})"
        req = urllib.request.Request(url, data=json.dumps({"is_closed": True}).encode("utf-8"), headers=headers, method="PATCH")
        try:
            with urllib.request.urlopen(req) as res:
                if res.status not in (200, 204):
                    success = False
        except Exception as e:
            print(f"❌ PATCH 오류: {e}")
            success = False
    return success

def main():
    print("🚀 [스팟 정교화 클린업] Active 스팟 전체 로드 중...")
    spots = fetch_all_active_spots()
    print(f"  • 총 로드된 Active 스팟: {len(spots):,}개")
    
    # 1. 7대 부적합 업종 선별
    disallowed_ids = set()
    disallowed_details = []
    
    for s in spots:
        name = s.get("name", "")
        cat = s.get("category", "")
        combined = f"{name} {cat}".lower()
        
        for rule in DISALLOWED_CATEGORIES:
            if rule in combined:
                disallowed_ids.add(s["id"])
                disallowed_details.append((s["id"], name, cat, s.get("address", ""), rule))
                break
                
    print(f"\n🚫 [1. 부적합 업종 격리 대상] 총 {len(disallowed_ids):,}개 스팟 선별")
    print("▶ 대표 부적합 스팟 샘플 10선:")
    for d in disallowed_details[:10]:
        print(f"  - [{d[1]}] (카테고리: {d[2]}) | 주소: {d[3]} | 사유: [{d[4]}]")
        
    # 2. 중복 스팟 선별 (동일 상호명 + 동일 주소/좌표)
    # 부적합 업종으로 이미 제외된 스팟은 제외하고 남은 스팟 중에서 중복 검사
    valid_spots = [s for s in spots if s["id"] not in disallowed_ids]
    
    group_map = defaultdict(list)
    for s in valid_spots:
        norm_n = normalize_name(s.get("name"))
        norm_a = normalize_addr(s.get("address")) or f"{s.get('region', '')}_{s.get('area', '')}"
        key = f"{norm_n}_{norm_a}"
        group_map[key].append(s)
        
    duplicate_to_close_ids = set()
    kept_count = 0
    dup_group_count = 0
    
    for key, group in group_map.items():
        if len(group) > 1:
            dup_group_count += 1
            # 가장 품질 점수 높고 정보 풍부한 1개 선별 (내림차순 정렬)
            def spot_richness(sp):
                score = sp.get("quality_score") or 0
                if sp.get("image_url"):
                    score += 20
                if sp.get("summary") and len(sp["summary"]) > 10:
                    score += 10
                return score
                
            sorted_group = sorted(group, key=spot_richness, reverse=True)
            winner = sorted_group[0]
            kept_count += 1
            
            for loser in sorted_group[1:]:
                duplicate_to_close_ids.add(loser["id"])
                
    print(f"\n👥 [2. 중복 스팟 격리 대상] 총 {dup_group_count:,}개 그룹에서 잉여 중복 {len(duplicate_to_close_ids):,}개 스팟 선별 (대표 1개씩 총 {kept_count:,}개 유지)")
    
    # 3. 일괄 비활성화(is_closed=true) 실행
    all_to_close = list(disallowed_ids | duplicate_to_close_ids)
    print(f"\n⚡ [클린업 실행] 총 {len(all_to_close):,}개 스팟(부적합 {len(disallowed_ids)} + 중복 {len(duplicate_to_close_ids)}) 일괄 비활성화(is_closed=true) 시작...")
    
    if close_spots_batch(all_to_close):
        print(f"🎉 [클린업 완료] 총 {len(all_to_close):,}개 스팟 비활성화 및 DB 정제 완료!")
        print(f"  • 정제 후 예상 정상 Active 스팟 수: {len(spots) - len(all_to_close):,}개 (고품질 정예 스팟)")
    else:
        print("❌ 일부 스팟 비활성화 중 오류가 발생했습니다.")

if __name__ == "__main__":
    main()
