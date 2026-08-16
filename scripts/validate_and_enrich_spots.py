#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 실시간 스팟 데이터 검증기 & 주소 보강 파이프라인 (Live Spot Validator & Enricher)
네이버 지도 및 공공/웹 검색을 통해 DB 내 스팟의 실제 영업 여부, 이전 여부, 정확한 도로명 주소를 검증·동기화합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SPOTS_JSON_PATH = os.path.join(BASE_DIR, "src", "data", "spots.json")
REPORT_PATH = os.path.join(BASE_DIR, "scripts", "validation_report.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def clean_search_keyword(name: str, location: str = "") -> str:
    """검색 성공률을 극대화하기 위한 정제 키워드 생성"""
    clean = re.sub(r'\(.*?\)|\[.*?\]', '', name)
    clean = re.sub(r':.*$', '', clean)
    clean = re.sub(r' - .*$', '', clean)
    clean = clean.strip()
    
    # 세부 지명 힌트 추출
    loc_hint = ""
    if location:
        m = re.search(r'(성수|한남|연남|을지로|익선|서촌|북촌|송리단|행궁동|영종도|송도|해운대|광안리|전포|안목|경포|초당|애월|협재|성산|중문)', location)
        if m:
            loc_hint = m.group(1)
            
    if loc_hint and loc_hint not in clean:
        return f"{clean} {loc_hint}"
    return clean

def search_naver_place(query: str):
    """네이버 지도 플레이스 검색 API 호출 (경량 검색)"""
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                # place 또는 site 결과 탐색
                res = data.get("result", {})
                places = res.get("place", {}).get("list", []) or res.get("site", {}).get("list", [])
                return places
    except Exception as e:
        # 모바일 엔드포인트 폴백
        try:
            m_url = f"https://m.map.naver.com/search2/searchMore.naver?query={urllib.parse.quote(query)}&sm=clk&style=v5&page=1&displayCount=5&type=SITE_1"
            m_req = urllib.request.Request(m_url, headers=HEADERS)
            with urllib.request.urlopen(m_req, timeout=5) as m_res:
                if m_res.status == 200:
                    m_data = json.loads(m_res.read().decode('utf-8'))
                    m_list = m_data.get("result", {}).get("site", {}).get("list", [])
                    return [{"name": item.get("name"), "roadAddress": item.get("roadAddress") or item.get("address")} for item in m_list]
        except Exception:
            return None
    return []

def extract_region_from_address(address: str) -> tuple:
    """도로명/지번 주소에서 광역 region 및 시·군·구 area 추출"""
    if not address:
        return "", ""
    parts = address.split()
    if len(parts) == 0:
        return "", ""
        
    p0 = parts[0]
    region = ""
    if "서울" in p0:
        region = "서울"
    elif "경기" in p0 or "인천" in p0:
        region = "경기" if "경기" in p0 else "인천"
    elif "강원" in p0:
        region = "강원"
    elif "충청" in p0 or "충북" in p0 or "충남" in p0 or "대전" in p0 or "세종" in p0:
        region = "충청"
    elif "부산" in p0 or "대구" in p0 or "울산" in p0 or "경북" in p0 or "경남" in p0:
        region = "영남"
    elif "광주" in p0 or "전북" in p0 or "전남" in p0:
        region = "호남"
    elif "제주" in p0:
        region = "제주"
        
    area = parts[1] if len(parts) > 1 else ""
    return region, area

def run_validation(sample_limit: int = 50):
    print(f"🚀 스팟 데이터 검증 및 주소 동기화 시작 (최대 {sample_limit}건)...")
    with open(SPOTS_JSON_PATH, "r", encoding="utf-8") as f:
        spots = json.load(f)

    total = len(spots)
    print(f"총 {total}개 스팟 로드 완료.")
    
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "checked": 0,
        "verified_exact": 0,
        "relocated_or_updated": [],
        "not_found": []
    }
    
    # 미검증(verified=false)이거나 주소가 없는 스팟 우선 검증
    target_indices = [
        i for i, s in enumerate(spots) 
        if not s.get("address") or not s.get("verified")
    ][:sample_limit]
    
    updated_count = 0
    for idx in target_indices:
        spot = spots[idx]
        name = spot.get("name", "")
        loc = spot.get("location", "")
        current_region = spot.get("region", "")
        
        query = clean_search_keyword(name, loc)
        places = search_naver_place(query)
        report["checked"] += 1
        
        if places and len(places) > 0:
            top_place = places[0]
            p_name = top_place.get("name", "")
            p_road_addr = top_place.get("roadAddress") or top_place.get("address", "")
            
            real_region, real_area = extract_region_from_address(p_road_addr)
            
            # 주소 및 검증 필드 보강
            spot["address"] = p_road_addr
            spot["verified"] = True
            
            # 지역 변경 감지 (이전/오분류)
            if real_region and real_region != current_region and current_region not in ["전국", "수도권"]:
                report["relocated_or_updated"].append({
                    "id": spot.get("id"),
                    "name": name,
                    "old_region": current_region,
                    "new_region": real_region,
                    "real_address": p_road_addr,
                    "naver_name": p_name
                })
                spot["region"] = real_region
                if real_area:
                    spot["area"] = real_area
                print(f"⚠️ [이전/오분류 감지 & 수정] {name}: {current_region} -> {real_region} ({p_road_addr})")
            else:
                report["verified_exact"] += 1
                
            updated_count += 1
        else:
            report["not_found"].append({
                "id": spot.get("id"),
                "name": name,
                "query": query,
                "location": loc
            })
            
        time.sleep(0.1) # Rate limit 방어
        
    # 변경 사항 저장
    with open(SPOTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(spots, f, ensure_ascii=False, indent=2)
        
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        
    print(f"✅ 검증 완료! 검증: {report['checked']}건 / 주소보강: {updated_count}건 / 위치교정: {len(report['relocated_or_updated'])}건")
    print(f"📄 리포트 저장 위치: {REPORT_PATH}")

if __name__ == "__main__":
    limit = 30
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except ValueError:
            pass
    run_validation(limit)
