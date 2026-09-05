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
    CHECK_INTERVAL_MINUTES = 30
    CHECK_INTERVAL_SECONDS = 30 * 60
    INTERVAL_DESC = "30분"

DISCOVERY_LIMIT = int(os.getenv("DISCOVERY_LIMIT") or env.get("DISCOVERY_LIMIT") or "200")      # 1회 신규 발굴 한도 (기본: 200개)
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

# 일자별 인메모리 파이프라인 수집 실적 추적 (프로세스 런타임 누적)
daily_pipeline_counts = {}

def record_pipeline_count(today_str: str, key: str, count: int):
    """사이클별 수집 성공 건수를 인메모리에 누적 기록"""
    global daily_pipeline_counts
    if not count or count <= 0:
        return
    if today_str not in daily_pipeline_counts:
        # 최근 2일치만 유지하여 메모리 누수 방지
        daily_pipeline_counts = {today_str: {"tourapi": 0, "catchtable": 0, "youtube": 0, "portal_blog": 0, "enrich": 0}}
    daily_pipeline_counts[today_str][key] = daily_pipeline_counts[today_str].get(key, 0) + count

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

def get_today_created_count() -> int:
    """오늘(KST 00:00:00 기준) Supabase DB에 신규 INSERT된 스팟 수 실시간 조회"""
    try:
        now_kst = get_kst_now()
        kst_midnight = datetime(now_kst.year, now_kst.month, now_kst.day, 0, 0, 0, tzinfo=KST)
        utc_iso = kst_midnight.astimezone(timezone.utc).isoformat()
        return get_exact_count(f"&created_at=gte.{urllib.parse.quote(utc_iso)}")
    except Exception:
        return 0

def get_total_spot_stats():
    """Supabase에서 실시간 총 스팟 및 검증 상태 카운트 정확히 조회 (1,000개 페이징 한도 돌파)"""
    total = get_exact_count()
    closed = get_exact_count("&is_closed=eq.true")
    active = total - closed
    with_img = get_exact_count("&image_url=not.is.null")
    return {"total": total, "active": active, "closed": closed, "with_img": with_img}

def get_regional_stats() -> dict:
    """전국 8대 권역별 정상 운영 스팟 수 집계"""
    regions = ["서울", "경기", "인천", "영남", "호남", "충청", "강원", "제주"]
    counts = {}
    for r in regions:
        enc_r = urllib.parse.quote(r)
        counts[r] = get_exact_count(f"&region=eq.{enc_r}&is_closed=eq.false")
    return counts

def get_pipeline_stats_from_log(today_str: str) -> dict:
    """당일 로그 파일에서 8대 마이너별 신규 발굴 및 동기화 실적 집계 (보조/백업용 정규식 파싱)"""
    import re
    pipe = {"tourapi": 0, "catchtable": 0, "youtube": 0, "portal_blog": 0, "enrich": 0}
    log_file = os.path.join(LOG_DIR, f"collector-{today_str}.log")
    if not os.path.exists(log_file):
        log_file = COLLECTOR_LOG_FILE
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # 1. TourAPI (✨ [TourAPI 4.0 INSERT 성공] 총 5개 ...)
            tourapi_m = re.findall(r'\[TourAPI 4\.0 INSERT 성공\] 총 (\d+)개', content)
            pipe["tourapi"] = sum(int(m) for m in tourapi_m)

            # 2. CatchTable (✨ [CatchTable/블루리본 INSERT 성공] 총 3개 ...)
            ct_m = re.findall(r'\[CatchTable/블루리본 INSERT 성공\] 총 (\d+)개', content)
            pipe["catchtable"] = sum(int(m) for m in ct_m)

            # 3. YouTube (📹 ... | 등록 2건 또는 ✨ [신규 스팟 등록 성공!])
            yt_m1 = re.findall(r'📹 [^\n]*?등록 (\d+)건', content)
            yt_m2 = re.findall(r'✨ \[신규 스팟 등록 성공!\]', content)
            pipe["youtube"] = max(sum(int(m) for m in yt_m1 if m != '0'), len(yt_m2))

            # 4. Portal & Blog & Community
            # - 포털: ✨ [신규 핫플 자동 INSERT 성공] 총 10곳
            portal_m = re.findall(r'\[신규 핫플 자동 INSERT 성공\] 총 (\d+)곳', content)
            # - 블로그: 🎉 [블로그 마이닝 INSERT 성공] 총 5곳
            blog_m = re.findall(r'\[블로그 마이닝 INSERT 성공\] 총 (\d+)곳', content)
            # - 커뮤니티: 🔥 [커뮤니티 마이닝 INSERT 성공] 총 3곳
            comm_m = re.findall(r'\[커뮤니티 마이닝 INSERT 성공\] 총 (\d+)곳', content)
            pipe["portal_blog"] = (
                sum(int(m) for m in portal_m) +
                sum(int(m) for m in blog_m) +
                sum(int(m) for m in comm_m)
            )

            # 5. Social Enrich (🎉 [소셜 메타데이터 동기화 완료] 총 15/20개 ...)
            enrich_m = re.findall(r'\[소셜 메타데이터 동기화 완료\] 총 (\d+)/\d+개', content)
            if enrich_m:
                pipe["enrich"] = sum(int(m) for m in enrich_m)
            else:
                legacy_enrich = re.findall(r'소셜 메타 동기화|동기화 완료', content)
                pipe["enrich"] = len(legacy_enrich)
        except Exception:
            pass
    return pipe

def get_pipeline_stats(today_str: str) -> dict:
    """인메모리 누적 실적과 로그 파일 파싱 실적 중 최대값을 채택하여 프로세스 재시작·버퍼 누락 방어"""
    mem = daily_pipeline_counts.get(today_str, {})
    log_stats = get_pipeline_stats_from_log(today_str)
    
    pipe = {}
    for k in ["tourapi", "catchtable", "youtube", "portal_blog", "enrich"]:
        pipe[k] = max(mem.get(k, 0), log_stats.get(k, 0))
    return pipe

def get_top_spots(limit: int = 5) -> list:
    """최신 사진과 풍부한 메타를 보유한 주요 큐레이션 스팟 추출"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/spots?select=id,name,category,region,area,summary,image_url,signature_items,social_links,slot&is_closed=eq.false&image_url=not.is.null&order=id.desc&limit={limit}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json"
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception:
        return []

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
        regional = get_regional_stats()
        pipeline = get_pipeline_stats(today_str)
        top_spots = get_top_spots(limit=5)
        
        # 오늘 신규 생성 스팟: Supabase DB 실시간 타임스탬프 쿼리 및 파이프라인 실적 합산 중 최대값
        db_today_new = get_today_created_count()
        pipe_today_new = sum([pipeline.get("tourapi", 0), pipeline.get("catchtable", 0), pipeline.get("youtube", 0), pipeline.get("portal_blog", 0)])
        actual_today_new = max(db_today_new, pipe_today_new)

        summary_text = (
            f"\n========================================================\n"
            f"📊 [KST {today_str} {DAILY_REPORT_HOUR:02d}:00] 오늘 데이트 전체 통합 데이터 서머리\n"
            f"========================================================\n"
            f"• 총 등록 스팟 수    : {stats['total']:,}개\n"
            f"• 오늘 신규 등록     : {actual_today_new:,}개 (DB 실시간: {db_today_new:,}개, 수집 합계: {pipe_today_new:,}개)\n"
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
                "closed_spots": stats["closed"],
                "with_img_count": stats["with_img"],
                "new_spots_today": actual_today_new
            }
            log(f"📧 [정기 리포트 발송 트리거] KST {now.hour:02d}:00 (설정 시각: {DAILY_REPORT_HOUR:02d}:00) 데일리 이메일 발송 실행")
            send_daily_digest(email_stats, top_spots=top_spots, regional_stats=regional, pipeline_stats=pipeline)
        except Exception as e:
            log(f"데일리 리포트 발송 예외: {e}", level="ERROR")

        last_summary_date = today_str

# 각 수집 단계별 마지막 실행 시각 추적 (스마트 스케줄링)
last_step_run = {}

def is_step_due(step_name: str, interval_hours: float) -> bool:
    """지정된 주기(시간) 경과 여부를 판별하여 단계별 실행 제어 (최초 구동 시 즉시 실행)"""
    global last_step_run
    now_ts = time.time()
    last_ts = last_step_run.get(step_name, 0)
    if (now_ts - last_ts) >= (interval_hours * 3600):
        last_step_run[step_name] = now_ts
        return True
    return False

def run_cycle():
    today_str = get_kst_now().strftime("%Y-%m-%d")

    # 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증 (4시간 주기)
    if is_step_due("worker_verify", 4.0):
        log(f"▶ 1단계: Supabase 스팟 심층 메타 보강 & 폐업 검증 시작 (한도: {BATCH_LIMIT}개)")
        try:
            run_worker(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=BATCH_LIMIT)
        except Exception as e:
            log(f"1단계 검증 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 1단계(폐업/메타 검증) 대기 중 (4시간 주기 보호)")

    # 2단계: 2026 신규 핫플레이스 포털 자율 발굴 (2시간 주기)
    if is_step_due("portal_discovery", 2.0):
        log(f"▶ 2단계: 2026 신규 핫플레이스 포털 자율 발굴 시작 (한도: {DISCOVERY_LIMIT}개)")
        try:
            p_mined = run_discovery(SUPABASE_URL, SUPABASE_SERVICE_KEY, groq_key=GROQ_API_KEY, max_discoveries=DISCOVERY_LIMIT) or 0
            record_pipeline_count(today_str, "portal_blog", p_mined)
            log(f"2단계 완료: 신규 포털 스팟 {p_mined}개 등록")
        except Exception as e:
            log(f"2단계 포털 발굴 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 2단계(포털 발굴) 대기 중 (2시간 주기 보호)")

    # 3단계: 블로그 & 구글 웹 검색 데이트 스팟 마이닝 (2.5시간 주기)
    if is_step_due("blog_miner", 2.5):
        log(f"▶ 3단계: 블로그 & 구글 웹 검색 데이트 스팟 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
        try:
            b_mined = run_blog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT) or 0
            record_pipeline_count(today_str, "portal_blog", b_mined)
            log(f"3단계 완료: 신규 블로그 스팟 {b_mined}개 등록")
        except Exception as e:
            log(f"3단계 블로그 마이닝 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 3단계(블로그 마이닝) 대기 중 (2.5시간 주기 보호)")

    # 4단계: 커뮤니티(더쿠/블라인드/인벤) 추천 리스트 마이닝 (3시간 주기)
    if is_step_due("community_miner", 3.0):
        log(f"▶ 4단계: 커뮤니티(더쿠/블라인드/인벤) 추천 리스트 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
        try:
            c_mined = run_community_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT) or 0
            record_pipeline_count(today_str, "portal_blog", c_mined)
            log(f"4단계 완료: 신규 커뮤니티 스팟 {c_mined}개 등록")
        except Exception as e:
            log(f"4단계 커뮤니티 마이닝 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 4단계(커뮤니티 마이닝) 대기 중 (3시간 주기 보호)")

    # 5단계: 유튜브 핫클립 & 카카오맵 평점 소셜 점진적 동기화 (4시간 주기)
    if is_step_due("social_enrich", 4.0):
        log(f"▶ 5단계: 유튜브 핫클립 & 카카오맵 평점 소셜 점진적 동기화 시작 (한도: {DISCOVERY_LIMIT}개)")
        try:
            e_cnt = run_social_enrichment(SUPABASE_URL, SUPABASE_SERVICE_KEY, batch_size=DISCOVERY_LIMIT) or 0
            record_pipeline_count(today_str, "enrich", e_cnt)
            log(f"5단계 완료: 소셜 메타 {e_cnt}개 동기화")
        except Exception as e:
            log(f"5단계 소셜 동기화 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 5단계(소셜 동기화) 대기 중 (4시간 주기 보호)")

    # 6단계: 최신 유튜브 여행/데이트 브이로그 역방향 장소 마이닝 (2시간 주기)
    if is_step_due("youtube_vlog", 2.0):
        log(f"▶ 6단계: 최신 유튜브 여행/데이트 브이로그 역방향 장소 마이닝 시작 (한도: 25개 영상)")
        try:
            mined = run_youtube_vlog_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, limit=25) or 0
            record_pipeline_count(today_str, "youtube", mined)
            log(f"6단계 완료: 신규 스팟 {mined}개 등록")
        except Exception as e:
            log(f"6단계 유튜브 브이로그 마이닝 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 6단계(유튜브 브이로그) 대기 중 (2시간 주기 보호)")

    # 7단계: 캐치테이블 & 블루리본 미식 예약 핫플 마이닝 (3시간 주기)
    if is_step_due("catchtable", 3.0):
        log(f"▶ 7단계: 캐치테이블 & 블루리본 미식 예약 핫플 마이닝 시작 (한도: 60개)")
        try:
            ct_mined = run_catchtable_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=60) or 0
            record_pipeline_count(today_str, "catchtable", ct_mined)
            log(f"7단계 완료: 신규 예약 다이닝 스팟 {ct_mined}개 등록")
        except Exception as e:
            log(f"7단계 캐치테이블 마이닝 오류: {e}", level="ERROR")
        time.sleep(2)
    else:
        log("⏩ 7단계(캐치테이블) 대기 중 (3시간 주기 보호)")

    # 8단계: 한국관광공사 TourAPI 4.0 공공 문화/관광/체험 마이닝 (4시간 주기)
    if is_step_due("tourapi", 4.0):
        log(f"▶ 8단계: 한국관광공사 TourAPI 4.0 공공 문화/관광/체험 마이닝 시작 (한도: {DISCOVERY_LIMIT}개)")
        try:
            t_mined = run_tourapi_mining(SUPABASE_URL, SUPABASE_SERVICE_KEY, max_discoveries=DISCOVERY_LIMIT) or 0
            record_pipeline_count(today_str, "tourapi", t_mined)
            log(f"8단계 완료: 신규 공공 문화/관광 스팟 {t_mined}개 등록")
        except Exception as e:
            log(f"8단계 TourAPI 마이닝 오류: {e}", level="ERROR")
    else:
        log("⏩ 8단계(TourAPI) 대기 중 (4시간 주기 보호)")

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
        log(f"💤 8단계 전체 자율 수집 사이클 완료 (소요: {elapsed/60:.1f}분). 다음 사이클 대기 ({next_time} KST 예정)...")
        time.sleep(sleep_time)

if __name__ == "__main__":
    main()
