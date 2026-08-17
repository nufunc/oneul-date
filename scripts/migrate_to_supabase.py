#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — Supabase 통합 마이그레이션 & 진단 도구
사용법:
    python scripts/migrate_to_supabase.py
    또는 python scripts/migrate_to_supabase.py --url <URL> --key <KEY>
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")
SPOTS_JSON_PATH = os.path.join(BASE_DIR, "src", "data", "spots.json")
SPOTS_SAMPLE_PATH = os.path.join(BASE_DIR, "src", "data", "spots.sample.json")

def load_env():
    env = {}
    candidates = [
        ENV_PATH,
        os.path.join(os.getcwd(), ".env"),
        os.path.join(BASE_DIR, "collector", ".env")
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env[k.strip()] = v.strip().strip('"').strip("'")
                break
            except Exception:
                pass
    return env

def migrate_data(supabase_url: str = None, service_key: str = None, batch_size: int = 100):
    env = load_env()
    supabase_url = supabase_url or os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    service_key = service_key or os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    if not supabase_url or not service_key:
        print("❌ 오류: Supabase URL과 Service Role Key가 필요합니다.")
        print("   .env 파일에 키를 입력하거나 명령행 인자로 전달해주세요.")
        print("   사용법: python scripts/migrate_to_supabase.py --url <URL> --key <KEY>")
        sys.exit(1)

    supabase_url = supabase_url.rstrip("/")
    endpoint = f"{supabase_url}/rest/v1/spots"

    # 파일 로드 (spots.json 우선, 없으면 spots.sample.json)
    data_path = SPOTS_JSON_PATH if os.path.exists(SPOTS_JSON_PATH) else SPOTS_SAMPLE_PATH
    print(f"📦 데이터 파일 로드: {data_path}")
    with open(data_path, "r", encoding="utf-8") as f:
        spots = json.load(f)

    total = len(spots)
    print(f"총 {total}개 스팟 발견. Supabase DB 연결 검증 중...")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"  # Upsert
    }

    # 1. 테이블 상태 확인
    test_req = urllib.request.Request(f"{endpoint}?select=count", headers={**headers, "Prefer": "count=exact"})
    try:
        with urllib.request.urlopen(test_req, timeout=10) as r:
            cr = r.headers.get("Content-Range", "0-0/0")
            print(f"✅ Supabase 연결 성공! 현재 DB 레코드 수: {cr}")
    except urllib.error.HTTPError as e:
        err_b = e.read().decode('utf-8', errors='replace')
        print(f"⚠️ 테이블 확인 오류 ({e.code}): {err_b}")
        if "relation \"public.spots\" does not exist" in err_b:
            print("💡 Supabase SQL Editor에서 supabase/schema.sql을 먼저 실행해주세요!")
            sys.exit(1)

    # 2. 일괄 업로드
    print(f"🚀 일괄 동기화(Upsert) 시작 (배치 크기: {batch_size})...")
    success_count = 0
    start_time = time.time()

    for i in range(0, total, batch_size):
        batch = spots[i:i + batch_size]
        payload = []

        for spot in batch:
            item = {
                "id": spot.get("id"),
                "name": spot.get("name"),
                "slot": spot.get("slot"),
                "region": spot.get("region"),
                "area": spot.get("area"),
                "address": spot.get("address"),
                "mood": spot.get("mood", []),
                "location": spot.get("location"),
                "price": spot.get("price"),
                "summary": spot.get("summary"),
                "category": spot.get("category"),
                "image_url": spot.get("image_url"),
                "lat": spot.get("lat"),
                "lng": spot.get("lng"),
                "quality_score": spot.get("quality_score", 50),
                "fail_count": 0,
                "source": spot.get("source", {}),
                "verified": spot.get("verified", False),
                "is_closed": False
            }
            payload.append(item)

        data_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(endpoint, data=data_bytes, headers=headers, method='POST')

        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status in (200, 201):
                    success_count += len(batch)
                    pct = success_count * 100 // total
                    print(f"  ✓ [{success_count}/{total}] ({pct}%) 업로드 완료")
        except Exception as e:
            print(f"  ❌ 배치 오류 ({i//batch_size + 1}): {e}")
            break

        time.sleep(0.05)

    elapsed = time.time() - start_time
    print(f"\n🎉 마이그레이션 완료: 총 {success_count}/{total}건 업로드 성공! (소요 시간: {elapsed:.2f}초)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate spots data to Supabase PostgreSQL")
    parser.add_argument("--url", default=None, help="Supabase Project URL")
    parser.add_argument("--key", default=None, help="Supabase Service Role Key")
    parser.add_argument("--batch", type=int, default=100, help="Batch size (default: 100)")
    args = parser.parse_args()

    migrate_data(args.url, args.key, args.batch)
