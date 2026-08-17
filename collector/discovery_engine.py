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

    # 강원
    ("강원 강릉 경포 안목해변 오션뷰 브런치", "강원", "강릉시", ["view", "romantic"]),
    ("강원 강릉 초당 감성 디저트 카페", "강원", "강릉시", ["trendy", "romantic"]),
    ("강원 춘천 의암호 레이크뷰 카페", "강원", "춘천시", ["view", "healing"]),
    ("강원 속초 영랑호 청초호 감성 카페", "강원", "속초시", ["view", "healing"]),
    ("강원 양양 인구해변 서피비치 펍", "강원", "양양군", ["trendy", "active"]),
    ("강원 평창 대관령 숲속 힐링 스테이", "강원", "평창군", ["healing", "view"]),

    # 영남 (부산/대구/울산/경북/경남)
    ("부산 해운대 달맞이길 오션뷰 다이닝", "영남", "해운대구", ["view", "luxury"]),
    ("부산 광안리 드론쇼 뷰 와인바", "영남", "수영구", ["view", "romantic"]),
    ("부산 전포동 서면 카페거리 핫플", "영남", "부산진구", ["trendy", "romantic"]),
    ("부산 영도 흰여울문화마을 바다뷰 카페", "영남", "영도구", ["view", "retro"]),
    ("부산 기장 오시리아 오션뷰 대형 카페", "영남", "기장군", ["view", "healing"]),
    ("경북 경주 황리단길 한옥 디저트 펍", "영남", "경주시", ["retro", "romantic"]),
    ("경북 포항 영일대 해상 스카이워크 뷰", "영남", "포항시", ["view", "romantic"]),
    ("대구 동성로 교동 LP바 와인바", "영남", "중구", ["retro", "trendy"]),
    ("대구 앞산 카페거리 전망대 레스토랑", "영남", "남구", ["view", "romantic"]),
    ("대구 수성못 야경 드라이브 브런치", "영남", "수성구", ["romantic", "view"]),

    # 호남 (광주/전남/전북)
    ("전북 전주 한옥마을 다도 살롱 찻집", "호남", "전주시", ["healing", "retro"]),
    ("전북 군산 월명동 근대골목 레트로 카페", "호남", "군산시", ["retro", "healing"]),
    ("전남 여수 돌산 밤바다 오션뷰 레스토랑", "호남", "여수시", ["romantic", "view"]),
    ("전남 순천만 정원 감성 브런치", "호남", "순천시", ["healing", "view"]),
    ("광주 동명동 한옥 감성 카페 바", "호남", "동구", ["trendy", "romantic"]),
    ("광주 양림동 펭귄마을 아뜰리에", "호남", "남구", ["retro", "trendy"]),

    # 충청
    ("충남 태안 안면도 노을 오션뷰 카페", "충청", "태안군", ["view", "romantic"]),
    ("충남 공주 제민천 원도심 감성 카페", "충청", "공주시", ["retro", "healing"]),
    ("대전 소제동 관사촌 감성 카페 찻집", "충청", "동구", ["retro", "trendy"]),
    ("대전 유성 봉명동 온천 야외 테라스 펍", "충청", "유성구", ["romantic", "trendy"]),
    ("충북 단양 남한강 패러글라이딩 뷰 카페", "충청", "단양군", ["view", "active"]),

    # 제주
    ("제주 애월 한림 선셋 오션뷰 카페", "제주", "제주시", ["view", "romantic"]),
    ("제주 구좌 세화 월정리 해변 브런치", "제주", "제주시", ["view", "healing"]),
    ("제주 성산 광치기해변 일출 뷰 명소", "제주", "서귀포시", ["view", "romantic"]),
    ("제주 서귀포 중문 숲속 힐링 스팟", "제주", "서귀포시", ["healing", "luxury"]),
    ("제주 조천 함덕 오션뷰 델문도 카페", "제주", "제주시", ["view", "healing"]),
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
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
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

def enrich_spot_with_groq(raw_name: str, cat: str, region: str, area: str, groq_key: str):
    """
    Groq Llama 3.3 70B 무료 API를 호출하여 스팟의 한 줄 요약(summary), 무드(mood), 슬롯(slot), 가격대(price)를 고도화
    키가 없거나 실패 시 규칙 기반 안전 폴백
    """
    if not groq_key:
        return None

    prompt = f"""당신은 2030 데이트 매거진의 전문 에디터입니다. 아래 장소 정보를 바탕으로 데이트 서비스용 메타데이터를 JSON 형태로 생성하세요.
장소명: {raw_name}
업종/카테고리: {cat}
지역: {region} {area}

[출력 JSON 스키마 (반드시 유효한 JSON만 출력)]:
{{
  "summary": "장소의 매력과 분위기를 살린 감성적인 한 줄 설명 (20~35자, 따옴표 없이)",
  "mood": ["romantic", "healing", "scenic", "active", "cost_effective 중 1~2개 선택"],
  "slot": "day, evening, night 중 1개 선택 (카페/전시: day, 식사/다이닝: evening, 바/주점/야경: night)",
  "price": "1~2만원대, 2~4만원대, 3~5만원대, 5만원이상 중 1개"
}}"""

    try:
        req_data = json.dumps({
            "model": "openai/gpt-oss-120b",
            "messages": [
                {"role": "system", "content": "You are an expert dating curator. Output only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "max_tokens": 150,
            "response_format": {"type": "json_object"}
        }).encode('utf-8')

        g_req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {groq_key}"
            }
        )
        with urllib.request.urlopen(g_req, timeout=3.0) as g_res:
            if g_res.status == 200:
                resp_obj = json.loads(g_res.read().decode('utf-8'))
                content = resp_obj.get("choices", [{}])[0].get("message", {}).get("content", "")
                parsed = json.loads(content)
                if parsed and parsed.get("summary"):
                    return parsed
    except Exception as e:
        pass
    return None

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

    # max_discoveries 수량에 맞춰 탐색 쿼리 수를 유연하게 비례 확장 (기본 10개 ~ 전체 풀 순회)
    sample_count = min(len(DISCOVERY_QUERIES), max(10, (max_discoveries + 4) // 4))
    sampled_queries = random.sample(DISCOVERY_QUERIES, sample_count)
    print(f"🧭 [신규 핫플 자율 탐색] 선택된 쿼리 ({len(sampled_queries)}개): {[q[0] for q in sampled_queries[:5]]} ...")
    if groq_key:
        print("🤖 [Groq AI 에디터 엔진 활성화] 신규 핫플 메타데이터(한줄요약, 무드, 슬롯) 자동 큐레이션 적용")

    discovered_spots = []

    for query_text, region, area, default_moods in sampled_queries:
        places = search_discovery(query_text)
        time.sleep(0.2)

        for p in places[:8]:  # 상위 8개 정밀 검토
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

            # Groq AI 에디터 지능형 정제 시도
            ai_enriched = enrich_spot_with_groq(raw_name, cat, region, area, groq_key)

            slot = (ai_enriched.get("slot") if ai_enriched and ai_enriched.get("slot") in ("day", "evening", "night") else None) or infer_slot(cat, raw_name)
            mood = (ai_enriched.get("mood") if ai_enriched and isinstance(ai_enriched.get("mood"), list) else None) or default_moods
            summary = (ai_enriched.get("summary") if ai_enriched else None) or f"{region} {area}의 2026 감성 {cat or '데이트 핫플레이스'}"
            price = (ai_enriched.get("price") if ai_enriched else None) or "2~4만원대"

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
                "mood": mood,
                "location": f"{region} {area}",
                "price": price,
                "summary": summary,
                "category": cat,
                "image_url": thum,
                "lat": float(y_coord) if y_coord else None,
                "lng": float(x_coord) if x_coord else None,
                "quality_score": 90 if ai_enriched else 85,
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
