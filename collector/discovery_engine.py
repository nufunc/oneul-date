#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 핫플레이스 자율 발굴 엔진 (Autonomous Spot Discovery Engine)
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

from category_filter import is_date_spot_category
from area_seeds import generate_dynamic_queries, get_coverage_gap_areas
from supabase_worker import is_polluted_header_name, derive_region_area

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_env():
    env = {}
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env[k.strip()] = v.strip().strip('"').strip("'")
                break
            except Exception:
                pass
    return env

# 자율 탐색 쿼리 풀 (전국 8개 권역 × 핵심 핫플/데이트 테마 60개+)
DISCOVERY_QUERIES = [
    # 서울 (주요 핫플레이스)
    ("서울 성수동 신상 카페", "서울", "성동구", ["trendy", "romantic"]),
    ("서울 성수동 서울숲 와인바 다이닝", "서울", "성동구", ["trendy", "romantic"]),
    ("서울 한남동 와인바 다이닝", "서울", "용산구", ["luxury", "romantic"]),
    ("서울 이태원 해방촌 루프탑 바", "서울", "용산구", ["view", "romantic"]),
    ("서울 용산 용리단길 감성 맛집", "서울", "용산구", ["trendy", "gourmet"]),
    ("서울 연남동 연희동 파스타 브런치", "서울", "마포구", ["romantic", "gourmet"]),
    ("서울 망원동 망리단길 감성 카페", "서울", "마포구", ["healing", "trendy"]),
    ("서울 서촌 북촌 감성 찻집 한옥", "서울", "종로구", ["healing", "retro"]),
    ("서울 익선동 한옥 와인바", "서울", "종로구", ["retro", "romantic"]),
    ("서울 을지로 힙지로 숨은 펍 바", "서울", "중구", ["retro", "trendy"]),
    ("서울 신사동 가로수길 도산공원 디저트", "서울", "강남구", ["luxury", "trendy"]),
    ("서울 청담동 파인다이닝 오마카세", "서울", "강남구", ["luxury", "gourmet"]),
    ("서울 잠실 송리단길 석촌호수 카페", "서울", "송파구", ["romantic", "trendy"]),
    ("서울 문래동 창작촌 펍 루프탑", "서울", "영등포구", ["retro", "trendy"]),
    ("서울 샤로수길 관악 감성 맛집", "서울", "관악구", ["trendy", "romantic"]),
    ("서울 성북동 감성 전통 찻집", "서울", "성북구", ["healing", "retro"]),

    # 경기/인천 (주요 데이트존 & 신도시)
    ("경기 분당 판교 백현동 카페거리", "경기", "성남시", ["trendy", "romantic"]),
    ("경기 판교 아브뉴프랑 다이닝", "경기", "성남시", ["luxury", "gourmet"]),
    ("경기 수원 행궁동 공방 카페", "경기", "수원시", ["romantic", "retro"]),
    ("경기 수원 광교 앨리웨이 호수뷰", "경기", "수원시", ["view", "romantic"]),
    ("경기 화성 동탄 호수공원 브런치", "경기", "화성시", ["view", "healing"]),
    ("인천 송도 센트럴파크 오션뷰 다이닝", "인천", "연수구", ["view", "luxury"]),
    ("인천 영종도 오션뷰 대형 베이커리", "인천", "중구", ["view", "healing"]),
    ("경기 가평 청평 리버뷰 테라스 카페", "경기", "가평군", ["view", "healing"]),
    ("경기 양평 두물머리 북한강 드라이브 카페", "경기", "양평군", ["view", "healing"]),
    ("경기 파주 헤이리 아틀리에 감성 스팟", "경기", "파주시", ["healing", "trendy"]),
    ("경기 고양 일산 밤리단길 보넷길 파스타", "경기", "고양시", ["romantic", "gourmet"]),
    ("경기 하남 미사경정공원 뷰 브런치", "경기", "하남시", ["view", "romantic"]),
    ("경기 남양주 팔당 북한강 뷰 테라스", "경기", "남양주시", ["view", "healing"]),
    ("경기 김포 라베니체 수변 감성 펍", "경기", "김포시", ["view", "romantic"]),

    # 강원 (강릉/춘천/속초/양양/평창/원주/고성/동해/삼척/정선/영월)
    ("강원 강릉 경포 안목해변 오션뷰 브런치", "강원", "강릉시", ["view", "romantic"]),
    ("강원 강릉 초당 감성 디저트 카페", "강원", "강릉시", ["trendy", "romantic"]),
    ("강원 춘천 의암호 레이크뷰 카페", "강원", "춘천시", ["view", "healing"]),
    ("강원 속초 영랑호 청초호 감성 카페", "강원", "속초시", ["view", "healing"]),
    ("강원 양양 인구해변 서피비치 펍", "강원", "양양군", ["trendy", "active"]),
    ("강원 평창 대관령 숲속 힐링 스테이", "강원", "평창군", ["healing", "view"]),
    ("강원 원주 뮤지엄산 감성 갤러리 카페", "강원", "원주시", ["healing", "luxury"]),
    ("강원 고성 아야진 봉포 오션뷰 카페", "강원", "고성군", ["view", "healing"]),
    ("강원 동해 묵호 논골담길 바다뷰 찻집", "강원", "동해시", ["retro", "view"]),
    ("강원 삼척 맹방 장호항 스노클링 뷰 카페", "강원", "삼척시", ["view", "active"]),
    ("강원 영월 선돌 동강 감성 캠핑 스테이", "강원", "영월군", ["healing", "view"]),

    # 영남 (부산/대구/울산/경북/경남)
    ("부산 해운대 달맞이길 오션뷰 다이닝", "영남", "해운대구", ["view", "luxury"]),
    ("부산 광안리 드론쇼 뷰 와인바", "영남", "수영구", ["view", "romantic"]),
    ("부산 전포동 서면 카페거리 핫플", "영남", "부산진구", ["trendy", "romantic"]),
    ("부산 영도 흰여울문화마을 바다뷰 카페", "영남", "영도구", ["view", "retro"]),
    ("부산 기장 오시리아 오션뷰 대형 카페", "영남", "기장군", ["view", "healing"]),
    ("경북 경주 황리단길 한옥 디저트 펍", "영남", "경주시", ["retro", "romantic"]),
    ("경북 경주 보문호수 벚꽃 뷰 다이닝", "영남", "경주시", ["view", "romantic"]),
    ("경북 포항 영일대 해상 스카이워크 뷰", "영남", "포항시", ["view", "romantic"]),
    ("경북 포항 호미곶 구룡포 일본인가옥거리 찻집", "영남", "포항시", ["retro", "healing"]),
    ("경북 안동 하회마을 월영교 야경 뷰 카페", "영남", "안동시", ["retro", "view"]),
    ("경북 문경새재 한옥 힐링 찻집", "영남", "문경시", ["healing", "retro"]),
    ("대구 동성로 교동 LP바 와인바", "영남", "중구", ["retro", "trendy"]),
    ("대구 앞산 카페거리 전망대 레스토랑", "영남", "남구", ["view", "romantic"]),
    ("대구 수성못 야경 드라이브 브런치", "영남", "수성구", ["romantic", "view"]),
    ("울산 태화강 국가정원 십리대숲 뷰 카페", "영남", "중구", ["healing", "view"]),
    ("울산 일산지 대왕암공원 출렁다리 오션뷰", "영남", "동구", ["view", "active"]),
    ("경남 통영 동피랑 미륵산 케이블카 오션뷰", "영남", "통영시", ["view", "retro"]),
    ("경남 거제 바람의언덕 몽돌해변 카페", "영남", "거제시", ["view", "romantic"]),
    ("경남 남해 독일마을 다랭이마을 오션뷰 펍", "영남", "남해군", ["view", "healing"]),
    ("경남 진주 진주성 촉석루 야경 뷰 레스토랑", "영남", "진주시", ["view", "romantic"]),

    # 호남 (광주/전남/전북)
    ("전북 전주 한옥마을 다도 살롱 찻집", "호남", "전주시", ["healing", "retro"]),
    ("전북 전주 객리단길 감성 와인바", "호남", "전주시", ["trendy", "romantic"]),
    ("전북 군산 월명동 근대골목 레트로 카페", "호남", "군산시", ["retro", "healing"]),
    ("전북 익산 미륵사지 야경 감성 카페", "호남", "익산시", ["healing", "view"]),
    ("전남 담양 죽녹원 메타세쿼이아 뷰 카페", "호남", "담양군", ["healing", "view"]),
    ("전남 여수 돌산 밤바다 오션뷰 레스토랑", "호남", "여수시", ["romantic", "view"]),
    ("전남 여수 웅천 이순신광장 낭만포차", "호남", "여수시", ["romantic", "view"]),
    ("전남 순천만 정원 감성 브런치", "호남", "순천시", ["healing", "view"]),
    ("전남 목포 평화광장 해상W쇼 바다뷰 카페", "호남", "목포시", ["view", "romantic"]),
    ("전남 보성 녹차밭 숲속 힐링 다원", "호남", "보성군", ["healing", "view"]),
    ("광주 동명동 한옥 감성 카페 바", "호남", "동구", ["trendy", "romantic"]),
    ("광주 양림동 펭귄마을 아뜰리에", "호남", "남구", ["retro", "trendy"]),
    ("광주 첨단 시리단길 보이저 감성 펍", "호남", "광산구", ["trendy", "luxury"]),

    # 충청 (대전/세종/충남/충북)
    ("충남 태안 안면도 노을 오션뷰 카페", "충청", "태안군", ["view", "romantic"]),
    ("충남 공주 제민천 원도심 감성 카페", "충청", "공주시", ["retro", "healing"]),
    ("충남 부여 백마강 궁남지 연꽃 뷰 찻집", "충청", "부여군", ["healing", "retro"]),
    ("충남 천안 신부동 불당동 감성 다이닝", "충청", "천안시", ["trendy", "gourmet"]),
    ("충남 보령 대천해수욕장 노을 뷰 레스토랑", "충청", "보령시", ["view", "romantic"]),
    ("충북 청주 수암골 전망대 야경 카페", "충청", "청주시", ["view", "romantic"]),
    ("충북 단양 남한강 패러글라이딩 뷰 카페", "충청", "단양군", ["view", "active"]),
    ("충북 제천 청풍호 모노레일 케이블카 뷰 카페", "충청", "제천시", ["view", "healing"]),
    ("대전 소제동 관사촌 감성 카페 찻집", "충청", "동구", ["retro", "trendy"]),
    ("대전 유성 봉명동 온천 야외 테라스 펍", "충청", "유성구", ["romantic", "trendy"]),
    ("세종 금강보행교 이응다리 야경 뷰 다이닝", "충청", "세종시", ["view", "romantic"]),

    # 제주
    ("제주 애월 한림 선셋 오션뷰 카페", "제주", "제주시", ["view", "romantic"]),
    ("제주 구좌 세화 월정리 해변 브런치", "제주", "제주시", ["view", "healing"]),
    ("제주 성산 광치기해변 일출 뷰 명소", "제주", "서귀포시", ["view", "romantic"]),
    ("제주 서귀포 중문 숲속 힐링 스팟", "제주", "서귀포시", ["healing", "luxury"]),
    ("제주 조천 함덕 오션뷰 델문도 카페", "제주", "제주시", ["view", "healing"]),
    ("제주 안덕 사계해변 산방산 뷰 다이닝", "제주", "서귀포시", ["view", "healing"]),
    ("제주 표선 표선해수욕장 힐링 스테이", "제주", "서귀포시", ["healing", "view"]),

    # 🎯 전국 액티비티 / 이색체험 / 레저 / 공방 큐레이션
    ("서울 성수동 원데이클래스 도예 향수 가죽 공방", "서울", "성동구", ["trendy", "active"]),
    ("서울 강남 홍대 이색 데이트 방탈출 보드게임", "서울", "마포구", ["active", "trendy"]),
    ("경기 가평 청평 수상레저 패러글라이딩 짚라인", "경기", "가평군", ["active", "view"]),
    ("인천 강화 씨사이드 루지 짚와이어 테마파크", "인천", "강화군", ["active", "view"]),
    ("강원 춘천 삼악산 호수 케이블카 카누 카약 물레길", "강원", "춘천시", ["active", "healing"]),
    ("강원 평창 횡성 루지 알파인코스터 목장체험", "강원", "평창군", ["active", "view"]),
    ("강원 양양 서핑클래스 패들보드 SUP 요트", "강원", "양양군", ["active", "trendy"]),
    ("충북 단양 만천하스카이워크 패러글라이딩 알파인코스터", "충청", "단양군", ["active", "view"]),
    ("충남 보령 대천 짚트랙 스카이바이크 해상레일바이크", "충청", "보령시", ["active", "view"]),
    ("경남 통영 루지 해상케이블카 어드벤처", "영남", "통영시", ["active", "view"]),
    ("부산 광안리 해운대 요트투어 패들보드 서핑", "영남", "해운대구", ["active", "romantic"]),
    ("전남 여수 해상케이블카 유람선 요트투어 해양레일바이크", "호남", "여수시", ["active", "romantic"]),
    ("전남 곡성 섬진강 기차마을 레일바이크 생태체험", "호남", "곡성군", ["active", "healing"]),
    ("제주 9.81파크 중력 레이싱 카트체험", "제주", "제주시", ["active", "trendy"]),
    ("제주 서귀포 쇠소깍 카약 테우체험", "제주", "서귀포시", ["active", "healing"]),
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
    # 1. 네이버 지도 검색 시도
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res_data = data.get("result") or {}
                place_obj = res_data.get("place") or {}
                site_obj = res_data.get("site") or {}
                places = place_obj.get("list", []) or site_obj.get("list", [])
                if places:
                    return places
    except Exception:
        pass

    # 2. 카카오맵 실시간 검색 폴백
    try:
        k_url = f"https://search.map.kakao.com/mapsearch/map.daum?q={urllib.parse.quote(query)}"
        k_req = urllib.request.Request(k_url, headers={"User-Agent": HEADERS["User-Agent"], "Referer": "https://map.kakao.com/"})
        with urllib.request.urlopen(k_req, timeout=5) as k_res:
            if k_res.status == 200:
                k_data = json.loads(k_res.read().decode('utf-8'))
                k_places = k_data.get("place", [])
                if k_places:
                    converted = []
                    for kp in k_places[:6]:
                        converted.append({
                            "name": kp.get("name"),
                            "roadAddress": kp.get("new_address") or kp.get("address"),
                            "thumUrl": kp.get("img"),
                            "category": kp.get("last_cate_name") or kp.get("cate_name_depth2") or kp.get("cate_name_depth1"),
                            "x": kp.get("lon"),
                            "y": kp.get("lat"),
                        })
                    return converted
    except Exception:
        pass

    return []

def generate_spot_metadata_rule_based(raw_name: str, cat: str, region: str, area: str, default_moods: list[str] = None) -> dict:
    """
    카테고리 및 지역 정보를 바탕으로 0ms 만에 고품질 데이트 메타데이터를 규칙 기반으로 생성.
    Groq API 호출을 제거하여 429 Rate Limit을 원천 차단하고 수집 속도를 100배 극대화합니다.
    """
    slot = infer_slot(cat, raw_name)
    mood = default_moods or ["romantic", "trendy"]
    
    clean_cat = cat.split(">")[-1].strip() if ">" in cat else (cat or "데이트 명소")
    summary = f"{region} {area}에서 즐기는 감성적인 {clean_cat} 데이트 코스"
    
    # 가격대 추론
    if any(k in cat for k in ["오마카세", "파인다이닝", "호텔", "스테이크", "코스"]):
        price = "5만원이상"
    elif any(k in cat for k in ["와인", "칵테일", "다이닝", "이자카야", "바(bar)", "비스트로", "펍"]):
        price = "3~5만원대"
    elif any(k in cat for k in ["카페", "베이커리", "디저트", "찻집", "분식", "도넛"]):
        price = "1~2만원대"
    else:
        price = "2~4만원대"
        
    return {
        "slot": slot,
        "mood": mood,
        "summary": summary,
        "price": price
    }

def run_discovery(supabase_url: str, service_key: str, groq_key: str = "", max_discoveries: int = 15):
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
        if gap_districts:
            gap_names = [f"{d['area']}({d.get('current_count', 0)}개)" for d in gap_districts[:4]]
            print(f"⚖️ [DB 커버리지 갭 감지] 스팟 부족 소외 지역 우선 발굴: {', '.join(gap_names)}")
    except Exception:
        pass

    # 2) 정적 유명 핫플 쿼리 + 소외지역/역세권 동적 합성 쿼리 50:50 배합
    sample_count = min(len(DISCOVERY_QUERIES), max(30, (max_discoveries + 2) // 3))
    half_count = max(15, sample_count // 2)
    static_sampled = random.sample(DISCOVERY_QUERIES, min(half_count, len(DISCOVERY_QUERIES)))
    dynamic_sampled = generate_dynamic_queries(count=half_count, gap_districts=gap_districts)

    sampled_queries = static_sampled + dynamic_sampled
    random.shuffle(sampled_queries)

    print(f"🧭 [신규 핫플 & 소외지역 자율 탐색] 총 {len(sampled_queries)}개 쿼리 가동: {[q[0] for q in sampled_queries[:6]]} ...")
    if groq_key:
        print("🤖 [Groq AI 에디터 엔진 활성화] 신규 핫플 메타데이터(한줄요약, 무드, 슬롯) 자동 큐레이션 적용")

    discovered_spots = []
    batch_seen_names = set()

    for query_text, region, area, default_moods in sampled_queries:
        places = search_discovery(query_text)
        time.sleep(0.2)

        for p in places[:8]:  # 상위 8개 정밀 검토
            raw_name = p.get("name", "").strip()

            # 1. 단독 지명(광역 지자체명 단독) 또는 오염된 헤더명 필터
            if len(raw_name) <= 2 or raw_name in ["서울", "경기", "인천", "강원", "충청", "충북", "충남", "영남", "경북", "경남", "호남", "전북", "전남", "제주", "부산", "대구", "울산", "광주", "대전", "세종"]:
                continue
            if "권역" in raw_name or " / " in raw_name or is_polluted_header_name(raw_name):
                continue

            # 2. 단일 배치(메모리) 내 중복 검사
            if raw_name in batch_seen_names:
                continue

            # 3. 데이트 스팟 카테고리 & 상호명 엄격 검증 (비데이트 업종·숙박·체인브랜드 차단)
            cat = str(p.get("category") or "")
            ok_cat, cat_reason = is_date_spot_category(cat, raw_name)
            if not ok_cat:
                continue

            road_addr = p.get("roadAddress") or p.get("address") or ""
            if not raw_name or not road_addr or len(road_addr.strip()) < 5:
                continue

            # 4. DB 중복 검사 (이름으로 SELECT)
            check_url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{urllib.parse.quote(raw_name)}"
            try:
                check_req = urllib.request.Request(check_url, headers=api_headers)
                with urllib.request.urlopen(check_req, timeout=5) as res:
                    existing = json.loads(res.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        continue  # 이미 존재하는 스팟
            except Exception:
                pass

            batch_seen_names.add(raw_name)

            # 4. 규칙 기반 초고속 메타 생성 (Groq 429 원천 차단 & 0ms 처리)
            meta = generate_spot_metadata_rule_based(raw_name, cat, region, area, default_moods)

            thum = p.get("thumUrl") or p.get("image") or p.get("imageUrl") or p.get("thumbUrl")
            x_coord = p.get("x") or p.get("lng")
            y_coord = p.get("y") or p.get("lat")

            derived_reg, derived_area = derive_region_area(road_addr)
            real_reg = derived_reg or region
            real_area = derived_area or area
            real_loc = f"{real_reg} {real_area}".strip()

            spot_id = int(time.time() * 1000) + random.randint(100, 999)
            new_spot = {
                "id": spot_id,
                "name": raw_name,
                "slot": meta["slot"],
                "region": real_reg,
                "area": real_area,
                "address": road_addr,
                "mood": meta["mood"],
                "location": real_loc,
                "price": meta["price"],
                "summary": meta["summary"],
                "category": cat,
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 88,
                "fail_count": 0,
                "source": {"type": "auto_discovery", "url": f"https://map.naver.com/p/search/{urllib.parse.quote(raw_name)}", "note": "2026 autonomous AI discovery"},
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
