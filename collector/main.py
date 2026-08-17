#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 자율 수집 및 동기화 메인 데몬 (24/7 Daemon)
주기적으로 네이버 플레이스 라이브 검증, 폐업 감지, 주소 보강 및 Supabase 동기화를 수행합니다.
"""

import os
import sys
import time
import schedule
from datetime import datetime
from dotenv import load_dotenv
from supabase_worker import run_worker

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# .env 파일 로드
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
CHECK_INTERVAL_HOURS = int(os.getenv("CHECK_INTERVAL_HOURS", "2"))
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "100"))

def job_sync_and_validate():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"🚀 [{now_str}] Supabase 라이브 검증 & 동기화 사이클 시작")
    print(f"========================================================")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        print(f"❌ [에러 발생] 작업 중 예외가 발생했습니다: {e}")
    print(f"💤 다음 사이클 대기 중 ({CHECK_INTERVAL_HOURS}시간 주기)...")

def main():
    print("========================================================")
    print("✨ 오늘 데이트 (oneul-date) — OCI VM Collector Daemon")
    print(f"🔗 Supabase URL: {SUPABASE_URL}")
    print(f"⏱️ 실행 주기: {CHECK_INTERVAL_HOURS}시간마다 {BATCH_LIMIT}건 검증")
    print("========================================================")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수가 없습니다.")
        print("   .env 파일에 올바른 키를 입력해주세요.")
        sys.exit(1)

    # 1. 컨테이너 시작 직후 즉시 1회 검증 사이클 실행
    job_sync_and_validate()

    # 2. 주기적 스케줄링 등록
    schedule.every(CHECK_INTERVAL_HOURS).hours.do(job_sync_and_validate)

    # 3. 24/7 무한 루프
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    main()
