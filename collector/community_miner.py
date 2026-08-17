#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 커뮤니티 트렌드 리스트 마이닝 엔진 (Community Trend Miner)
블라인드, 더쿠, 인벤, 클리앙, 에타 등 주요 커뮤니티의 데이트/맛집 추천 리스트에서 검증된 스팟을 마이닝합니다.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import time
import random
import re
from supabase_worker import load_env, search_naver
from discovery_engine import infer_slot

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 커뮤니티(블라인드/더쿠/인벤/에타/클리앙/네이버카페) 인기 큐레이션 검색 쿼리 40개+
COMMUNITY_SEARCH_QUERIES = [
    # 서울/수도권
    ("성수동 한남동 데이트 맛집 리스트 더쿠 인벤 블라인드", "서울", "성동구", ["trendy", "romantic"]),
    ("서울숲 성수 디저트 카페 빵지순례 리스트 더쿠", "서울", "성동구", ["trendy", "healing"]),
    ("을지로 종로 와인바 술집 추천 클리앙", "서울", "중구", ["retro", "romantic"]),
    ("연남동 망원동 분위기 좋은 파스타 추천", "서울", "마포구", ["romantic", "gourmet"]),
    ("용산 삼각지 용리단길 찐맛집 정리 블라인드", "서울", "용산구", ["trendy", "gourmet"]),
    ("신사 도산공원 소개팅 장소 추천 리스트", "서울", "강남구", ["luxury", "romantic"]),
    ("서촌 북촌 삼청동 조용한 찻집 카페 추천 더쿠", "서울", "종로구", ["healing", "retro"]),
    ("잠실 송리단길 분위기 좋은 맛집 카페 리스트", "서울", "송파구", ["romantic", "view"]),
    ("문래동 창작촌 골목 맛집 술집 추천 클리앙", "서울", "영등포구", ["retro", "trendy"]),
    ("샤로수길 관악 데이트 코스 밥집 추천 에타", "서울", "관악구", ["trendy", "romantic"]),
    ("수원 행궁동 일산 밤리단길 감성 카페 모음", "경기", "수원시", ["romantic", "retro"]),
    ("광교 앨리웨이 동탄 호수공원 뷰 맛집 추천 뽐뿌", "경기", "수원시", ["view", "romantic"]),
    ("분당 정자동 판교 백현동 카페거리 브런치 추천", "경기", "성남시", ["trendy", "romantic"]),
    ("인천 송도 영종도 드라이브 데이트 코스", "인천", "연수구", ["view", "healing"]),
    ("파주 헤이리 가평 드라이브 카페 추천 클리앙", "경기", "파주시", ["healing", "view"]),
    ("김포 라베니체 하남 미사 분위기 맛집 모음", "경기", "김포시", ["view", "romantic"]),

    # 지방 광역
    ("부산 해운대 광안리 현지인 찐맛집 추천", "영남", "해운대구", ["view", "gourmet"]),
    ("부산 전포동 카페거리 서면 맛집 리스트 더쿠", "영남", "부산진구", ["trendy", "romantic"]),
    ("부산 영도 흰여울마을 기장 오션뷰 카페 모음", "영남", "영도구", ["view", "healing"]),
    ("경주 황리단길 전주 한옥마을 감성 코스 모음", "영남", "경주시", ["retro", "healing"]),
    ("대구 동성로 교동 LP바 앞산 카페거리 리스트", "영남", "중구", ["retro", "romantic"]),
    ("포항 영일대 울산 삼산 감성 맛집 추천 인벤", "영남", "포항시", ["view", "trendy"]),
    ("강릉 속초 오션뷰 카페 리스트 더쿠 블라인드", "강원", "강릉시", ["view", "romantic"]),
    ("양양 춘천 드라이브 핫플레이스 추천 클리앙", "강원", "양양군", ["trendy", "view"]),
    ("전주 객리단길 여수 밤바다 뷰 맛집 리스트", "호남", "전주시", ["romantic", "view"]),
    ("광주 동명동 양림동 감성 카페 밥집 추천", "호남", "동구", ["trendy", "retro"]),
    ("대전 소제동 유성 봉명동 데이트 핫플 리스트", "충청", "동구", ["retro", "trendy"]),
    ("제주도 애월 서귀포 숨은 데이트 맛집 더쿠", "제주", "제주시", ["view", "healing"]),
    ("제주 구좌 성산 노을 뷰 감성 카페 리스트", "제주", "제주시", ["view", "romantic"]),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def extract_list_items(html_text: str):
    """커뮤니티 글 본문에서 '1. 상호명', '- 상호명:', '① 상호명' 등의 목록형 장소명 추출"""
    candidates = set()

    # 패턴 1: 숫자/기호 리스트 (1. 성수다락, 2. 난포, ① 쵸이닷 등)
    numbered = re.findall(r'(?:[0-9]{1,2}\.|\([0-9]{1,2}\)|[①-⑩]|\-|\*)\s*([가-힣a-zA-Z0-9\s]{2,12})(?:\s*[-:—–~]|\s*<|\s*\n)', html_text)
    for item in numbered:
        clean = item.strip()
        if len(clean) >= 2 and not any(w in clean for w in ["추천", "맛집", "카페", "위치", "가격", "메뉴", "분위기", "주차", "예약", "후기", "데이트", "코스", "서울", "경기", "부산"]):
            candidates.add(clean)

    # 패턴 2: 해시태그 (#성수다락, #난포)
    hashtags = re.findall(r'#([가-힣a-zA-Z0-9]{2,10})', html_text)
    for tag in hashtags:
        if not any(w in tag for w in ["맛집", "카페", "데이트", "먹스타그램", "핫플", "추천", "일상", "여행", "주말"]):
            candidates.add(tag)

    return list(candidates)

def fetch_community_candidates(query: str):
    url = f"https://search.naver.com/search.naver?where=article&sm=tab_jum&query={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers=HEADERS)
    candidates = set()
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                html = res.read().decode('utf-8', errors='ignore')
                items = extract_list_items(html)
                for it in items:
                    candidates.add(it)
    except Exception:
        pass
    return list(candidates)

def run_community_mining(supabase_url: str, service_key: str, max_discoveries: int = 15):
    if not supabase_url or not service_key:
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    sampled = random.sample(COMMUNITY_SEARCH_QUERIES, min(2, len(COMMUNITY_SEARCH_QUERIES)))
    print(f"💬 [커뮤니티 트렌드 마이닝 시작] 타깃 쿼리: {[q[0] for q in sampled]}")

    discovered = []

    for query_text, region, area, moods in sampled:
        encoded = urllib.parse.quote(query_text)
        html_content = ""
        try:
            url = f"https://search.daum.net/search?w=web&q={encoded}&sort=recency"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=5) as res:
                html_content = res.read().decode('utf-8', errors='replace')
        except Exception:
            pass

        if not html_content:
            continue

        raw_candidates = extract_list_items(html_content)
        time.sleep(0.3)

        for cand_name in raw_candidates[:6]:
            search_query = f"{cand_name} {area}"
            places = search_naver(search_query)
            time.sleep(0.2)

            if not places:
                places = search_naver(cand_name)
                time.sleep(0.2)

            if not places or len(places) == 0:
                continue

            top = places[0]
            real_name = top.get("name", "").strip()
            cat = str(top.get("category") or "")
            road_addr = top.get("roadAddress") or top.get("address") or ""

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
                "summary": f"커뮤니티 추천 {region} {area}의 찐 로컬 {cat or '데이트 명소'}",
                "category": cat,
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 90,
                "fail_count": 0,
                "source": {
                    "type": "community_miner",
                    "url": f"https://map.naver.com/p/search/{urllib.parse.quote(real_name)}",
                    "note": f"Mined from community query: {query_text}"
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
                    print(f"🔥 [커뮤니티 마이닝 INSERT 성공] 총 {len(discovered)}곳 발굴 및 DB 적재 완료:")
                    for s in discovered:
                        print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']})")
        except Exception as e:
            print(f"❌ 커뮤니티 마이닝 INSERT 실패: {e}")
    else:
        print("💡 [커뮤니티 마이닝] 신규 발굴 없음 (DB 최신 상태)")

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")

    run_community_mining(default_url, default_key)
