#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — Supabase 데이터 마이그레이션 도구 (Migrate spots.json to Supabase)
사용법:
    python scripts/migrate_to_supabase.py --url <SUPABASE_URL> --key <SERVICE_ROLE_KEY>
    또는 환경변수 SUPABASE_URL, SUPABASE_SERVICE_KEY 설정 후 실행
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
SPOTS_JSON_PATH = os.path.join(BASE_DIR, "src", "data", "spots.json")

def migrate_data(supabase_url: str, service_key: str, batch_size: int = 100):
    if not supabase_url or not service_key:
        print("❌ 오류: Supabase URL과 Service Role Key가 필요합니다.")
        print("사용법: python scripts/migrate_to_supabase.py --url <URL> --key <KEY>")
        sys.exit(1)

    supabase_url = supabase_url.rstrip("/")
    endpoint = f"{supabase_url}/rest/v1/spots"

    print(f"📦 spots.json 로드 중: {SPOTS_JSON_PATH}")
    with open(SPOTS_JSON_PATH, "r", encoding="utf-8") as f:
        spots = json.load(f)

    total = len(spots)
    print(f"총 {total}개 스팟 발견. Supabase 마이그레이션을 시작합니다 (배치 크기: {batch_size})...")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"  # Upsert (중복 시 업데이트)
    }

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
                    print(f"  ✓ [{success_count}/{total}] ({success_count*100//total}%) 전송 완료")
                else:
                    print(f"  ⚠️ 배치 {i//batch_size + 1} 응답 코드: {response.status}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            print(f"  ❌ HTTP 오류 ({e.code}): {err_body}")
            break
        except Exception as e:
            print(f"  ❌ 전송 오류: {e}")
            break

        time.sleep(0.05)

    elapsed = time.time() - start_time
    print(f"\n🎉 마이그레이션 완료: 총 {success_count}/{total}건 업로드 성공 (소요 시간: {elapsed:.2f}초)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate spots.json to Supabase PostgreSQL")
    parser.add_argument("--url", default=os.getenv("SUPABASE_URL"), help="Supabase Project URL")
    parser.add_argument("--key", default=os.getenv("SUPABASE_SERVICE_KEY"), help="Supabase Service Role Key")
    parser.add_argument("--batch", type=int, default=100, help="Batch size (default: 100)")
    args = parser.parse_args()

    migrate_data(args.url, args.key, args.batch)
