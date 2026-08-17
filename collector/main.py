#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 백엔드 자율 데이터 엔진 (v3)
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
import json
import urllib.request
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_worker import run_worker, load_env
from discovery_engine import run_discovery
from blog_miner import run_blog_mining
from community_miner import run_community_mining
from enrich_worker import run_social_enrichment
from notifier import send_daily_digest

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

env = load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("VITE_GROQ_API_KEY") or env.get("GROQ_API_KEY") or env.get("VITE_GROQ_API_KEY") or ""
CHECK_INTERVAL_HOURS = int(os.getenv("CHECK_INTERVAL_HOURS", "1"))
DISCOVERY_LIMIT = int(os.getenv("DISCOVERY_LIMIT", "50"))      # 1회 신규 발굴/마이닝/소셜동기화 한도 (기본: 50개)
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "100"))            # 1회 라이브 폐업 검증 한도 (기본: 100개)
DAILY_REPORT_HOUR = int(os.getenv("DAILY_REPORT_HOUR", "9"))  # 매일 리포트 발송 시각 (KST 0~23시, 기본: 9시)

# KST (한국 표준시 UTC+9)
KST = timezone(timedelta(hours=9))

# 로그 디렉토리 및 파일 경로 설정 (/mnt/data/logs 기본, 없을 시 ./logs 자동 폴백)
def get_log_dir():
    primary = os.getenv("LOG_DIR", "/mnt/data/logs")
    try:
        os.makedirs(primary, exist_ok=True)
        return primary
    except Exception:
        fallback = os.path.join(os.path.dirname(__file__), "logs")
        os.makedirs(fallback, exist_ok=True)
        return fallback

LOG_DIR = get_log_dir()
COLLECTOR_LOG_FILE = os.path.join(LOG_DIR, "collector.log")
DAILY_SUMMARY_LOG_FILE = os.path.join(LOG_DIR, "daily_summary.log")

def get_kst_now():
    return datetime.now(KST)

def log(message: str, level: str = "INFO"):
    now_str = get_kst_now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_str}] [{level}] {message}"
    print(formatted)
    try:
        with open(COLLECTOR_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

# 마지막 일일 서머리 기록 날짜 추적 (YYYY-MM-DD)
last_summary_date = None

def get_total_spot_stats():
    """Supabase에서 실시간 총 스팟 및 검증 상태 카운트 조회"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"total": 0, "active": 0, "closed": 0, "with_img": 0}
    
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/spots?select=id,is_closed,image_url"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                data = json.loads(res.read().decode('utf-8'))
                total = len(data)
                closed = sum(1 for s in data if s.get("is_closed") is True)
                active = total - closed
                with_img = sum(1 for s in data if s.get("image_url") and len(str(s.get("image_url")).strip()) > 5)
                return {"total": total, "active": active, "closed": closed, "with_img": with_img}
    except Exception:
        pass
    return {"total": 0, "active": 0, "closed": 0, "with_img": 0}

def check_and_generate_daily_summary(force: bool = False):
    """지정된 KST 시각(기본: 오전 09시) 기준 일일 서머리 생성 및 이메일/구글챗 리포트 자동 발송"""
    global last_summary_date
    now = get_kst_now()
    today_str = now.strftime("%Y-%m-%d")

    # 매일 지정된 KST 시각 첫 사이클 또는 날짜 변경 시 동작
    is_report_time = (now.hour == DAILY_REPORT_HOUR) or force
    if is_report_time and (last_summary_date != today_str):
        stats = get_total_spot_stats()
        summary_text = (
            f"\n========================================================\n"
            f"📊 [KST {today_str} {DAILY_REPORT_HOUR:02d}:00] 오늘 데이트 전체 통합 데이터 서머리\n"
            f"========================================================\n"
            f"• 총 등록 스팟 수    : {stats['total']:,}개\n"
            f"• 정상 운영(Active)  : {stats['active']:,}개\n"
            f"• 폐업/휴업(Closed)  : {stats['closed']:,}개\n"
            f"• 고유 이미지 보유율 : {stats['with_img']:,}개 ({(stats['with_img']/max(1, stats['total'])*100):.1f}%)\n"
            f"• 수집 엔진 가동 상태: 정상 (주기: {CHECK_INTERVAL_HOURS}시간, 1회 발굴 한도: {DISCOVERY_LIMIT}개)\n"
            f"• 저장 로그 경로     : {LOG_DIR}\n"
            f"========================================================\n"
        )
        print(summary_text)
        try:
            with open(DAILY_SUMMARY_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(summary_text + "\n")
            with open(COLLECTOR_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(summary_text + "\n")
        except Exception:
            pass

        # 데일리 통합 리포트 발송 (이메일 & Google Chat)
        try:
            email_stats = {
                "total_spots": stats["total"],
                "active_spots": stats["active"],
                "new_spots": stats.get("total", 0),
                "youtube_count": stats.get("with_img", 0)
            }
            send_daily_digest(email_stats)
        except Exception:
            pass

        last_summary_date = today_str

def run_cycle():
    log("▶ 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증 시작")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        log(f"1단계 검증 오류: {e}", level="ERROR")

    time.sleep(2)

    log("▶ 2단계: 2026 신규 핫플레이스 포털 자율 발굴 시작 (Groq AI 큐레이션)")
    try:
        run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, groq_key=GROQ_API_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"2단계 포털 발굴 오류: {e}", level="ERROR")

    time.sleep(2)

    log("▶ 3단계: 블로그 & 구글 웹 검색 데이트 스팟 마이닝 시작")
    try:
        run_blog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"3단계 블로그 마이닝 오류: {e}", level="ERROR")

    log("▶ 4단계: 커뮤니티(더쿠/블라인드/인벤) 추천 리스트 마이닝 시작")
    try:
        run_community_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"4단계 커뮤니티 마이닝 오류: {e}", level="ERROR")

    time.sleep(2)

    log("▶ 5단계: 유튜브 핫클립 & 카카오맵 평점 소셜 점진적 동기화 시작")
    try:
        run_social_enrichment(SUPABASE_URL, SUPABASE_SERVICE_KEY, batch_size=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"5단계 소셜 동기화 오류: {e}", level="ERROR")

    # KST 00:00 자정 서머리 검사
    check_and_generate_daily_summary()

def main():
    log("========================================================")
    log("🌟 오늘 데이트 (oneul-date) — 백엔드 데이터 엔진 가동 (v3.1)")
    log(f"🔗 Supabase: {SUPABASE_URL}")
    log(f"⏱️ 주기: {CHECK_INTERVAL_HOURS}시간 | 1회 배치 한도: {BATCH_LIMIT}개")
    log(f"📁 로그 저장 경로: {LOG_DIR}")
    log(f"   - 실시간 로그 : {COLLECTOR_LOG_FILE}")
    log(f"   - KST 00시 요약: {DAILY_SUMMARY_LOG_FILE}")
    log("========================================================")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 없습니다.", level="ERROR")
        sys.exit(1)

    # 최초 구동 시 1회 서머리 생성
    check_and_generate_daily_summary(force=True)

    interval_seconds = CHECK_INTERVAL_HOURS * 3600

    # 24/7 무한 루프
    while True:
        start_time = time.time()
        run_cycle()
        elapsed = time.time() - start_time
        sleep_time = max(60, interval_seconds - elapsed)

        next_time = (get_kst_now() + timedelta(seconds=sleep_time)).strftime("%Y-%m-%d %H:%M:%S")
        log(f"💤 4단계 사이클 완료. 다음 사이클 대기 ({next_time} KST 예정)...")
        time.sleep(sleep_time)

if __name__ == "__main__":
    main()
