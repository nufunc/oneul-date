#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — OCI VM 신규 핫플레이스 자율 발굴 엔진 (Autonomous Spot Discovery Engine)
전국 권역별 테마 검색어를 순회하여 2026 최신 핫플을 스스로 발굴하고 Supabase DB에 자동 증강합니다.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import time
import random
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")

def load_env():
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

# 자율 탐색 쿼리 풀 (전국 8개 권역 × 핵심 테마)
DISCOVERY_QUERIES = [
    # 서울
    ("서울 성수동 신상 카페", "서울", "성동구", ["trendy", "romantic"]),
    ("서울 한남동 와인바 다이닝", "서울", "용산구", ["luxury", "romantic"]),
    ("서울 서촌 북촌 감성 찻집", "서울", "종로구", ["healing", "retro"]),
    ("서울 문래동 창작촌 펍", "서울", "영등포구", ["retro", "trendy"]),
    ("서울 연남동 연희동 파스타", "서울", "마포구", ["romantic", "gourmet"]),
    ("서울 신사동 도산공원 오마카세", "서울", "강남구", ["luxury", "gourmet"]),
    # 경기/인천
    ("인천 영종도 오션뷰 대형 카페", "인천", "중구", ["view", "healing"]),
    ("경기 수원 행궁동 공방 카페", "경기", "수원시", ["romantic", "retro"]),
    ("경기 가평 청평 리버뷰 테라스", "경기", "가평군", ["view", "healing"]),
    ("경기 파주 헤이리 아틀리에", "경기", "파주시", ["healing", "trendy"]),
    # 강원
    ("강원 강릉 경포 오션뷰 브런치", "강원", "강릉시", ["view", "romantic"]),
    ("강원 춘천 의암호 레이크뷰 카페", "강원", "춘천시", ["view", "healing"]),
    ("강원 속초 영랑호 감성 카페", "강원", "속초시", ["view", "healing"]),
    # 영남
    ("부산 해운대 달맞이길 다이닝", "영남", "해운대구", ["view", "luxury"]),
    ("부산 전포동 카페거리 바", "영남", "부산진구", ["trendy", "romantic"]),
    ("경북 경주 황리단길 한옥 디저트", "영남", "경주시", ["retro", "romantic"]),
    ("대구 동성로 교동 LP바", "영남", "중구", ["retro", "trendy"]),
    # 호남
    ("전북 전주 한옥마을 다도 살롱", "호남", "전주시", ["healing", "retro"]),
    ("전남 여수 낭만포차 해물삼합", "호남", "여수시", ["romantic", "view"]),
    ("광주 동명동 한옥 감성 카페", "호남", "동구", ["trendy", "romantic"]),
    # 충청
    ("충남 태안 안면도 노을 오션뷰 카페", "충청", "태안군", ["view", "romantic"]),
    ("대전 소제동 관사촌 감성 카페", "충청", "동구", ["retro", "trendy"]),
    # 제주
    ("제주 애월 한림 선셋 오션뷰 카페", "제주", "제주시", ["view", "romantic"]),
    ("제주 구좌 월정리 해변 브런치", "제주", "제주시", ["view", "healing"]),
    ("제주 서귀포 중문 숲속 힐링 스팟", "제주", "서귀포시", ["healing", "luxury"]),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def infer_slot(category: str, name: str) -> str:
    cat = (category or "").lower()
    nm = name.lower()
    if any(k in cat or k in nm for k in ["바(bar)", "와인", "칵테일", "펍", "주점", "포차", "야시장", "이자카야"]):
        return "night"
    if any(k in cat or k in nm for k in ["다이닝", "오마카세", "레스토랑", "스테이크", "파스타", "코스", "한정식"]):
        return "evening"
    return "day"

def search_discovery(query: str):
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res = data.get("result", {})
                places = res.get("place", {}).get("list", []) or res.get("site", {}).get("list", [])
                return places
    except Exception:
        pass
    return []

def run_discovery(supabase_url: str, service_key: str, max_discoveries: int = 5):
    if not supabase_url or not service_key:
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 랜덤 3개 탐색 쿼리 선택
    sampled_queries = random.sample(DISCOVERY_QUERIES, min(3, len(DISCOVERY_QUERIES)))
    print(f"🧭 [신규 핫플 자율 탐색] 선택된 쿼리: {[q[0] for q in sampled_queries]}")

    discovered_spots = []

    for query_text, region, area, default_moods in sampled_queries:
        places = search_discovery(query_text)
        time.sleep(0.3)

        for p in places[:4]:  # 상위 4개 검토
            raw_name = p.get("name", "").strip()
            # 숙소/펜션/호텔/모텔 100% 필터링
            cat = str(p.get("category") or "")
            if any(k in cat for k in ["숙박", "모텔", "호텔", "펜션", "게스트하우스", "리조트"]):
                continue

            road_addr = p.get("roadAddress") or p.get("address") or ""
            if not raw_name or not road_addr:
                continue

            # DB 중복 검사 (이름으로 SELECT)
            check_url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{urllib.parse.quote(raw_name)}"
            try:
                check_req = urllib.request.Request(check_url, headers=api_headers)
                with urllib.request.urlopen(check_req, timeout=5) as res:
                    existing = json.loads(res.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        continue  # 이미 존재하는 스팟
            except Exception:
                pass

            # 신규 핫플 스키마 생성
            slot = infer_slot(cat, raw_name)
            thum = p.get("thumUrl") or p.get("image") or p.get("imageUrl") or p.get("thumbUrl")
            x_coord = p.get("x") or p.get("lng")
            y_coord = p.get("y") or p.get("lat")

            spot_id = int(time.time() * 1000) + random.randint(100, 999)
            new_spot = {
                "id": spot_id,
                "name": raw_name,
                "slot": slot,
                "region": region,
                "area": area,
                "address": road_addr,
                "mood": default_moods,
                "location": f"{region} {area}",
                "price": "2~4만원대",
                "summary": f"{region} {area}의 2026 감성 {cat or '데이트 핫플레이스'}",
                "category": cat,
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 85,
                "fail_count": 0,
                "source": {"type": "auto_discovery", "url": f"https://map.naver.com/p/search/{urllib.parse.quote(raw_name)}", "note": "2026 autonomous discovery"},
                "verified": True,
                "is_closed": False
            }
            discovered_spots.append(new_spot)

            if len(discovered_spots) >= max_discoveries:
                break
        if len(discovered_spots) >= max_discoveries:
            break

    if discovered_spots:
        insert_url = f"{supabase_url}/rest/v1/spots"
        data_bytes = json.dumps(discovered_spots, ensure_ascii=False).encode('utf-8')
        ins_req = urllib.request.Request(insert_url, data=data_bytes, headers=api_headers, method='POST')
        try:
            with urllib.request.urlopen(ins_req, timeout=10) as r:
                if r.status in (200, 201):
                    print(f"✨ [신규 핫플 자동 INSERT 성공] 총 {len(discovered_spots)}곳 발굴 및 DB 증강 완료:")
                    for s in discovered_spots:
                        print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']})")
        except Exception as e:
            print(f"❌ 신규 스팟 INSERT 실패: {e}")
    else:
        print("💡 [신규 핫플 탐색] 탐색된 신규 장소 없음 (기존 DB 최신 상태 유지)")

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")

    run_discovery(default_url, default_key)
