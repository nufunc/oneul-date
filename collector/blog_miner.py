#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 블로그 & 구글 웹 검색 마이닝 엔진 (Blog & Web Search Miner)
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
from supabase_worker import load_env, search_naver, calculate_quality_score, is_polluted_header_name
from discovery_engine import infer_slot
from category_filter import is_date_spot_category
from area_seeds import generate_dynamic_queries, get_coverage_gap_areas

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 블로그 & 웹 검색 쿼리 풀 (전국 8개 권역 × 2026 데이트 포스팅 마이닝 50개+)
BLOG_SEARCH_QUERIES = [
    # 서울
    ("성수동 데이트 코스 분위기 맛집 추천", "서울", "성동구", ["trendy", "romantic"]),
    ("성수 서울숲 카페거리 디저트 핫플", "서울", "성동구", ["trendy", "healing"]),
    ("한남동 이태원 기념일 와인바 다이닝", "서울", "용산구", ["luxury", "romantic"]),
    ("용산 용리단길 삼각지 웨이팅 맛집", "서울", "용산구", ["trendy", "gourmet"]),
    ("서촌 북촌 삼청동 감성 카페 찻집", "서울", "종로구", ["healing", "retro"]),
    ("익선동 한옥마을 감성 와인바 디너", "서울", "종로구", ["retro", "romantic"]),
    ("을지로 힙지로 숨은 감성 펍 추천", "서울", "중구", ["retro", "trendy"]),
    ("연남동 연희동 파스타 브런치 맛집", "서울", "마포구", ["romantic", "gourmet"]),
    ("망원동 망리단길 아기자기 감성 소품샵 카페", "서울", "마포구", ["healing", "trendy"]),
    ("압구정 도산공원 디저트 오마카세", "서울", "강남구", ["luxury", "gourmet"]),
    ("청담동 기념일 파인다이닝 분위기 좋은곳", "서울", "강남구", ["luxury", "romantic"]),
    ("잠실 송리단길 석촌호수 테라스 카페", "서울", "송파구", ["romantic", "view"]),
    ("문래동 창작촌 철공소 감성 루프탑", "서울", "영등포구", ["retro", "trendy"]),
    ("샤로수길 서울대입구 분위기 데이트 맛집", "서울", "관악구", ["trendy", "romantic"]),
    # 경기/인천
    ("판교 백현동 카페거리 브런치 데이트", "경기", "성남시", ["trendy", "romantic"]),
    ("수원 행궁동 데이트 코스 맛집 카페", "경기", "수원시", ["romantic", "retro"]),
    ("광교 앨리웨이 호수공원 전망 레스토랑", "경기", "수원시", ["view", "romantic"]),
    ("화성 동탄 호수공원 뷰 루프탑 다이닝", "경기", "화성시", ["view", "healing"]),
    ("영종도 구읍뱃터 바다뷰 대형 카페", "인천", "중구", ["view", "healing"]),
    ("송도 센트럴파크 오션뷰 스테이크 하우스", "인천", "연수구", ["view", "luxury"]),
    ("일산 밤리단길 보넷길 파스타 맛집", "경기", "고양시", ["romantic", "trendy"]),
    ("파주 헤이리 출판단지 감성 카페", "경기", "파주시", ["healing", "romantic"]),
    ("가평 청평 북한강 드라이브 코스 카페", "경기", "가평군", ["view", "healing"]),
    ("양평 두물머리 강변 뷰 베이커리", "경기", "양평군", ["view", "healing"]),
    ("김포 라베니체 수변 금빛수로 감성 펍", "경기", "김포시", ["view", "romantic"]),
    ("하남 미사 팔당 드라이브 테라스 맛집", "경기", "하남시", ["view", "healing"]),
    # 강원
    ("강릉 안목해변 경포대 오션뷰 카페", "강원", "강릉시", ["view", "romantic"]),
    ("강릉 초당 순두부마을 감성 디저트", "강원", "강릉시", ["trendy", "gourmet"]),
    ("속초 동명항 바다전망 감성 횟집", "강원", "속초시", ["view", "gourmet"]),
    ("속초 영랑호 뷰 감성 브런치", "강원", "속초시", ["view", "healing"]),
    ("춘천 의암호 드라이브 카페 브런치", "강원", "춘천시", ["view", "healing"]),
    ("양양 서피비치 인구해변 감성 펍", "강원", "양양군", ["trendy", "active"]),
    # 영남
    ("부산 해운대 광안리 오션뷰 데이트", "영남", "해운대구", ["view", "romantic"]),
    ("부산 전포동 서면 카페거리 핫플", "영남", "부산진구", ["trendy", "romantic"]),
    ("부산 영도 흰여울마을 바다뷰 감성 카페", "영남", "영도구", ["view", "retro"]),
    ("부산 기장 오션뷰 대형 루프탑 카페", "영남", "기장군", ["view", "healing"]),
    ("경주 황리단길 보문단지 한옥 맛집", "영남", "경주시", ["retro", "romantic"]),
    ("대구 동성로 교동 LP 감성 와인바", "영남", "중구", ["retro", "trendy"]),
    ("대구 수성못 야경 드라이브 카페", "영남", "수성구", ["romantic", "view"]),
    ("포항 영일대 해상 스카이워크 뷰 맛집", "영남", "포항시", ["view", "romantic"]),
    # 호남
    ("전주 한옥마을 남부시장 감성 코스", "호남", "전주시", ["healing", "retro"]),
    ("전주 객리단길 객사 파스타 맛집", "호남", "전주시", ["romantic", "gourmet"]),
    ("여수 돌산 밤바다 오션뷰 레스토랑", "호남", "여수시", ["romantic", "view"]),
    ("순천만 국가정원 근처 감성 카페", "호남", "순천시", ["healing", "view"]),
    ("광주 동명동 한옥 감성 카페 바", "호남", "동구", ["trendy", "romantic"]),
    ("광주 양림동 펭귄마을 브런치", "호남", "남구", ["retro", "healing"]),
    # 충청 & 제주
    ("대전 소제동 갈마동 감성 데이트", "충청", "동구", ["retro", "trendy"]),
    ("대전 유성 봉명동 야외 테라스 맛집", "충청", "유성구", ["romantic", "trendy"]),
    ("공주 제민천 감성 한옥 카페", "충청", "공주시", ["retro", "healing"]),
    ("제주 애월 한림 노을 뷰 브런치", "제주", "제주시", ["view", "romantic"]),
    ("제주 구좌 세화 월정리 해변 카페", "제주", "제주시", ["view", "healing"]),
    ("제주 서귀포 중문 숲속 힐링 명소", "제주", "서귀포시", ["healing", "luxury"]),

    # 🎯 액티비티 / 이색 데이트 / 원데이클래스 / 레저
    ("서울 실내 이색 데이트 방탈출 보드게임", "서울", "마포구", ["active", "trendy"]),
    ("성수동 원데이클래스 도예 향수 가죽 공방", "서울", "성동구", ["trendy", "active"]),
    ("가평 양평 수상레저 패러글라이딩 짚라인", "경기", "가평군", ["active", "view"]),
    ("강릉 양양 서핑 강습 패들보드 요트투어", "강원", "양양군", ["active", "trendy"]),
    ("춘천 삼악산 케이블카 카누 카약 물레길", "강원", "춘천시", ["active", "healing"]),
    ("단양 패러글라이딩 만천하스카이워크 알파인코스터", "충청", "단양군", ["active", "view"]),
    ("여수 해상케이블카 요트투어 해양레일바이크", "호남", "여수시", ["active", "romantic"]),
    ("통영 루지 해상케이블카 어드벤처", "영남", "통영시", ["active", "view"]),
    ("제주 9.81파크 카트 쇠소깍 카약 체험", "제주", "서귀포시", ["active", "healing"]),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
}

_BLOG_STOP_WORDS = frozenset(["후기", "내돈내산", "추천", "데이트", "맛집", "카페", "일상", "서울", "경기", "부산", "제주", "코스", "분위기", "사진", "리뷰", "솔직", "주말", "존맛", "강추", "정리", "모음", "베스트", "best"])

def fetch_blog_candidates(query: str):
    """네이버 뷰/블로그 검색 피드에서 유망한 데이트 스팟 상호명 추출"""
    encoded = urllib.parse.quote(query)
    candidates = set()

    # 1. 네이버 뷰/블로그 피드
    try:
        url = f"https://search.naver.com/search.naver?where=view&sm=tab_jum&query={encoded}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                html = res.read().decode('utf-8', errors='ignore')
                raw_titles = re.findall(r'<a[^>]+class="[^"]*(?:title_link|total_tit|headline|title_area|news_tit)[^"]*"[^>]*>(.*?)</a>', html)
                if not raw_titles:
                    raw_titles = re.findall(r'<a[^>]+href="https?://(?:blog\.naver\.com|tistory\.com|brunch\.co\.kr)[^>]*>(.*?)</a>', html)

                for t in raw_titles:
                    clean_t = re.sub(r'<[^>]+>', '', t).strip()
                    # '[성수] 상호명' 또는 '[상호명]'
                    for m in re.findall(r'\[([^\]]+)\]', clean_t):
                        clean_m = m.strip()
                        if 2 <= len(clean_m) <= 12 and not any(w in clean_m for w in _BLOG_STOP_WORDS):
                            candidates.add(clean_m)
                    
                    # 큰따옴표/작은따옴표/특수괄호
                    for q in re.findall(r'["\'「『]([가-힣a-zA-Z0-9\s]{2,12})["\'」』]', clean_t):
                        clean_q = q.strip()
                        if not any(w in clean_q for w in _BLOG_STOP_WORDS):
                            candidates.add(clean_q)

                    # 콜론/하이픈 앞 접두 상호명 (예: '성수다락 - 감성 파스타 맛집')
                    m_prefix = re.match(r'^([가-힣a-zA-Z0-9\s]{2,10})\s*[-:|·]\s*', clean_t)
                    if m_prefix:
                        cand = m_prefix.group(1).strip()
                        if not any(w in cand for w in _BLOG_STOP_WORDS):
                            candidates.add(cand)
    except Exception:
        pass

    # 2. 다음 블로그 검색 피드 폴백
    try:
        url = f"https://search.daum.net/search?w=blog&q={encoded}&sort=recency"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                html = res.read().decode('utf-8', errors='replace')
                quote_matches = re.findall(r'[\'\"「『]([가-힣a-zA-Z0-9\s]{2,15})[\'\"」』]', html)
                for m in quote_matches:
                    clean_m = m.strip()
                    if len(clean_m) >= 2 and not any(w in clean_m for w in _BLOG_STOP_WORDS):
                        candidates.add(clean_m)
    except Exception:
        pass

    return list(candidates)

def run_blog_mining(supabase_url: str, service_key: str, max_discoveries: int = 15):
    if not supabase_url or not service_key:
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1) DB 커버리지 갭 분석 (스팟 수가 적은 소외 자치구 감지, 예: 금천구 가산, 구로, 도봉 등)
    gap_districts = []
    try:
        gap_districts = get_coverage_gap_areas(supabase_url, service_key, limit=6)
    except Exception:
        pass

    # 2) 정적 핫플 쿼리 + 소외지역/역세권 동적 합성 쿼리 50:50 배합
    sample_count = min(len(BLOG_SEARCH_QUERIES), max(8, (max_discoveries + 4) // 4))
    half_count = max(4, sample_count // 2)
    static_sampled = random.sample(BLOG_SEARCH_QUERIES, min(half_count, len(BLOG_SEARCH_QUERIES)))
    dynamic_sampled = generate_dynamic_queries(count=half_count, gap_districts=gap_districts)

    sampled = static_sampled + dynamic_sampled
    random.shuffle(sampled)

    print(f"📝 [블로그 & 소외지역 마이닝 시작] 타깃 쿼리 ({len(sampled)}개): {[q[0] for q in sampled[:5]]} ...")

    discovered = []
    batch_seen_names = set()

    for query_text, region, area, moods in sampled:
        raw_candidates = fetch_blog_candidates(query_text)
        time.sleep(0.2)

        for candidate_name in raw_candidates[:8]:
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

            # 1. 단독 지명(광역 지자체명 단독) 또는 오염된 헤더명 필터
            if len(raw_name := real_name) <= 2 or raw_name in ["서울", "경기", "인천", "강원", "충청", "충북", "충남", "영남", "경북", "경남", "호남", "전북", "전남", "제주", "부산", "대구", "울산", "광주", "대전", "세종"]:
                continue
            if "권역" in raw_name or " / " in raw_name or is_polluted_header_name(raw_name):
                continue

            # 2. 단일 배치(메모리) 내 중복 검사
            if real_name in batch_seen_names:
                continue

            cat = str(top.get("category") or "")
            road_addr = top.get("roadAddress") or top.get("address") or ""

            # 3. 데이트 스팟 카테고리 & 상호명 엄격 검증 (비데이트 업종·숙박·체인브랜드 차단)
            ok_cat, cat_reason = is_date_spot_category(cat, real_name)
            if not ok_cat:
                continue

            if not real_name or not road_addr or len(road_addr.strip()) < 5:
                continue

            # 4. DB 중복 검사
            check_url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{urllib.parse.quote(real_name)}"
            try:
                check_req = urllib.request.Request(check_url, headers=api_headers)
                with urllib.request.urlopen(check_req, timeout=5) as res:
                    existing = json.loads(res.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        continue
            except Exception:
                pass

            batch_seen_names.add(real_name)

            derived_reg, derived_area = derive_region_area(road_addr)
            real_reg = derived_reg or region
            real_area = derived_area or area
            real_loc = f"{real_reg} {real_area}".strip()

            slot = infer_slot(cat, real_name)
            thum = top.get("thumUrl") or top.get("image") or top.get("imageUrl") or top.get("thumbUrl")
            x_coord = top.get("x") or top.get("lng")
            y_coord = top.get("y") or top.get("lat")

            spot_id = int(time.time() * 1000) + random.randint(100, 999)
            spot = {
                "id": spot_id,
                "name": real_name,
                "slot": slot,
                "region": real_reg,
                "area": real_area,
                "address": road_addr,
                "mood": moods,
                "location": real_loc,
                "price": "2~4만원대",
                "summary": f"블로그 인기 추천 {real_reg} {real_area}의 감성 {cat or '데이트 핫플'}",
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
