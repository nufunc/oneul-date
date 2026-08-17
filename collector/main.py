#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 자율 수집 및 고급화 메인 데몬 (24/7 Engine)
24시간 365일 무중단으로 동작하며:
1) 기존 스팟 심층 메타데이터 보강(Enrichment) 및 다단계 안전 검증
2) 전국 2026 신규 핫플 자율 탐색 및 DB 자동 증강(Discovery)
3) Supabase 7일 휴면 방지(Keep-alive)를 자동 수행합니다.
"""

import os
import sys
import time
import schedule
from datetime import datetime
from dotenv import load_dotenv
from supabase_worker import run_worker
from discovery_engine import run_discovery

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
CHECK_INTERVAL_HOURS = int(os.getenv("CHECK_INTERVAL_HOURS", "2"))
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "50"))

def job_enrich_and_validate():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"🔄 [{now_str}] 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증")
    print(f"========================================================")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        print(f"❌ [에러] 검증 작업 중 예외: {e}")

def job_discover_new_spots():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"✨ [{now_str}] 2단계: 2026 신규 핫플레이스 자율 발굴 사이클")
    print(f"========================================================")
    try:
        run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=5)
    except Exception as e:
        print(f"❌ [에러] 자율 발굴 중 예외: {e}")

def main():
    print("========================================================")
    print("🌟 오늘 데이트 (oneul-date) — OCI 자율 데이터 고도화 엔진")
    print(f"🔗 Supabase URL: {SUPABASE_URL}")
    print(f"⏱️ 주기: {CHECK_INTERVAL_HOURS}시간마다 {BATCH_LIMIT}건 심층 보강 & 신규 핫플 자율 발굴")
    print("========================================================")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수가 없습니다.")
        print("   .env 파일에 올바른 키를 입력해주세요.")
        sys.exit(1)

    # 1. 시작 직후 1회 전체 사이클 즉시 실행
    job_enrich_and_validate()
    time.sleep(2)
    job_discover_new_spots()

    # 2. 주기적 스케줄링 등록
    schedule.every(CHECK_INTERVAL_HOURS).hours.do(job_enrich_and_validate)
    schedule.every(CHECK_INTERVAL_HOURS).hours.do(job_discover_new_spots)

    print(f"\n💤 24/7 무중단 스케줄러 가동 중... (다음 사이클: {CHECK_INTERVAL_HOURS}시간 뒤)")

    # 3. 24/7 데몬 루프
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    main()
