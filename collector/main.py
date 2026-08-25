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
from youtube_vlog_miner import run_youtube_vlog_mining
from miners.catchtable_miner import run_catchtable_mining
from miners.tourapi_miner import run_tourapi_mining
from notifier import send_daily_digest

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

env = load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("VITE_GROQ_API_KEY") or env.get("GROQ_API_KEY") or env.get("VITE_GROQ_API_KEY") or ""

# 주기 설정 (CHECK_INTERVAL_MINUTES 우선, 없으면 CHECK_INTERVAL_HOURS)
raw_minutes = os.getenv("CHECK_INTERVAL_MINUTES") or env.get("CHECK_INTERVAL_MINUTES")
raw_hours = os.getenv("CHECK_INTERVAL_HOURS") or env.get("CHECK_INTERVAL_HOURS")
if raw_minutes:
    CHECK_INTERVAL_MINUTES = int(raw_minutes)
    CHECK_INTERVAL_SECONDS = CHECK_INTERVAL_MINUTES * 60
    INTERVAL_DESC = f"{CHECK_INTERVAL_MINUTES}분"
elif raw_hours:
    CHECK_INTERVAL_SECONDS = int(float(raw_hours) * 3600)
    INTERVAL_DESC = f"{raw_hours}시간"
else:
    CHECK_INTERVAL_MINUTES = 60
    CHECK_INTERVAL_SECONDS = 60 * 60
    INTERVAL_DESC = "60분 (1시간)"

DISCOVERY_LIMIT = int(os.getenv("DISCOVERY_LIMIT") or env.get("DISCOVERY_LIMIT") or "150")      # 1회 신규 발굴 한도 (기본: 150개)
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT") or env.get("BATCH_LIMIT") or "200")                  # 1회 라이브 폐업 검증 한도 (기본: 200개)
DAILY_REPORT_HOUR = int(os.getenv("DAILY_REPORT_HOUR") or env.get("DAILY_REPORT_HOUR") or "22")# 매일 리포트 발송 시각 (KST 0~23시, 기본: 22시)

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

class _TeeStream:
    """stdout/stderr를 콘솔, 최신 collector.log, 일자별 collector-YYYY-MM-DD.log에 동시 기록.
    하위 모듈(miner 등)이 print()만 사용해도 로그 파일에 순서대로 안전하게 남도록 보장."""
    def __init__(self, stream, base_dir):
        self._stream = stream
        self._base_dir = base_dir

    def write(self, data):
        try:
            self._stream.write(data)
        except Exception:
            pass
        try:
            today_str = datetime.now(KST).strftime("%Y-%m-%d")
            daily_file = os.path.join(self._base_dir, f"collector-{today_str}.log")
            latest_file = os.path.join(self._base_dir, "collector.log")

            # 1. 최신 통합 로그 파일 기록
            with open(latest_file, "a", encoding="utf-8") as f:
                f.write(data)

            # 2. 일자별 롤링 로그 파일 기록
            with open(daily_file, "a", encoding="utf-8") as f:
                f.write(data)
        except Exception:
            pass

    def flush(self):
        try:
            self._stream.flush()
        except Exception:
            pass

sys.stdout = _TeeStream(sys.stdout, LOG_DIR)
sys.stderr = _TeeStream(sys.stderr, LOG_DIR)

def get_kst_now():
    return datetime.now(KST)

def log(message: str, level: str = "INFO"):
    # 파일 기록은 _TeeStream이 담당하므로 print 한 번이면 콘솔+파일 모두 남는다
    now_str = get_kst_now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] [{level}] {message}")

# 마지막 일일 서머리 기록 날짜 추적 (YYYY-MM-DD)
last_summary_date = None

def get_exact_count(filter_query: str = "") -> int:
    """Supabase REST API exact count 헤더를 통해 1,000개 제한 없이 정확한 전체 수량 집계"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return 0
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/spots?select=id{filter_query}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Range": "0-0",
        "Prefer": "count=exact"
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as res:
            cr = res.headers.get("Content-Range", "")
            if "/" in cr:
                return int(cr.split("/")[1])
    except Exception:
        pass
    return 0

def get_total_spot_stats():
    """Supabase에서 실시간 총 스팟 및 검증 상태 카운트 정확히 조회 (1,000개 페이징 한도 돌파)"""
    total = get_exact_count()
    closed = get_exact_count("&is_closed=eq.true")
    active = total - closed
    with_img = get_exact_count("&image_url=not.is.null")
    return {"total": total, "active": active, "closed": closed, "with_img": with_img}

# 기동 시각 및 일일 리포트 상태 추적
startup_time = None
last_summary_date = None

def check_and_generate_daily_summary(force: bool = False):
    """지정된 KST 시각(기본: 22시) 기준 일일 서머리 생성 및 이메일/구글챗 리포트 자동 발송"""
    global last_summary_date, startup_time
    now = get_kst_now()
    today_str = now.strftime("%Y-%m-%d")

    # 기동 직후 즉시 발송 방지 (컨테이너 재시작 시 중복 발송 차단)
    send_on_startup = os.getenv("SEND_EMAIL_ON_STARTUP", "").strip().lower() in ("1", "true", "yes")
    
    # 정기 발송 조건: 현재 시각(KST)이 지정된 시각과 일치하고, 오늘 아직 발송하지 않은 경우
    is_scheduled_hour = (now.hour == DAILY_REPORT_HOUR)
    
    if (is_scheduled_hour or force or send_on_startup) and (last_summary_date != today_str):
        stats = get_total_spot_stats()
        summary_text = (
            f"\n========================================================\n"
            f"📊 [KST {today_str} {DAILY_REPORT_HOUR:02d}:00] 오늘 데이트 전체 통합 데이터 서머리\n"
            f"========================================================\n"
            f"• 총 등록 스팟 수    : {stats['total']:,}개\n"
            f"• 정상 운영(Active)  : {stats['active']:,}개\n"
            f"• 폐업/휴업(Closed)  : {stats['closed']:,}개\n"
            f"• 고유 이미지 보유율 : {stats['with_img']:,}개 ({(stats['with_img']/max(1, stats['total'])*100):.1f}%)\n"
            f"• 수집 엔진 가동 상태: 정상 (주기: {INTERVAL_DESC}, 1회 발굴 한도: {DISCOVERY_LIMIT}개)\n"
            f"• 저장 로그 경로     : {LOG_DIR}\n"
            f"========================================================\n"
        )
        print(summary_text)  # _TeeStream이 collector.log에도 기록
        try:
            with open(DAILY_SUMMARY_LOG_FILE, "a", encoding="utf-8") as f:
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
            log(f"📧 [정기 리포트 발송 트리거] KST {now.hour:02d}:00 (설정 시각: {DAILY_REPORT_HOUR:02d}:00) 데일리 이메일 발송 실행")
            send_daily_digest(email_stats)
        except Exception as e:
            log(f"데일리 리포트 발송 예외: {e}", level="ERROR")

        last_summary_date = today_str

def run_cycle():
    log(f"▶ 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증 시작 (한도: {BATCH_LIMIT}개)")
    try:
        run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
    except Exception as e:
        log(f"1단계 검증 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 2단계: 2026 신규 핫플레이스 포털 자율 발굴 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, groq_key=GROQ_API_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"2단계 포털 발굴 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 3단계: 블로그 & 구글 웹 검색 데이트 스팟 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        run_blog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"3단계 블로그 마이닝 오류: {e}", level="ERROR")

    log(f"▶ 4단계: 커뮤니티(더쿠/블라인드/인벤) 추천 리스트 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        run_community_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"4단계 커뮤니티 마이닝 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 5단계: 유튜브 핫클립 & 카카오맵 평점 소셜 점진적 동기화 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        run_social_enrichment(SUPABASE_URL, SUPABASE_SERVICE_KEY, batch_size=DISCOVERY_LIMIT)
    except Exception as e:
        log(f"5단계 소셜 동기화 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 6단계: 최신 유튜브 여행/데이트 브이로그 역방향 장소 마이닝 시작")
    try:
        mined = run_youtube_vlog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=5)
        log(f"6단계 완료: 신규 스팟 {mined}개 등록")
    except Exception as e:
        log(f"6단계 유튜브 브이로그 마이닝 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 7단계: 캐치테이블 & 블루리본 미식 예약 핫플 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        c_mined = run_catchtable_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
        log(f"7단계 완료: 신규 예약 다이닝 스팟 {c_mined}개 등록")
    except Exception as e:
        log(f"7단계 캐치테이블 마이닝 오류: {e}", level="ERROR")

    time.sleep(2)

    log(f"▶ 8단계: 한국관광공사 TourAPI 4.0 공공 문화/관광/체험 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
    try:
        t_mined = run_tourapi_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT)
        log(f"8단계 완료: 신규 공공 문화/관광 스팟 {t_mined}개 등록")
    except Exception as e:
        log(f"8단계 TourAPI 마이닝 오류: {e}", level="ERROR")

    # 일일 서머리 검사
    check_and_generate_daily_summary()

def main():
    log("========================================================")
    log("🌟 오늘 데이트 (oneul-date) — 백엔드 데이터 엔진 가동 (v4.0 8단계 통합)")
    log(f"🔗 Supabase: {SUPABASE_URL}")
    log(f"⏱️ 주기: {INTERVAL_DESC} | 1회 발굴 한도: {DISCOVERY_LIMIT}개 | 폐업 검증 한도: {BATCH_LIMIT}개")
    log(f"📁 로그 저장 경로: {LOG_DIR}")
    log(f"   - 실시간 로그 : {COLLECTOR_LOG_FILE}")
    log(f"   - 일일 요약   : {DAILY_SUMMARY_LOG_FILE}")
    log("========================================================")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("오류: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 없습니다.", level="ERROR")
        sys.exit(1)

    # 최초 구동 시에는 메일을 보내지 않고, 지정된 KST 시각(DAILY_REPORT_HOUR)에만 발송
    log(f"📅 일일 리포트는 매일 KST {DAILY_REPORT_HOUR:02d}:00에 지정된 시각에만 자동 발송됩니다.")

    interval_seconds = CHECK_INTERVAL_SECONDS

    # 24/7 무한 루프
    while True:
        start_time = time.time()
        run_cycle()
        elapsed = time.time() - start_time
        sleep_time = max(30, interval_seconds - elapsed)

        next_time = (get_kst_now() + timedelta(seconds=sleep_time)).strftime("%Y-%m-%d %H:%M:%S")
        log(f"💤 6단계 전체 사이클 완료 (소요: {elapsed/60:.1f}분). 다음 사이클 대기 ({next_time} KST 예정)...")
        time.sleep(sleep_time)

if __name__ == "__main__":
    main()
