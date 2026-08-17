#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 숙박(stay) 슬롯 데이터 전수 검사 및 비숙소 슬롯 정상화 스크립트
"""

import os
import sys
import json
import urllib.request

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_env():
    env = {}
    for path in [os.path.join(os.getcwd(), ".env"), os.path.join(os.path.dirname(__file__), "..", ".env"), os.path.join(os.path.dirname(__file__), "..", "collector", ".env")]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env[k.strip()] = v.strip().strip("'\"")
            except Exception:
                pass
    return env

env = load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or "https://uyhwhnnzzfhtxjernfit.supabase.co"
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

# 실제 숙박 시설 필수 키워드 (화이트리스트)
STAY_KEYWORDS = [
    "호텔", "리조트", "펜션", "풀빌라", "글램핑", "캠핑", "카라반", "한옥", "료칸", 
    "게스트하우스", "스테이", "민박", "모텔", "독채", "숙소", "콘도", "여관", "호스텔",
    "빌라", "하우스", "연수원", "방갈로", "롯지"
]

# 명백한 비숙박 키워드 (블랙리스트)
NON_STAY_KEYWORDS = [
    "카페", "베이커리", "디저트", "베이글", "커피", "찻집", "다실", "티하우스", "말차",
    "식당", "음식점", "한식", "양식", "일식", "중식", "고기", "구이", "스테이크", "파스타",
    "술집", "주점", "펍", "와인바", "이자카야", "바", "칵테일",
    "영화관", "cgv", "메가박스", "롯데시네마", "서점", "북스팟", "도서관",
    "박물관", "미술관", "갤러리", "전시", "공방", "쇼룸", "플래그십",
    "공원", "산책", "해수욕장", "해변", "케이블카", "테마파크", "유원지", "레일바이크",
    "기업", "약국", "경찰서", "은행", "학원", "병원"
]

def is_genuine_stay(name: str, category: str, summary: str) -> bool:
    text = f"{name} {category or ''} {summary or ''}".lower()
    
    # 1. 명백한 비숙박 키워드가 카테고리나 상호명에 직접 들어있으면 배제
    cat_lower = (category or "").lower()
    name_lower = name.lower()
    
    for non in ["카페", "베이커리", "디저트", "식당", "음식점", "술집", "주점", "와인바", "이자카야", "영화관", "cgv", "서점", "해수욕장", "공원", "약국", "경찰서", "은행", "문화원"]:
        if non in cat_lower or non in name_lower:
            # 단, '캠핑장 내 카페'처럼 스테이 키워드가 상호에 명확히 있는 경우 예외
            if not any(stay in name_lower for stay in ["호텔", "리조트", "펜션", "풀빌라", "글램핑", "스테이", "료칸", "캠핑장"]):
                return False
                
    # 2. 숙박 화이트리스트 키워드가 하나라도 있어야 함
    return any(k in text for k in STAY_KEYWORDS)

def determine_new_slot(name: str, category: str, summary: str) -> str:
    text = f"{name} {category or ''} {summary or ''}".lower()
    if any(k in text for k in ["바", "와인", "술집", "주점", "펍", "이자카야", "칵테일", "야경", "포차"]):
        return "night"
    if any(k in text for k in ["식당", "음식점", "다이닝", "고기", "구이", "파스타", "오마카세", "레스토랑"]):
        return "evening"
    return "day"

def fetch_all_stay_spots():
    url = f"{SUPABASE_URL}/rest/v1/spots?slot=eq.stay&select=*"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}"
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def update_spot_slot(spot_id: int, new_slot: str):
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    data = json.dumps({"slot": new_slot}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    with urllib.request.urlopen(req) as resp:
        pass

def main():
    print("🔍 Supabase DB에서 전체 숙박(stay) 슬롯 데이터 조회 중...")
    spots = fetch_all_stay_spots()
    print(f"📊 총 등록된 stay 슬롯 장소 수: {len(spots)}개")
    
    genuine_count = 0
    reclassified_count = 0
    
    for s in spots:
        name = s.get("name", "")
        cat = s.get("category", "")
        summary = s.get("summary", "")
        spot_id = s.get("id")
        
        if is_genuine_stay(name, cat, summary):
            genuine_count += 1
        else:
            new_slot = determine_new_slot(name, cat, summary)
            print(f"🔄 [ID {spot_id}] {name} ({cat}) ➡️ 슬롯 변경: stay ➔ {new_slot}")
            try:
                update_spot_slot(spot_id, new_slot)
                reclassified_count += 1
            except Exception as e:
                print(f"❌ 수정 실패 ID {spot_id}: {e}")
                
    print("\n" + "="*50)
    print(f"🎉 숙박 데이터 정제 완료!")
    print(f"• 진짜 감성 숙소 유지  : {genuine_count}개")
    print(f"• 비숙소 슬롯 정상화    : {reclassified_count}개")
    print("="*50)

if __name__ == "__main__":
    main()
