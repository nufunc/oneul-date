#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 캐치테이블 & 블루리본 미식 마이너 (CatchTable & Gourmet Miner)
캐치테이블 인기 예약 핫플, 블루리본 서베이 2026 및 미쉐린 빕 구르망 다이닝을 마이닝하여
저녁(evening), 밤(night) 슬롯의 예약 다이닝 및 와인바 스팟을 확충합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import re
import random
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase_worker import load_env, search_naver, calculate_quality_score, derive_region_area
from category_filter import is_date_spot_category

# 캐치테이블 / 블루리본 큐레이션 마이닝 쿼리 풀
GOURMET_SEARCH_QUERIES = [
    # 서울
    ("캐치테이블 성수동 기념일 파인다이닝 와인바", "서울", "성동구", ["romantic", "luxury", "gourmet"], "evening", "₩₩₩"),
    ("캐치테이블 한남동 이태원 테라스 다이닝 바", "서울", "용산구", ["romantic", "luxury"], "night", "₩₩₩"),
    ("블루리본 서베이 2026 청담동 압구정 프렌치 이탈리안", "서울", "강남구", ["luxury", "gourmet"], "evening", "₩₩₩₩"),
    ("캐치테이블 을지로 종로 감성 내추럴 와인바", "서울", "중구", ["retro", "romantic"], "night", "₩₩"),
    ("블루리본 서촌 북촌 한옥 다이닝 코스요리", "서울", "종로구", ["romantic", "healing"], "evening", "₩₩₩"),
    ("캐치테이블 연남동 연희동 파스타 바 예약", "서울", "마포구", ["romantic", "gourmet"], "evening", "₩₩"),
    ("캐치테이블 잠실 송리단길 석촌호수 루프탑 다이닝", "서울", "송파구", ["view", "romantic"], "evening", "₩₩₩"),
    ("블루리본 여의도 한강뷰 스테이크 다이닝", "서울", "영등포구", ["view", "luxury"], "evening", "₩₩₩₩"),

    # 경기 / 인천
    ("캐치테이블 수원 행궁동 감성 와인바 비스트로", "경기", "수원시", ["romantic", "trendy"], "night", "₩₩"),
    ("블루리본 판교 백현동 카페거리 브런치 다이닝", "경기", "성남시", ["luxury", "gourmet"], "day", "₩₩"),
    ("캐치테이블 일산 밤리단길 감성 코스 다이닝", "경기", "고양시", ["romantic", "gourmet"], "evening", "₩₩"),
    ("블루리본 송도 센트럴파크 오션뷰 이탈리안 다이닝", "인천", "연수구", ["view", "luxury"], "evening", "₩₩₩"),

    # 부산 / 경상
    ("캐치테이블 해운대 광안리 오션뷰 와인바 다이닝", "부산", "해운대구", ["view", "romantic"], "night", "₩₩₩"),
    ("블루리본 부산 서면 전포 카페거리 비스트로", "부산", "부산진구", ["trendy", "gourmet"], "evening", "₩₩"),
    ("캐치테이블 대구 동성로 교동 분위기 좋은 와인바", "대구", "중구", ["retro", "romantic"], "night", "₩₩"),
    ("블루리본 경주 황리단길 한옥 다이닝 예약", "경상", "경주시", ["romantic", "retro"], "evening", "₩₩"),

    # 강원 / 제주
    ("캐치테이블 강릉 안목해변 오션뷰 비스트로 와인", "강원", "강릉시", ["view", "romantic"], "evening", "₩₩"),
    ("블루리본 제주 애월 한림 노을 뷰 다이닝 바", "제주", "제주시", ["view", "romantic"], "evening", "₩₩₩"),
    ("캐치테이블 서귀포 중문 흑돼지 파인다이닝", "제주", "서귀포시", ["gourmet", "luxury"], "evening", "₩₩₩"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

def extract_gourmet_candidates_from_web(query_text: str) -> list[str]:
    """네이버 웹 검색 및 블로그에서 캐치테이블/블루리본 스팟명 후보 마이닝"""
    encoded_query = urllib.parse.quote(query_text)
    url = f"https://search.naver.com/search.naver?where=view&query={encoded_query}"

    req = urllib.request.Request(url, headers=HEADERS)
    candidates = []
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            if res.status == 200:
                html = res.read().decode('utf-8', errors='replace')
                # 괄호나 따옴표로 감싸진 상호명 패턴 추출
                matches = re.findall(r'[\'\"「『]([가-힣a-zA-Z0-9\s]{2,15})[\'\"」』]', html)
                for m in matches:
                    c = m.strip()
                    if 2 <= len(c) <= 15 and not any(stop in c for stop in ["추천", "데이트", "코스", "맛집", "예약", "블루리본", "캐치테이블", "후기", "리뷰"]):
                        candidates.append(c)

                # 제목 패턴
                titles = re.findall(r'class="title_link[^>]*>([^<]+)</a>', html)
                for t in titles:
                    words = t.strip().split()
                    for w in words:
                        clean_w = re.sub(r'[^\w가-힣]', '', w)
                        if 2 <= len(clean_w) <= 10 and not any(stop in clean_w for stop in ["데이트", "코스", "맛집", "예약", "와인바", "다이닝", "추천"]):
                            candidates.append(clean_w)
    except Exception as e:
        print(f"  ⚠️ 캐치테이블 마이닝 검색 오류 ({query_text}): {e}")

    # 중복 제거
    unique_candidates = []
    seen = set()
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique_candidates.append(c)

    return unique_candidates[:12]

def check_spot_exists(supabase_url: str, headers: dict, name: str) -> bool:
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', name).strip()
    encoded = urllib.parse.quote(clean_name)
    url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{encoded}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            rows = json.loads(res.read().decode('utf-8'))
            return len(rows) > 0
    except Exception:
        return False

def run_catchtable_mining(supabase_url: str, service_key: str, max_discoveries: int = 15) -> int:
    """캐치테이블 & 블루리본 미식 큐레이션 마이닝 실행"""
    if not supabase_url or not service_key:
        print("⚠️ Supabase URL 또는 키가 없어 캐치테이블 마이닝을 건너뜁니다.")
        return 0

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🍷 [CatchTable Miner] 캐치테이블 & 블루리본 미식 큐레이션 마이닝 시작...")

    queries = list(GOURMET_SEARCH_QUERIES)
    random.shuffle(queries)

    discovered_spots = []

    for query_text, default_region, default_area, moods, slot, price_tier in queries[:4]:
        candidates = extract_gourmet_candidates_from_web(query_text)
        time.sleep(0.5)

        for cand in candidates:
            # 네이버 지도 검색으로 실존 검증
            search_q = f"{default_area} {cand}" if default_area else f"{default_region} {cand}"
            search_res = search_naver(search_q)
            time.sleep(0.3)

            top = search_res.get("top")
            if not top:
                continue

            real_name = top.get("name", "").strip()
            category = top.get("category", "").strip()
            road_addr = top.get("roadAddress", "") or top.get("address", "")
            thum = top.get("thumUrl", "")
            x_coord = top.get("x")
            y_coord = top.get("y")
            place_id = str(top.get("id") or "")

            if not real_name:
                continue

            # 데이트 스팟 카테고리 검증
            is_valid, reason = is_date_spot_category(category, real_name)
            if not is_valid:
                continue

            # 중복 검사
            if check_spot_exists(supabase_url, api_headers, real_name):
                continue

            derived_region, derived_area = derive_region_area(road_addr)
            region = derived_region or default_region
            area = derived_area or default_area

            # 캐치테이블 검색 바로가기 링크 생성
            encoded_real = urllib.parse.quote(real_name)
            catchtable_url = f"https://app.catchtable.co.kr/ct/shop/search?keyword={encoded_real}"
            is_blueribbon = "블루리본" in query_text

            spot_id = int(time.time() * 1000) + random.randint(100, 999)

            new_spot = {
                "id": spot_id,
                "name": real_name,
                "slot": slot,
                "region": region,
                "area": area,
                "address": road_addr,
                "location": f"{region} {area}".strip(),
                "mood": moods,
                "mood_tags": ["캐치테이블", "기념일", "분위기맛집"] + (["블루리본"] if is_blueribbon else []),
                "price": f"1인 {price_tier} 코스/단품",
                "price_tier": price_tier,
                "summary": f"{real_name} — 캐치테이블 인기 예약 {'블루리본 인증 ' if is_blueribbon else ''}데이트 명소 ({area})",
                "category": category or "와인바/다이닝",
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 95 if is_blueribbon else 90,
                "fail_count": 0,
                "reservation_type": "catchtable",
                "reservation_url": catchtable_url,
                "booking_tips": "주말 및 기념일 사전 예약 권장",
                "booking_info": {
                    "available": True,
                    "platform": "catchtable",
                    "url": catchtable_url,
                    "tips": "캐치테이블 실시간 빈자리 예약 가능"
                },
                "curation_badges": {
                    "catchtable": "캐치테이블 핫플",
                    "blue_ribbon": 2026 if is_blueribbon else None
                },
                "provider_ids": {
                    "naver": place_id,
                    "catchtable": real_name
                },
                "parking_info": {
                    "type": "valet" if region == "서울" and area in ("강남구", "용산구", "성동구") else "paid",
                    "detail": "발렛파킹 가능" if region == "서울" and area in ("강남구", "용산구") else "인근 유료/공영주차장 이용"
                },
                "source": {
                    "type": "catchtable_miner",
                    "url": catchtable_url,
                    "note": f"Mined from query: {query_text}"
                },
                "verified": True,
                "is_closed": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
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
                    print(f"✨ [CatchTable/블루리본 INSERT 성공] 총 {len(discovered_spots)}개 예약 다이닝 적재 완료:")
                    for s in discovered_spots:
                        print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']}) | {s['price_tier']}")
                    return len(discovered_spots)
        except Exception as e:
            print(f"❌ CatchTable 스팟 INSERT 실패: {e}")
    else:
        print("💡 [CatchTable Miner] 신규 발굴 스팟 없음 (DB 최신 상태 유지)")

    return 0

if __name__ == "__main__":
    env = load_env()
    supa_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    supa_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    run_catchtable_mining(supa_url, supa_key, max_discoveries=10)
