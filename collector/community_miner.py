#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 커뮤니티 트렌드 리스트 마이닝 엔진 (Community Trend Miner)
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

# 커뮤니티 인기 큐레이션 검색 쿼리
COMMUNITY_SEARCH_QUERIES = [
    # 서울/수도권
    ("성수동 한남동 데이트 맛집 리스트 더쿠 인벤 블라인드", "서울", "성동구", ["trendy", "romantic"]),
    ("을지로 종로 와인바 술집 추천 클리앙", "서울", "중구", ["retro", "romantic"]),
    ("연남동 망원동 분위기 좋은 파스타 추천", "서울", "마포구", ["romantic", "gourmet"]),
    ("수원 행궁동 일산 밤리단길 감성 카페 모음", "경기", "수원시", ["romantic", "retro"]),
    ("인천 송도 영종도 드라이브 데이트 코스", "인천", "연수구", ["view", "healing"]),
    # 지방 광역
    ("부산 해운대 광안리 현지인 찐맛집 추천", "영남", "해운대구", ["view", "gourmet"]),
    ("경주 황리단길 전주 한옥마을 감성 코스 모음", "영남", "경주시", ["retro", "healing"]),
    ("강릉 속초 오션뷰 카페 리스트", "강원", "강릉시", ["view", "romantic"]),
    ("제주도 애월 서귀포 숨은 데이트 맛집", "제주", "제주시", ["view", "healing"]),
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

def run_community_mining(supabase_url: str, service_key: str, max_discoveries: int = 5):
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
