#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 블로그 & 구글 웹 검색 마이닝 엔진 (Blog & Web Search Miner)
네이버/티스토리 블로그 및 구글 웹 검색의 최신 데이트 포스팅에서 핫플레이스 상호명을 마이닝하고 실시간 검증 후 Supabase에 자동 적재합니다.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import time
import random
import re
from supabase_worker import load_env, search_naver, calculate_quality_score
from discovery_engine import infer_slot

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 블로그 & 웹 검색 쿼리 풀 (전국 8개 권역 × 데이트 테마)
BLOG_SEARCH_QUERIES = [
    # 서울
    ("성수동 데이트 코스 분위기 맛집 추천", "서울", "성동구", ["trendy", "romantic"]),
    ("한남동 이태원 기념일 와인바 다이닝", "서울", "용산구", ["luxury", "romantic"]),
    ("서촌 북촌 삼청동 감성 카페 찻집", "서울", "종로구", ["healing", "retro"]),
    ("을지로 힙지로 숨은 감성 펍 추천", "서울", "중구", ["retro", "trendy"]),
    ("연남동 연희동 파스타 브런치 맛집", "서울", "마포구", ["romantic", "gourmet"]),
    ("압구정 도산공원 디저트 오마카세", "서울", "강남구", ["luxury", "gourmet"]),
    # 경기/인천
    ("수원 행궁동 데이트 코스 맛집 카페", "경기", "수원시", ["romantic", "retro"]),
    ("영종도 구읍뱃터 바다뷰 대형 카페", "인천", "중구", ["view", "healing"]),
    ("일산 밤리단길 보넷길 파스타 맛집", "경기", "고양시", ["romantic", "trendy"]),
    ("파주 헤이리 출판단지 감성 카페", "경기", "파주시", ["healing", "romantic"]),
    # 강원
    ("강릉 안목해변 경포대 오션뷰 카페", "강원", "강릉시", ["view", "romantic"]),
    ("속초 동명항 바다전망 감성 횟집", "강원", "속초시", ["view", "gourmet"]),
    ("춘천 의암호 드라이브 카페 브런치", "강원", "춘천시", ["view", "healing"]),
    # 영남
    ("부산 해운대 광안리 오션뷰 데이트", "영남", "해운대구", ["view", "romantic"]),
    ("부산 전포동 서면 카페거리 핫플", "영남", "부산진구", ["trendy", "romantic"]),
    ("경주 황리단길 보문단지 한옥 맛집", "영남", "경주시", ["retro", "romantic"]),
    ("대구 수성못 야경 드라이브 카페", "영남", "수성구", ["romantic", "view"]),
    # 호남
    ("전주 한옥마을 남부시장 감성 코스", "호남", "전주시", ["healing", "retro"]),
    ("여수 돌산 밤바다 오션뷰 레스토랑", "호남", "여수시", ["romantic", "view"]),
    # 충청 & 제주
    ("대전 소제동 갈마동 감성 데이트", "충청", "동구", ["retro", "trendy"]),
    ("제주 애월 한림 노을 뷰 브런치", "제주", "제주시", ["view", "romantic"]),
    ("제주 서귀포 중문 숲속 힐링 명소", "제주", "서귀포시", ["healing", "luxury"]),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
}

def fetch_blog_candidates(query: str):
    """네이버/다음 블로그 검색 스니펫에서 잠재적 스팟 상호명 마이닝"""
    candidates = set()
    encoded = urllib.parse.quote(query)

    # 1. 다음/카카오 블로그 검색 피드
    try:
        url = f"https://search.daum.net/search?w=blog&q={encoded}&sort=recency"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as res:
            html = res.read().decode('utf-8', errors='replace')
            # 텍스트 내 주요 장소명 패턴 (따옴표, 볼드, 특정 키워드 앞뒤)
            # 패턴 1: '상호명' 또는 "상호명"
            quote_matches = re.findall(r'[\'\"「『]([가-힣a-zA-Z0-9\s]{2,15})[\'\"」』]', html)
            for m in quote_matches:
                clean_m = m.strip()
                if len(clean_m) >= 2 and not any(w in clean_m for w in ["데이트", "코스", "맛집", "추천", "카페", "분위기", "사진", "리뷰", "솔직", "후기", "주말", "내돈내산", "일상"]):
                    candidates.add(clean_m)

            # 패턴 2: 제목 내 핵심 상호명 (예: [성수동] 성수다락 다녀옴)
            bracket_matches = re.findall(r'\[([가-힣a-zA-Z0-9\s]{2,10})\]', html)
            for b in bracket_matches:
                clean_b = b.strip()
                if len(clean_b) >= 2 and not any(w in clean_b for w in ["성수", "한남", "서울", "부산", "제주", "강릉", "수원", "맛집", "카페"]):
                    candidates.add(clean_b)
    except Exception:
        pass

    return list(candidates)

def run_blog_mining(supabase_url: str, service_key: str, max_discoveries: int = 5):
    if not supabase_url or not service_key:
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 랜덤 2개 블로그 쿼리 선택
    sampled = random.sample(BLOG_SEARCH_QUERIES, min(2, len(BLOG_SEARCH_QUERIES)))
    print(f"📝 [블로그 & 웹 마이닝 시작] 타깃 쿼리: {[q[0] for q in sampled]}")

    discovered = []

    for query_text, region, area, moods in sampled:
        raw_candidates = fetch_blog_candidates(query_text)
        time.sleep(0.3)

        for candidate_name in raw_candidates[:6]:
            search_query = f"{candidate_name} {area}"
            places = search_naver(search_query)
            time.sleep(0.2)

            if not places:
                places = search_naver(candidate_name)
                time.sleep(0.2)

            if not places or len(places) == 0:
                continue

            top = places[0]
            real_name = top.get("name", "").strip()
            cat = str(top.get("category") or "")
            road_addr = top.get("roadAddress") or top.get("address") or ""

            # 숙소 100% 필터링
            if any(k in cat for k in ["숙박", "모텔", "호텔", "펜션", "게스트하우스", "리조트"]):
                continue

            if not real_name or not road_addr:
                continue

            # DB 중복 검사
            check_url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{urllib.parse.quote(real_name)}"
            try:
                check_req = urllib.request.Request(check_url, headers=api_headers)
                with urllib.request.urlopen(check_req, timeout=5) as res:
                    existing = json.loads(res.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        continue
            except Exception:
                pass

            slot = infer_slot(cat, real_name)
            thum = top.get("thumUrl") or top.get("image") or top.get("imageUrl") or top.get("thumbUrl")
            x_coord = top.get("x") or top.get("lng")
            y_coord = top.get("y") or top.get("lat")

            spot_id = int(time.time() * 1000) + random.randint(100, 999)
            spot = {
                "id": spot_id,
                "name": real_name,
                "slot": slot,
                "region": region,
                "area": area,
                "address": road_addr,
                "mood": moods,
                "location": f"{region} {area}",
                "price": "2~4만원대",
                "summary": f"블로그 인기 추천 {region} {area}의 감성 {cat or '데이트 핫플'}",
                "category": cat,
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 85,
                "fail_count": 0,
                "source": {
                    "type": "blog_mining",
                    "url": f"https://map.naver.com/p/search/{urllib.parse.quote(real_name)}",
                    "note": f"Mined from blog query: {query_text}"
                },
                "verified": True,
                "is_closed": False
            }
            discovered.append(spot)

            if len(discovered) >= max_discoveries:
                break
        if len(discovered) >= max_discoveries:
            break

    if discovered:
        insert_url = f"{supabase_url}/rest/v1/spots"
        data_bytes = json.dumps(discovered, ensure_ascii=False).encode('utf-8')
        ins_req = urllib.request.Request(insert_url, data=data_bytes, headers=api_headers, method='POST')
        try:
            with urllib.request.urlopen(ins_req, timeout=10) as r:
                if r.status in (200, 201):
                    print(f"🎉 [블로그 마이닝 INSERT 성공] 총 {len(discovered)}곳 발굴 및 DB 적재 완료:")
                    for s in discovered:
                        print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']})")
        except Exception as e:
            print(f"❌ 블로그 마이닝 INSERT 실패: {e}")
    else:
        print("💡 [블로그 마이닝] 신규 발굴 없음 (DB 최신 상태)")

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")

    run_blog_mining(default_url, default_key)
