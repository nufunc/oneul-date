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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://map.naver.com/"
}

def clean_keyword(name: str, location: str = "") -> str:
    clean = re.sub(r'\(.*?\)|\[.*?\]', '', name)
    clean = re.sub(r':.*$', '', clean)
    clean = re.sub(r' - .*$', '', clean)
    clean = re.sub(r'\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점).*$', '', clean, flags=re.IGNORECASE)
    clean = clean.strip()
    return clean

def search_naver(query: str):
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res = data.get("result", {})
                places = res.get("place", {}).get("list", []) or res.get("site", {}).get("list", [])
                return places
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
        keyword = clean_keyword(name, loc)

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
            # 검색 0건: 폐업 의심 플래그
            patch_data = {
                "is_closed": True
            }
            closed_count += 1
            print(f"  ⚠️ [폐업 의심 감지 -> DB 격리] id: {s_id}, name: {name}")

        # Supabase UPDATE
        if patch_data:
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            patch_bytes = json.dumps(patch_data).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_bytes, headers=api_headers, method='PATCH')
            try:
                urllib.request.urlopen(patch_req, timeout=5)
            except Exception as e:
                print(f"  ❌ DB 업데이트 실패 (id: {s_id}): {e}")

    print(f"✅ 검증 완료: 정상 {verified_count}건, 주소보강 {updated_count}건, 폐업/격리 {closed_count}건")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Supabase Cron Validation Worker")
    parser.add_argument("--url", default=os.getenv("SUPABASE_URL"), help="Supabase Project URL")
    parser.add_argument("--key", default=os.getenv("SUPABASE_SERVICE_KEY"), help="Supabase Service Role Key")
    parser.add_argument("--limit", type=int, default=50, help="Number of spots to check")
    args = parser.parse_args()

    run_worker(args.url, args.key, args.limit)
