#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — OCI VM 올인원 자율 데이터 엔진 (v3)
24시간 365일 무중단으로 동작하며:
1) 기존 스팟 심층 메타 보강 & 3단계 폐업 안전 검증
2) 포털 지도 2026 신규 핫플레이스 자율 발굴 (Discovery)
3) 네이버/다음 블로그 & 구글 웹 검색 데이트 포스팅 마이닝 (Blog Miner)
4) 블라인드/더쿠/인벤 등 커뮤니티 찐 맛집 리스트 마이닝 (Community Miner)
5) 순수 표준 라이브러리(Zero-Dependency, RAM 20MB)로 초경량 가동됩니다.
"""

import os
import sys
import time
from datetime import datetime
from supabase_worker import run_worker, load_env
from discovery_engine import run_discovery
from blog_miner import run_blog_mining
from community_miner import run_community_mining

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
    print(f"🔄 [{now_str}] 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증")
    print(f"========================================================")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        print(f"❌ [검증 에러]: {e}")

    time.sleep(2)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"✨ [{now_str}] 2단계: 2026 신규 핫플레이스 포털 자율 발굴")
    print(f"========================================================")
    try:
        run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=3)
    except Exception as e:
        print(f"❌ [포털 발굴 에러]: {e}")

    time.sleep(2)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"📝 [{now_str}] 3단계: 블로그 & 구글 웹 검색 데이트 스팟 마이닝")
    print(f"========================================================")
    try:
        run_blog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=3)
    except Exception as e:
        print(f"❌ [블로그 마이닝 에러]: {e}")

    time.sleep(2)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========================================================")
    print(f"💬 [{now_str}] 4단계: 커뮤니티(더쿠/블라인드/인벤) 추천 리스트 마이닝")
    print(f"========================================================")
    try:
        run_community_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=3)
    except Exception as e:
        print(f"❌ [커뮤니티 마이닝 에러]: {e}")

def main():
    print("========================================================")
    print("🌟 오늘 데이트 (oneul-date) — OCI 올인원 멀티소스 데이터 엔진 (v3)")
    print(f"🔗 Supabase: {SUPABASE_URL}")
    print(f"⏱️ 주기: {CHECK_INTERVAL_HOURS}시간마다 메타 보강 & 멀티소스 자율 마이닝")
    print(f"🌐 원천 소스: 포털 지도 + 네이버/다음 블로그 + 구글 웹 + 커뮤니티 리스트")
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
        print(f"\n💤 전체 4단계 사이클 완료. 다음 사이클까지 대기 ({next_time} 예정)...")
        time.sleep(sleep_time)

if __name__ == "__main__":
    main()
