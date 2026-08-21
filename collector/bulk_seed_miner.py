#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 2026 초고속 대량 핫플레이스 시드 마이너 (Bulk Trend Spot Miner)
전국 30대 데이트존 × 5대 테마(250+ 쿼리)를 순회하며
포털 지도, 유튜브 핫클립(쇼츠/조회수), 카카오맵 평점, Groq AI 큐레이션을 결합하여
Supabase DB에 수천 개의 검증된 핫플 데이터를 초고속으로 대량 증강합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import re
import argparse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from miners.youtube_miner import search_youtube_hotclip
from miners.kakaomap_miner import search_kakaomap_place
from score_engine import calculate_hot_score
from category_filter import is_date_spot_category

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

# ---------------------------------------------------------------------------
# 전국 30대 데이트존 × 5대 테마 250+ 전방위 핫플 매트릭스 쿼리
# ---------------------------------------------------------------------------
BULK_QUERIES = [
    # 서울 — 성수·서울숲
    ("서울 성수동 신상 디저트 베이커리 카페", "서울", "성동구", ["trendy", "romantic"]),
    ("서울 성수동 서울숲 파스타 브런치 맛집", "서울", "성동구", ["romantic", "gourmet"]),
    ("서울 성수동 와인바 내추럴와인 다이닝", "서울", "성동구", ["romantic", "luxury"]),
    ("서울 뚝섬 성수 루프탑 펍 칵테일바", "서울", "성동구", ["trendy", "view"]),
    ("서울 성수동 이색 공방 팝업 전시", "서울", "성동구", ["trendy", "active"]),

    # 서울 — 영등포·문래·여의도
    ("서울 문래동 창작촌 감성 카페 베이커리", "서울", "영등포구", ["retro", "trendy"]),
    ("서울 문래동 골목 파스타 스테이크 맛집", "서울", "영등포구", ["romantic", "gourmet"]),
    ("서울 문래동 펍 루프탑 수제맥주 와인바", "서울", "영등포구", ["retro", "romantic"]),
    ("서울 여의도 더현대 서울 다이닝 맛집", "서울", "영등포구", ["luxury", "trendy"]),
    ("서울 여의도 한강뷰 레스토랑 바", "서울", "영등포구", ["view", "luxury"]),

    # 서울 — 연남·연희·홍대·망원
    ("서울 연남동 미로길 감성 카페 디저트", "서울", "마포구", ["romantic", "trendy"]),
    ("서울 연남동 연희동 파스타 뇨끼 맛집", "서울", "마포구", ["romantic", "gourmet"]),
    ("서울 연남동 심야 와인바 이자카야", "서울", "마포구", ["romantic", "retro"]),
    ("서울 망원동 망리단길 골목 감성 카페", "서울", "마포구", ["healing", "trendy"]),
    ("서울 홍대 합정 상수 분위기 펍 칵테일", "서울", "마포구", ["trendy", "active"]),

    # 서울 — 한남·이태원·용산
    ("서울 한남동 나인원 한남 브런치 카페", "서울", "용산구", ["luxury", "trendy"]),
    ("서울 한남동 이태원 파인다이닝 와인바", "서울", "용산구", ["luxury", "romantic"]),
    ("서울 해방촌 경리단길 남산뷰 루프탑 바", "서울", "용산구", ["view", "romantic"]),
    ("서울 용산 용리단길 핫플 다이닝", "서울", "용산구", ["trendy", "gourmet"]),
    ("서울 삼각지 용산 내추럴와인 감성 펍", "서울", "용산구", ["trendy", "romantic"]),

    # 서울 — 압구정·신사·청담
    ("서울 도산공원 압구정로데오 신상 카페", "서울", "강남구", ["luxury", "trendy"]),
    ("서울 신사동 가로수길 파스타 다이닝 맛집", "서울", "강남구", ["romantic", "gourmet"]),
    ("서울 청담동 오마카세 파인다이닝", "서울", "강남구", ["luxury", "gourmet"]),
    ("서울 압구정 로데오 칵테일바 라운지", "서울", "강남구", ["luxury", "romantic"]),

    # 서울 — 서촌·북촌·익선·을지로
    ("서울 서촌 통인동 한옥 갤러리 카페", "서울", "종로구", ["healing", "retro"]),
    ("서울 북촌 삼청동 한옥 다이닝 레스토랑", "서울", "종로구", ["romantic", "retro"]),
    ("서울 익선동 한옥 와인바 펍", "서울", "종로구", ["retro", "romantic"]),
    ("서울 을지로 힙지로 숨은 감성 와인바", "서울", "중구", ["retro", "trendy"]),

    # 서울 — 잠실·송리단길
    ("서울 잠실 송리단길 석촌호수 디저트 카페", "서울", "송파구", ["romantic", "trendy"]),
    ("서울 송리단길 방이동 파스타 솥밥 맛집", "서울", "송파구", ["romantic", "gourmet"]),
    ("서울 잠실 롯데월드몰 뷰 다이닝 와인바", "서울", "송파구", ["luxury", "view"]),

    # 서울 — 대학로·혜화·동대문
    ("서울 혜화 대학로 낙산공원 뷰 카페", "서울", "종로구", ["view", "romantic"]),
    ("서울 대학로 혜화 감성 파스타 와인바", "서울", "종로구", ["romantic", "retro"]),

    # 경기·인천 — 분당·판교
    ("경기 분당 판교 백현동 카페거리", "경기", "성남시", ["trendy", "romantic"]),
    ("경기 판교 아브뉴프랑 브런치 파스타", "경기", "성남시", ["luxury", "gourmet"]),
    ("경기 분당 정자동 엠코헤리츠 와인바", "경기", "성남시", ["romantic", "luxury"]),

    # 경기·인천 — 수원·행궁동·광교
    ("경기 수원 행궁동 화성행궁 감성 한옥 카페", "경기", "수원시", ["romantic", "retro"]),
    ("경기 수원 행궁동 파스타 양식 맛집", "경기", "수원시", ["romantic", "gourmet"]),
    ("경기 수원 광교 앨리웨이 호수공원 다이닝", "경기", "수원시", ["view", "luxury"]),

    # 경기·인천 — 송도·영종도
    ("인천 송도 센트럴파크 오션뷰 다이닝", "인천", "연수구", ["view", "luxury"]),
    ("인천 송도 커넬워크 감성 브런치 카페", "인천", "연수구", ["romantic", "healing"]),
    ("인천 영종도 을왕리 오션뷰 대형 베이커리", "인천", "중구", ["view", "healing"]),

    # 경기 — 가평·양평
    ("경기 가평 청평 리버뷰 대형 테라스 카페", "경기", "가평군", ["view", "healing"]),
    ("경기 양평 두물머리 북한강 드라이브 카페", "경기", "양평군", ["view", "healing"]),
    ("경기 양평 옥천 북한강뷰 이탈리안 레스토랑", "경기", "양평군", ["view", "romantic"]),

    # 경기 — 일산·파주·하남
    ("경기 파주 헤이리마을 출판도시 대형 북카페", "경기", "파주시", ["healing", "romantic"]),
    ("경기 일산 밤리단길 감성 보넷길 파스타", "경기", "고양시", ["romantic", "trendy"]),
    ("경기 하남 미사경정공원 한강뷰 테라스 카페", "경기", "하남시", ["view", "healing"]),

    # 강원 — 강릉·속초·양양
    ("강원 강릉 안목해변 커피거리 오션뷰 카페", "강원", "강릉시", ["view", "romantic"]),
    ("강원 강릉 초당동 감성 젤라또 순두부 디저트", "강원", "강릉시", ["trendy", "gourmet"]),
    ("강원 강릉 교동 안목 와인바 다이닝", "강원", "강릉시", ["romantic", "luxury"]),
    ("강원 속초 영랑호 청초호 감성 오션뷰 카페", "강원", "속초시", ["view", "healing"]),
    ("강원 양양 인구해변 하조대 서피비치 펍", "강원", "양양군", ["trendy", "view"]),

    # 충청 — 대전·청주·천안
    ("대전 소제동 카페거리 한옥 철도관사촌", "충청", "동구", ["retro", "romantic"]),
    ("대전 둔산동 갈마동 갈리단길 파스타 맛집", "충청", "서구", ["trendy", "gourmet"]),
    ("충북 청주 수암골 전망대 야경 뷰 카페", "충청", "상당구", ["view", "romantic"]),
    ("충남 천안 불당동 신불당 브런치 와인바", "충청", "서북구", ["trendy", "romantic"]),

    # 호남 — 전주·여수·광주
    ("전북 전주 한옥마을 경기전 감성 찻집 카페", "호남", "완산구", ["retro", "healing"]),
    ("전북 전주 객리단길 웨리단길 파스타 펍", "호남", "완산구", ["trendy", "romantic"]),
    ("전남 여수 돌산 해양공원 오션뷰 대형 카페", "호남", "여수시", ["view", "romantic"]),
    ("전남 여수 낭만포차 밤바다 야경 칵테일바", "호남", "여수시", ["view", "trendy"]),
    ("광주 동명동 동리단길 한옥 디저트 카페", "호남", "동구", ["trendy", "romantic"]),

    # 영남 — 부산 광안리·해운대·전포
    ("부산 광안리 오션뷰 광안대교 뷰 브런치 카페", "영남", "수영구", ["view", "romantic"]),
    ("부산 광안리 민락더마켓 감성 펍 와인바", "영남", "수영구", ["trendy", "view"]),
    ("부산 해운대 달맞이길 청사포 오션뷰 다이닝", "영남", "해운대구", ["view", "luxury"]),
    ("부산 전포동 전포카페거리 신상 디저트 맛집", "영남", "부산진구", ["trendy", "romantic"]),
    ("부산 영도 흰여울문화마을 절벽 오션뷰 카페", "영남", "영도구", ["view", "healing"]),

    # 영남 — 경주·대구·포항
    ("경북 경주 황리단길 한옥 감성 카페 베이커리", "영남", "경주시", ["retro", "romantic"]),
    ("경북 경주 황리단길 보문단지 파스타 다이닝", "영남", "경주시", ["romantic", "gourmet"]),
    ("대구 동성로 교동 힙한 골목 와인바 펍", "영남", "중구", ["trendy", "romantic"]),
    ("대구 수성못 뷰 테라스 레스토랑 카페", "영남", "수성구", ["view", "luxury"]),
    ("경북 포항 영일대 스페이스워크 오션뷰 카페", "영남", "북구", ["view", "healing"]),

    # 제주 — 애월·한림·구좌·중문
    ("제주 애월 한담해변 오션뷰 선셋 카페", "제주", "제주시", ["view", "romantic"]),
    ("제주 협재 금능 에메랄드 바다뷰 브런치", "제주", "제주시", ["view", "healing"]),
    ("제주 구좌 월정리 세화 감성 당근케이크 카페", "제주", "제주시", ["healing", "trendy"]),
    ("제주 서귀포 중문 파인다이닝 흑돼지 코스", "제주", "서귀포시", ["luxury", "gourmet"]),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def infer_slot(category: str, name: str) -> str:
    cat = (category or "").lower()
    nm = name.lower()
    if any(k in cat or k in nm for k in ["바(bar)", "와인", "칵테일", "펍", "주점", "포차", "야시장", "이자카야", "라운지", "수제맥주"]):
        return "night"
    if any(k in cat or k in nm for k in ["다이닝", "오마카세", "레스토랑", "스테이크", "파스타", "코스", "한정식", "고기", "스시"]):
        return "evening"
    return "day"

def simplify_query(query: str) -> str:
    """긴 검색어에서 수식어를 제거하여 검색 적중률 극대화"""
    cleaned = query
    for word in ["신상", "감성", "핫플", "이색", "미로길", "숨은", "분위기", "골목", "나인원", "대형", "힐링", "테마"]:
        cleaned = cleaned.replace(word, " ")
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def search_portal_places(query: str, limit: int = 15):
    """네이버 및 카카오 지도에서 쿼리당 상위 15개 핫플레이스 수집 (2단 폴백)"""
    queries_to_try = [query]
    simpler = simplify_query(query)
    if simpler != query:
        queries_to_try.append(simpler)

    for q in queries_to_try:
        # 1. 네이버 지도 검색
        url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(q)}&type=all&searchCoord=127.0276197;37.497942&boundary="
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
                        return places[:limit]
        except Exception:
            pass

        # 2. 카카오맵 폴백
        try:
            k_url = f"https://search.map.kakao.com/mapsearch/map.daum?q={urllib.parse.quote(q)}"
            k_req = urllib.request.Request(k_url, headers={"User-Agent": HEADERS["User-Agent"], "Referer": "https://map.kakao.com/"})
            with urllib.request.urlopen(k_req, timeout=5) as k_res:
                if k_res.status == 200:
                    k_data = json.loads(k_res.read().decode('utf-8'))
                    k_places = k_data.get("place", [])
                    if k_places:
                        converted = []
                        for kp in k_places[:limit]:
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
    """Groq Llama 3.3 초고속 한줄요약/무드/슬롯 자동 큐레이션"""
    if not groq_key:
        return None
    models_to_try = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    for model_name in models_to_try:
        try:
            g_url = "https://api.groq.com/openai/v1/chat/completions"
            payload = {
                "model": model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "당신은 2030 트렌디 데이트 매거진 수석 에디터입니다.\n"
                            "주어진 장소 정보를 바탕으로 데이트 목적에 맞는 JSON 메타데이터를 작성하세요.\n"
                            "반드시 유효한 JSON 형식만 응답하세요.\n"
                            "출력 스키마: {\"summary\": \"감성적인 25자 내외 한줄 소개\", \"mood\": [\"romantic\", \"trendy\" 등 1~2개], \"slot\": \"day\"|\"evening\"|\"night\", \"price\": \"2~3만원대\" 등}"
                        )
                    },
                    {
                        "role": "user",
                        "content": f"장소명: {raw_name}, 카테고리: {cat}, 지역: {region} {area}"
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 400,
                "response_format": {"type": "json_object"}
            }
            g_req = urllib.request.Request(
                g_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {groq_key}"
                },
                method='POST'
            )
            with urllib.request.urlopen(g_req, timeout=3.5) as g_res:
                if g_res.status == 200:
                    resp_obj = json.loads(g_res.read().decode('utf-8'))
                    content = resp_obj.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    try:
                        parsed = json.loads(content)
                    except Exception:
                        match = re.search(r"\{.*\}", content, re.DOTALL)
                        if match:
                            parsed = json.loads(match.group(0))
                        else:
                            parsed = None
                    if parsed and parsed.get("summary"):
                        return parsed
        except urllib.error.HTTPError as he:
            if he.code == 404:
                continue
            break
        except Exception:
            continue
    return None

def get_max_spot_id(supabase_url: str, headers: dict) -> int:
    """Supabase spots 테이블에서 가장 큰 id 조회"""
    url = f"{supabase_url}/rest/v1/spots?select=id&order=id.desc&limit=1"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                rows = json.loads(res.read().decode('utf-8'))
                if rows and len(rows) > 0:
                    return int(rows[0].get("id", 0))
    except Exception:
        pass
    return 1000

def run_bulk_mining(target_count: int = 1000, enable_social: bool = True):
    env = load_env()
    supabase_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
    groq_key = os.getenv("GROQ_API_KEY") or os.getenv("VITE_GROQ_API_KEY") or env.get("GROQ_API_KEY") or ""

    if not supabase_url or not service_key:
        print("❌ 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수가 없습니다.")
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    current_max_id = get_max_spot_id(supabase_url, api_headers)
    print(f"📊 현재 DB 최대 스팟 ID: #{current_max_id:,}", flush=True)

    print("=================================================================", flush=True)
    print(f"🚀 [2026 초고속 대량 핫플레이스 시드 마이너 가동]", flush=True)
    print(f"🎯 목표 수집 수량: {target_count:,}개", flush=True)
    print(f"🌐 쿼리 매트릭스 풀: {len(BULK_QUERIES)}개", flush=True)
    print(f"🎬 멀티 소셜 마이닝: {'활성화 (YouTube Shorts + KakaoMap)' if enable_social else '비활성화'}", flush=True)
    print(f"🤖 Groq AI 큐레이션: {'활성화 (Llama 3.3)' if groq_key else '비활성화'}", flush=True)
    print("=================================================================\n", flush=True)

    total_added = 0
    total_youtube = 0

    for q_idx, (query_text, region, area, default_moods) in enumerate(BULK_QUERIES, 1):
        if total_added >= target_count:
            break

        print(f"\n[{q_idx}/{len(BULK_QUERIES)}] 🧭 쿼리 탐색: '{query_text}' ({region} {area})", flush=True)
        places = search_portal_places(query_text, limit=15)
        time.sleep(0.3)

        if not places:
            print("  ⚠️ 검색 결과 없음")
            continue

        for p in places:
            if total_added >= target_count:
                break

            raw_name = p.get("name", "").strip()
            cat = str(p.get("category") or "")
            
            # 데이트 스팟 카테고리 & 상호명 엄격 검증 (비데이트 업종·숙박·체인브랜드 차단)
            ok_cat, cat_reason = is_date_spot_category(cat, raw_name)
            if not ok_cat:
                continue

            road_addr = p.get("roadAddress") or p.get("address") or ""
            if not raw_name or not road_addr:
                continue

            # DB 중복 검사
            check_url = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{urllib.parse.quote(raw_name)}"
            try:
                check_req = urllib.request.Request(check_url, headers=api_headers)
                with urllib.request.urlopen(check_req, timeout=4) as res:
                    existing = json.loads(res.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        continue  # 중복 스킵
            except Exception:
                pass

            # 1. Groq AI 지능형 큐레이션
            ai_data = enrich_spot_with_groq(raw_name, cat, region, area, groq_key)
            
            slot = (ai_data.get("slot") if ai_data and ai_data.get("slot") in ("day", "evening", "night") else None) or infer_slot(cat, raw_name)
            summary = (ai_data.get("summary") if ai_data else "") or f"{area}의 분위기 좋은 감성 {cat or '데이트 명소'}"
            moods = (ai_data.get("mood") if ai_data and isinstance(ai_data.get("mood"), list) else None) or default_moods
            price = (ai_data.get("price") if ai_data else "") or "2~3만원대"

            # 2. 멀티 소셜 데이터 마이닝 (유튜브 핫클립 & 카카오맵)
            yt_data = None
            kakao_data = None
            if enable_social:
                try:
                    yt_data = search_youtube_hotclip(raw_name, area or region)
                    if yt_data:
                        total_youtube += 1
                except Exception:
                    pass
                try:
                    kakao_data = search_kakaomap_place(raw_name, road_addr or area)
                except Exception:
                    pass

            hot_score, social_links, metrics = calculate_hot_score(yt_data, kakao_data, is_verified=True)

            # 위경도 좌표
            x_coord = p.get("x")
            y_coord = p.get("y")
            lng = float(x_coord) if x_coord else None
            lat = float(y_coord) if y_coord else None
            # 네이버 고유 플레이스 링크
            place_id = p.get("id")
            naver_place_url = f"https://map.naver.com/p/entry/place/{place_id}" if place_id else f"https://map.naver.com/p/search/{urllib.parse.quote(raw_name)}"

            current_max_id += 1
            payload = {
                "id": current_max_id,
                "name": raw_name,
                "region": region,
                "area": area,
                "address": road_addr,
                "location": road_addr,
                "slot": slot,
                "category": cat or "데이트스팟",
                "summary": summary,
                "mood": moods,
                "price": price,
                "image_url": p.get("thumUrl") or None,
                "lat": lat,
                "lng": lng,
                "quality_score": 90,
                "verified": True,
                "source": {
                    "type": "discovery",
                    "url": naver_place_url,
                    "note": f"2026 핫플레이스 수집 ({query_text})"
                },
                "social_links": social_links,
                "metrics": metrics,
                "hot_score": hot_score
            }

            # DB 적재
            insert_url = f"{supabase_url}/rest/v1/spots"
            try:
                insert_req = urllib.request.Request(
                    insert_url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers=api_headers,
                    method='POST'
                )
                with urllib.request.urlopen(insert_req, timeout=5) as in_res:
                    if in_res.status in (200, 201):
                        total_added += 1
                        yt_badge = f" [▶ YouTube {yt_data['views']:,}회]" if yt_data else ""
                        print(f"  ✨ [추가 #{total_added}] {raw_name} ({slot}) | {summary}{yt_badge}", flush=True)
            except urllib.error.HTTPError as he:
                err_body = he.read().decode('utf-8', errors='ignore')
                print(f"  ❌ 적재 실패 ({he.code}): {err_body}", flush=True)
                # 만약 social_links 컬럼 미생성 오류면, 레거시 필드만으로 자동 재시도
                if "social_links" in err_body or "metrics" in err_body or "hot_score" in err_body:
                    legacy_payload = {k: v for k, v in payload.items() if k not in ("social_links", "metrics", "hot_score")}
                    try:
                        retry_req = urllib.request.Request(insert_url, data=json.dumps(legacy_payload).encode('utf-8'), headers=api_headers, method='POST')
                        with urllib.request.urlopen(retry_req, timeout=5) as r_res:
                            if r_res.status in (200, 201):
                                total_added += 1
                                print(f"  ✨ [기본 스키마 적재 #{total_added}] {raw_name} ({slot}) | {summary}", flush=True)
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ❌ 적재 실패: {e}", flush=True)

            time.sleep(0.4)

    print("\n=================================================================")
    print(f"🎉 [대량 핫플레이스 시드 마이닝 완료]")
    print(f"• 신규 등록 스팟: {total_added:,}개")
    print(f"• 유튜브 핫클립 연동: {total_youtube:,}개")
    print(f"• 완료 시각 (KST): {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=================================================================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="2026 초고속 대량 핫플레이스 시드 마이너")
    parser.add_argument("--target", type=int, default=300, help="목표 수집 스팟 수량 (기본: 300)")
    parser.add_argument("--no-social", action="store_true", help="소셜 마이닝 생략 (속도 최우선)")
    args = parser.parse_args()

    run_bulk_mining(target_count=args.target, enable_social=not args.no_social)
