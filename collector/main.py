#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 초경량 자율 고도화 데몬 (Zero-Dependency Engine)
외부 패키지 의존성 0개(순수 파이썬 표준 라이브러리)로 24시간 365일 무중단 가동됩니다.
"""

import os
import sys
import time
from datetime import datetime
from supabase_worker import run_worker, load_env
from discovery_engine import run_discovery

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

env = load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
CHECK_INTERVAL_HOURS = int(os.getenv("CHECK_INTERVAL_HOURS", "2"))
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "50"))

def run_cycle():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"🔄 [{now_str}] 1단계: Supabase 스팟 심층 메타 보강 & 검증")
    print(f"========================================================")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        print(f"❌ [검증 에러]: {e}")

    time.sleep(2)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"✨ [{now_str}] 2단계: 2026 신규 핫플레이스 자율 발굴 사이클")
    print(f"========================================================")
    try:
        run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=5)
    except Exception as e:
        print(f"❌ [발굴 에러]: {e}")

def main():
    print("========================================================")
    print("🌟 오늘 데이트 (oneul-date) — OCI 초경량 고도화 엔진 (v2)")
    print(f"🔗 Supabase: {SUPABASE_URL}")
    print(f"⏱️ 주기: {CHECK_INTERVAL_HOURS}시간마다 {BATCH_LIMIT}건 심층 보강 & 신규 핫플 자율 발굴")
    print(f"📦 패키지 의존성: 0개 (순수 표준 라이브러리 초경량 구동)")
    print("========================================================")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 없습니다.")
        print("   .env 파일에 올바른 키를 입력해주세요.")
        sys.exit(1)

    interval_seconds = CHECK_INTERVAL_HOURS * 3600

    # 24/7 무한 루프
    while True:
        start_time = time.time()
        run_cycle()
        elapsed = time.time() - start_time
        sleep_time = max(60, interval_seconds - elapsed)

        next_time = datetime.fromtimestamp(time.time() + sleep_time).strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n💤 작업 완료. 다음 사이클까지 대기 ({next_time} 예정)...")
        time.sleep(sleep_time)

if __name__ == "__main__":
    main()
