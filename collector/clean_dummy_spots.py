#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 광역 지역 묶음 더미 스팟 자동 비활성화(소프트 삭제) 스크립트 (clean_dummy_spots.py)
=============================================================================
초기 프로토타입 시절 등록된 '서촌 / 북촌 / 삼청 / 안국 / 익선', '대전 / 충청', '광주 / 전라' 등
단일 실존 매장이 아닌 광역 묶음/지자체명 더미 데이터를 Supabase DB에서 전수 감지하여
is_closed = true로 비활성화 처리합니다.
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def _load_env_credentials():
    search_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    ]
    for env_path in search_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VITE_SUPABASE_URL=") or line.startswith("SUPABASE_URL="):
                            os.environ["SUPABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("SUPABASE_SERVICE_KEY=") or line.startswith("SUPABASE_KEY=") or line.startswith("VITE_SUPABASE_ANON_KEY="):
                            os.environ["SUPABASE_SERVICE_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass

def is_broad_region_dummy(name: str) -> bool:
    """단일 매장이 아닌 광역 지역 묶음 더미 데이터인지 판별"""
    if not name:
        return True
    n = name.strip()

    # 1. 슬래시(/)가 2개 이상 들어간 다중 지역 나열 (예: 서촌 / 북촌 / 삼청 / 안국 / 익선)
    if n.count("/") >= 2:
        return True

    # 2. 광역 권역 묶음 라벨
    broad_patterns = [
        r"^(서울|경기|인천|강원|충청|호남|영남|제주|대전|광주|대구|부산|울산)\s*[\/&]\s*(충청|전라|경상|울산|경남|경북|전남|전북|강원)",
        r".*&.*&.*권$",
        r"^(충북|충남|전북|전남|경북|경남|강원도?)\s+[가-힣]+(시|군|구)$",  # 예: '충북 단양군', '충남 공주시', '강원 삼척시'
    ]
    for pat in broad_patterns:
        if re.search(pat, n):
            return True

    # 3. 명확한 광역 더미 키워드 일치
    exact_dummies = [
        "서촌 / 북촌 / 삼청 / 안국 / 익선",
        "대전 / 충청",
        "광주 / 전라",
        "부산 & 울산 & 경남권",
        "대구 & 경북권",
        "광주 & 전라권",
        "대전 & 충청권",
        "수도권 & 서울근교",
    ]
    if any(n == d or n.startswith(d) for d in exact_dummies):
        return True

    return False

def clean_dummy_spots():
    """전체 DB를 페이지네이션으로 전수 스캔하여 더미 스팟 비활성화"""
    _load_env_credentials()
    supabase_url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

    if not supabase_url or not service_key:
        print("⚠️ Supabase 접속 정보가 없습니다.")
        return

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🔍 Supabase 전체 spots 테이블 전수 페이지네이션 스캔 시작...")
    page_size = 1000
    offset = 0
    all_spots = []

    # 1000개씩 전체 테이블 페이지네이션 조회
    while True:
        url = f"{supabase_url}/rest/v1/spots?select=id,name,category,region,area,is_closed&is_closed=eq.false&order=id.asc&offset={offset}&limit={page_size}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as res:
                batch = json.loads(res.read().decode('utf-8'))
                if not batch:
                    break
                all_spots.extend(batch)
                print(f"  📥 {len(all_spots)}개 스팟 로드 완료...")
                if len(batch) < page_size:
                    break
                offset += page_size
        except Exception as e:
            print(f"❌ DB 조회 중 오류: {e}")
            break

    print(f"\n📊 총 {len(all_spots)}개 활성 스팟 조회 완료. 광역 더미 스팟 검출 중...")

    dummy_spots = [s for s in all_spots if is_broad_region_dummy(s.get("name", ""))]
    print(f"🚨 총 {len(dummy_spots)}개의 광역 더미 스팟 발견!\n")

    if not dummy_spots:
        print("🎉 더미 스팟이 없습니다. DB가 매우 깨끗합니다!")
        return

    for s in dummy_spots:
        s_id = s.get("id")
        name = s.get("name", "")
        print(f"  [ID {s_id}] '{name}' -> is_closed=true 처리 중...", end=" ")

        patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
        payload = json.dumps({"is_closed": True}).encode('utf-8')
        try:
            p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
            with urllib.request.urlopen(p_req, timeout=5) as p_res:
                if p_res.status in (200, 204):
                    print("✅ 완료")
                else:
                    print(f"⚠️ 실패 ({p_res.status})")
        except Exception as ex:
            print(f"❌ 오류 ({ex})")
        time.sleep(0.1)

    print(f"\n🎉 [정리 완료] 총 {len(dummy_spots)}개 광역 더미 스팟 비활성화 완료!")

if __name__ == "__main__":
    clean_dummy_spots()
