#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — Cron VM용 Supabase 상시 검증 및 자동 갱신 워커 (Supabase Live Sync Worker)
Cron에 등록하여 주기적으로 네이버 플레이스를 검증하고 폐업/이전/주소를 Supabase DB에 실시간 동기화합니다.

사용법:
    python collector/supabase_worker.py --limit 100
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import time
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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://map.naver.com/"
}

KNOWN_MAP = {
    'aquafield': '아쿠아필드',
    'termeden': '테르메덴',
    'simmons terrace': '시몬스테라스',
}

def clean_keyword(name: str, location: str = "", address: str = "", region: str = "") -> str:
    clean = re.sub(r'\(.*?\)|\[.*?\]|（.*?）|【.*?】', '', name)
    if ':' in clean:
        parts = clean.split(':')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if ' - ' in clean:
        parts = clean.split(' - ')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if re.search(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean):
        clean = re.split(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean)[0].strip()

    descriptor_regex = r'\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점).*$'
    clean = re.sub(descriptor_regex, '', clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r'[^\w\s가-힣0-9.-]', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    lower = clean.lower()
    for eng, kor in KNOWN_MAP.items():
        if eng in lower:
            clean = re.sub(re.escape(eng), kor, clean, flags=re.IGNORECASE)

    # 지역 결합 (주소나 location에서 시/군/구/동 추출)
    area_hint = ""
    if address:
        m = re.search(r'([가-힣0-9]+(?:로|길|동|읍|면))', address)
        if m:
            area_hint = m.group(1)
    if not area_hint and location:
        m = re.search(r'([가-힣0-9]+(?:시|군|구|동|읍|면))', location)
        if m and m.group(1) not in ('전국', '수도권'):
            area_hint = m.group(1)

    if area_hint and area_hint not in clean:
        return f"{clean} {area_hint}".strip()
    return clean

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def search_naver(query: str):
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res = data.get("result", {})
                places = res.get("place", {}).get("list", []) or res.get("site", {}).get("list", [])
                if places:
                    return places
    except Exception:
        pass

    # 모바일 엔드포인트 폴백
    try:
        m_url = f"https://m.map.naver.com/search2/searchMore.naver?query={urllib.parse.quote(query)}&sm=clk&style=v5&page=1&displayCount=5&type=SITE_1"
        m_req = urllib.request.Request(m_url, headers=HEADERS)
        with urllib.request.urlopen(m_req, timeout=5) as m_res:
            if m_res.status == 200:
                m_data = json.loads(m_res.read().decode('utf-8'))
                m_list = m_data.get("result", {}).get("site", {}).get("list", [])
                if m_list:
                    return [{"name": item.get("name"), "roadAddress": item.get("roadAddress") or item.get("address")} for item in m_list]
    except Exception:
        pass

    return []

def run_worker(supabase_url: str, service_key: str, limit: int = 50):
    if not supabase_url or not service_key:
        print("❌ Supabase 환경변수가 설정되지 않았습니다 (SUPABASE_URL, SUPABASE_SERVICE_KEY).")
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1. 검증 대상 스팟 가져오기 (미검증 또는 오래된 순)
    query_url = f"{supabase_url}/rest/v1/spots?select=id,name,location,region,area,address,verified,is_closed&is_closed=eq.false&order=updated_at.asc&limit={limit}"
    req = urllib.request.Request(query_url, headers=api_headers)

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            spots = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ Supabase 조회 오류: {e}")
        return

    print(f"🔄 Cron VM 워커 시작: {len(spots)}개 스팟 실시간 검증...")

    verified_count = 0
    closed_count = 0
    updated_count = 0

    for spot in spots:
        s_id = spot["id"]
        name = spot["name"]
        loc = spot.get("location", "")
        addr = spot.get("address", "")
        reg = spot.get("region", "")
        keyword = clean_keyword(name, loc, addr, reg)

        places = search_naver(keyword)
        time.sleep(0.1)

        if not places:
            # 주소 힌트로 2차 검색
            if spot.get("address"):
                sub_addr = " ".join(spot["address"].split()[:3])
                places = search_naver(f"{keyword} {sub_addr}")
                time.sleep(0.1)

        patch_data = {}
        if places and len(places) > 0:
            top = places[0]
            road_addr = top.get("roadAddress") or top.get("address")
            patch_data = {
                "verified": True,
                "is_closed": False
            }
            if road_addr and not spot.get("address"):
                patch_data["address"] = road_addr
                updated_count += 1
            verified_count += 1
        else:
            # 단독 검색 실패 시 즉시 폐업 처리하지 않고 미검증 상태로 플래그
            patch_data = {
                "verified": False
            }
            closed_count += 1

        # Supabase UPDATE
        if patch_data:
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            patch_bytes = json.dumps(patch_data).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_bytes, headers=api_headers, method='PATCH')
            try:
                urllib.request.urlopen(patch_req, timeout=5)
            except Exception as e:
                print(f"  ❌ DB 업데이트 실패 (id: {s_id}): {e}")

    print(f"✅ 검증 완료: 정상 확인 {verified_count}건, 주소 보강 {updated_count}건, 재확인 필요 {closed_count}건")

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    parser = argparse.ArgumentParser(description="Supabase Cron Validation Worker")
    parser.add_argument("--url", default=default_url, help="Supabase Project URL")
    parser.add_argument("--key", default=default_key, help="Supabase Service Role Key")
    parser.add_argument("--limit", type=int, default=50, help="Number of spots to check")
    args = parser.parse_args()

    run_worker(args.url, args.key, args.limit)
