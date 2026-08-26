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

# 캐치테이블 / 블루리본 큐레이션 마이닝 쿼리 풀 (전국 8개 권역 × 미식 테마 60개+)
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
    ("캐치테이블 문래동 창작촌 힙플레이스 와인 다이닝", "서울", "영등포구", ["retro", "trendy"], "night", "₩₩"),
    ("블루리본 서래마을 방배동 프렌치 비스트로", "서울", "서초구", ["luxury", "romantic"], "evening", "₩₩₩"),
    ("캐치테이블 도산공원 신사동 스시 오마카세", "서울", "강남구", ["luxury", "gourmet"], "evening", "₩₩₩₩"),
    ("블루리본 삼청동 인사동 전통 한정식 코스", "서울", "종로구", ["healing", "gourmet"], "evening", "₩₩₩"),

    # 경기 / 인천
    ("캐치테이블 수원 행궁동 감성 와인바 비스트로", "경기", "수원시", ["romantic", "trendy"], "night", "₩₩"),
    ("블루리본 판교 백현동 카페거리 브런치 다이닝", "경기", "성남시", ["luxury", "gourmet"], "day", "₩₩"),
    ("캐치테이블 일산 밤리단길 감성 코스 다이닝", "경기", "고양시", ["romantic", "gourmet"], "evening", "₩₩"),
    ("블루리본 송도 센트럴파크 오션뷰 이탈리안 다이닝", "인천", "연수구", ["view", "luxury"], "evening", "₩₩₩"),
    ("캐치테이블 광교 호수공원 앨리웨이 뷰 와인바", "경기", "수원시", ["view", "romantic"], "night", "₩₩₩"),
    ("블루리본 동탄 호수공원 이탈리안 레스토랑", "경기", "화성시", ["view", "healing"], "evening", "₩₩"),
    ("캐치테이블 가평 청평 북한강 뷰 테라스 레스토랑", "경기", "가평군", ["view", "romantic"], "evening", "₩₩₩"),
    ("블루리본 남양주 팔당 북한강 리버뷰 다이닝", "경기", "남양주시", ["view", "healing"], "evening", "₩₩₩"),
    ("캐치테이블 영종도 인스파이어 파인다이닝 예약", "인천", "중구", ["luxury", "gourmet"], "evening", "₩₩₩₩"),

    # 영남 (부산/대구/울산/경북/경남)
    ("캐치테이블 해운대 광안리 오션뷰 와인바 다이닝", "부산", "해운대구", ["view", "romantic"], "night", "₩₩₩"),
    ("블루리본 부산 서면 전포 카페거리 비스트로", "부산", "부산진구", ["trendy", "gourmet"], "evening", "₩₩"),
    ("캐치테이블 대구 동성로 교동 분위기 좋은 와인바", "대구", "중구", ["retro", "romantic"], "night", "₩₩"),
    ("블루리본 경주 황리단길 한옥 다이닝 예약", "경북", "경주시", ["romantic", "retro"], "evening", "₩₩"),
    ("캐치테이블 부산 영도 흰여울 바다뷰 다이닝", "부산", "영도구", ["view", "romantic"], "evening", "₩₩"),
    ("블루리본 부산 기장 오시리아 해산물 파인다이닝", "부산", "기장군", ["view", "luxury"], "evening", "₩₩₩"),
    ("캐치테이블 울산 삼산동 달동 감성 다이닝 바", "울산", "남구", ["trendy", "romantic"], "night", "₩₩"),
    ("블루리본 포항 영일대 해상 뷰 레스토랑", "경북", "포항시", ["view", "romantic"], "evening", "₩₩"),
    ("캐치테이블 거제도 통영 오션뷰 씨푸드 다이닝", "경남", "거제시", ["view", "gourmet"], "evening", "₩₩₩"),

    # 호남 (광주/전남/전북)
    ("캐치테이블 전주 한옥마을 객리단길 감성 와인바", "호남", "전주시", ["retro", "romantic"], "night", "₩₩"),
    ("블루리본 여수 돌산 밤바다 오션뷰 레스토랑", "호남", "여수시", ["romantic", "view"], "evening", "₩₩₩"),
    ("캐치테이블 광주 동명동 양림동 이탈리안 비스트로", "호남", "동구", ["trendy", "gourmet"], "evening", "₩₩"),
    ("블루리본 순천만 정원 근처 로컬 다이닝", "호남", "순천시", ["healing", "gourmet"], "evening", "₩₩"),
    ("캐치테이블 군산 월명동 근대골목 레트로 다이닝", "호남", "군산시", ["retro", "gourmet"], "evening", "₩₩"),
    ("블루리본 목포 평화광장 해상 뷰 다이닝 바", "호남", "목포시", ["view", "romantic"], "night", "₩₩"),

    # 충청 (대전/세종/충남/충북)
    ("캐치테이블 대전 소제동 봉명동 테라스 와인바", "충청", "유성구", ["romantic", "trendy"], "night", "₩₩"),
    ("블루리본 천안 불당동 신부동 파인다이닝", "충청", "천안시", ["luxury", "gourmet"], "evening", "₩₩₩"),
    ("캐치테이블 청주 성안길 수암골 야경 레스토랑", "충청", "청주시", ["view", "romantic"], "evening", "₩₩"),
    ("블루리본 공주 제민천 한옥 다이닝 코스", "충청", "공주시", ["healing", "retro"], "evening", "₩₩"),
    ("캐치테이블 세종 나성동 금강보행교 뷰 와인바", "충청", "세종시", ["view", "romantic"], "night", "₩₩"),
    ("블루리본 충북 단양 제천 청풍호 레이크뷰 다이닝", "충청", "제천시", ["view", "healing"], "evening", "₩₩"),

    # 강원 & 제주
    ("캐치테이블 강릉 안목해변 오션뷰 비스트로 와인", "강원", "강릉시", ["view", "romantic"], "evening", "₩₩"),
    ("블루리본 속초 영랑호 청초호 뷰 다이닝", "강원", "속초시", ["view", "gourmet"], "evening", "₩₩"),
    ("캐치테이블 춘천 의암호 레이크뷰 스테이크하우스", "강원", "춘천시", ["view", "romantic"], "evening", "₩₩₩"),
    ("블루리본 평창 대관령 한우 파인다이닝 오마카세", "강원", "평창군", ["luxury", "gourmet"], "evening", "₩₩₩₩"),
    ("캐치테이블 양양 죽도 인구해변 서퍼 펍 바", "강원", "양양군", ["trendy", "romantic"], "night", "₩₩"),
    ("블루리본 제주 애월 한림 노을 뷰 다이닝 바", "제주", "제주시", ["view", "romantic"], "evening", "₩₩₩"),
    ("캐치테이블 서귀포 중문 흑돼지 파인다이닝", "제주", "서귀포시", ["gourmet", "luxury"], "evening", "₩₩₩"),
    ("블루리본 제주 구좌 성산 오션뷰 해산물 코스", "제주", "서귀포시", ["view", "luxury"], "evening", "₩₩₩"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

try:
    from groq_helper import extract_spots_from_unstructured_text
except ImportError:
    extract_spots_from_unstructured_text = None

def extract_gourmet_candidates_from_web(query_text: str) -> list[str]:
    """네이버 웹 검색 및 블로그에서 캐치테이블/블루리본 스팟명 후보 마이닝"""
    encoded_query = urllib.parse.quote(query_text)
    url = f"https://search.naver.com/search.naver?where=view&query={encoded_query}"

    req = urllib.request.Request(url, headers=HEADERS)
    candidates = []
    text_corpus = ""
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            if res.status == 200:
                html = res.read().decode('utf-8', errors='replace')
                text_corpus = re.sub(r'<[^>]+>', ' ', html)

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
                        if 2 <= len(clean_w) <= 10 and not any(stop in clean_w for stop in ["데이트", "코스", "맛집", "예약", "와인바", "다이닝", "추천", "블루리본"]):
                            candidates.append(clean_w)
    except Exception as e:
        print(f"  ⚠️ 캐치테이블 마이닝 검색 오류 ({query_text}): {e}")

    # Groq AI가 사용 가능할 경우 비정형 텍스트에서 추가 장소명 추출
    if extract_spots_from_unstructured_text and text_corpus and len(candidates) < 3:
        try:
            ai_candidates = extract_spots_from_unstructured_text(text_corpus[:3000], query_text)
            for ac in ai_candidates:
                if isinstance(ac, str) and 2 <= len(ac) <= 15:
                    candidates.append(ac.strip())
        except Exception:
            pass

    # 중복 제거
    unique_candidates = []
    seen = set()
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique_candidates.append(c)

    return unique_candidates[:15]

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

    # 매 사이클마다 6개 쿼리를 랜덤 샘플링하여 발굴
    for query_text, default_region, default_area, moods, slot, price_tier in queries[:6]:
        candidates = extract_gourmet_candidates_from_web(query_text)
        time.sleep(0.3)

        # 웹 후보가 적을 경우, 수식어를 정제한 직접 검색어로 search_naver 폴백
        clean_q = re.sub(r'캐치테이블|블루리본|서베이|2026|인기|예약', '', query_text).strip()
        direct_results = search_naver(f"{default_area} {clean_q}" if default_area else clean_q)
        time.sleep(0.3)

        targets = []
        # 1. 웹 마이닝 후보
        for cand in candidates:
            targets.append((f"{default_area} {cand}" if default_area else f"{default_region} {cand}", cand))
        # 2. 직접 검색 상위 결과
        if direct_results and isinstance(direct_results, list):
            for dr in direct_results[:3]:
                d_name = dr.get("name", "").strip()
                if d_name:
                    targets.append((d_name, d_name))

        for search_q, cand_name in targets:
            search_res = search_naver(search_q)
            time.sleep(0.2)

            if not search_res or not isinstance(search_res, list) or len(search_res) == 0:
                continue

            top = search_res[0]

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
                "price": f"1인 {price_tier} 코스/단품",
                "summary": f"{real_name} — 캐치테이블 인기 예약 {'블루리본 인증 ' if is_blueribbon else ''}데이트 명소 ({area})",
                "category": category or "와인바/다이닝",
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 95 if is_blueribbon else 90,
                "fail_count": 0,
                "source": {
                    "type": "catchtable_miner",
                    "url": catchtable_url,
                    "platform": "catchtable",
                    "price_tier": price_tier,
                    "is_blueribbon": is_blueribbon,
                    "booking_tips": "주말 및 기념일 사전 예약 권장",
                    "note": f"Mined from query: {query_text}"
                },
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
