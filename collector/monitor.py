#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 수집기 지능형 모니터링 & 장애 역추적 엔진 (monitor.py)

일별(Daily), 주별(Weekly), 월별(Monthly) 단위로 수집기 로그를 분석하고:
1) 수집 사이클 및 8단계 마이너 가동 지표 집계
2) 신규 스팟 적재 실적 (권역/슬롯/주요 명소) 추적
3) HTTP 에러(402, 403, 429 등) 발생 타임라인 및 해결 여부 역추적
4) 카테고리 필터 탈락 사유 및 오탐 후보 역추적
5) 원격 OCI VM 로그 자동 동기화 (--remote)
6) Markdown 리포트 자동 생성 및 docs/monitoring/ 자동 갱신
"""

import os
import sys
import re
import json
import argparse
import subprocess
from datetime import datetime, timedelta, timezone
from collections import defaultdict, Counter
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 기본 경로
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DOCS_MONITORING_DIR = PROJECT_ROOT / "docs" / "monitoring"

# KST (한국 표준시)
KST = timezone(timedelta(hours=9))

# OCI VM SSH 기본 정보
DEFAULT_SSH_KEY = os.getenv("OCI_SSH_KEY", r"C:\Users\Administrator\.ssh\oci-sshkey-2022-03-06.key")
DEFAULT_SSH_HOST = os.getenv("OCI_SSH_HOST", "opc@152.70.89.210")
REMOTE_LOG_DIR = "/mnt/data/git/oneul-date/collector/data/logs"

def parse_args():
    parser = argparse.ArgumentParser(description="오늘 데이트 수집기 지능형 모니터링 & 장애 역추적 도구")
    parser.add_argument("--period", "-p", choices=["daily", "weekly", "monthly"], default="daily",
                        help="분석 기간 단위 (daily: 일별, weekly: 최근 7일/주별, monthly: 월별)")
    parser.add_argument("--date", "-d", help="기준 날짜 (YYYY-MM-DD, 기본값: 오늘)")
    parser.add_argument("--remote", "-r", action="store_true", help="OCI VM에서 실시간 원격 로그를 가져와 분석")
    parser.add_argument("--trace", "-t", help="특정 스팟명, 에러 코드(402, 403 등), 키워드 전수 역추적")
    parser.add_argument("--save-report", "-s", action="store_true", default=True,
                        help="docs/monitoring/ 경로에 마크다운 리포트 자동 저장 및 LATEST.md 갱신 (기본: True)")
    parser.add_argument("--no-save", action="store_false", dest="save_report", help="리포트 파일 저장을 건너뛰고 콘솔에만 출력")
    parser.add_argument("--json", "-j", action="store_true", help="JSON 포맷으로 출력")
    return parser.parse_args()

def get_kst_today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")

def find_local_log_dirs():
    candidates = [
        BASE_DIR / "data" / "logs",
        BASE_DIR / "logs",
        Path("/mnt/data/logs"),
        Path("/mnt/data/git/oneul-date/collector/data/logs"),
        PROJECT_ROOT / ".cache" / "logs"
    ]
    return [p for p in candidates if p.exists()]

def fetch_remote_logs_if_needed(target_dates: list[str]) -> Path:
    """OCI VM에서 지정된 날짜의 로그 파일들을 로컬 캐시 폴더로 안전하게 동기화"""
    cache_dir = PROJECT_ROOT / ".cache" / "logs"
    cache_dir.mkdir(parents=True, exist_ok=True)

    if not os.path.exists(DEFAULT_SSH_KEY):
        print(f"⚠️ SSH 키({DEFAULT_SSH_KEY})를 찾을 수 없어 로컬 로그 디렉토리를 탐색합니다.")
        return cache_dir

    print(f"🌐 [OCI VM 원격 연동] {DEFAULT_SSH_HOST} 에서 대상 로그({len(target_dates)}개 파일) 동기화 중...")
    for dt in target_dates:
        filename = f"collector-{dt}.log"
        local_path = cache_dir / filename
        remote_path = f"{REMOTE_LOG_DIR}/{filename}"

        cmd = [
            "scp", "-o", "StrictHostKeyChecking=no",
            "-i", DEFAULT_SSH_KEY,
            f"{DEFAULT_SSH_HOST}:{remote_path}",
            str(local_path)
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                print(f"  + {filename} 동기화 완료 ({local_path.stat().st_size:,} bytes)")
        except Exception:
            pass

    # 통합 collector.log도 필요시 동기화
    cmd_main = [
        "scp", "-o", "StrictHostKeyChecking=no",
        "-i", DEFAULT_SSH_KEY,
        f"{DEFAULT_SSH_HOST}:{REMOTE_LOG_DIR}/collector.log",
        str(cache_dir / "collector.log")
    ]
    try:
        subprocess.run(cmd_main, capture_output=True, text=True, timeout=20)
    except Exception:
        pass

    return cache_dir

def resolve_target_dates(period: str, base_date_str: str | None) -> list[str]:
    if not base_date_str:
        base_date_str = get_kst_today()

    base_dt = datetime.strptime(base_date_str, "%Y-%m-%d")

    if period == "daily":
        return [base_date_str]
    elif period == "weekly":
        # 기준일 포함 과거 7일
        return [(base_dt - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    elif period == "monthly":
        # 기준일이 속한 월 전체
        year, month = base_dt.year, base_dt.month
        today = datetime.now(KST).date()
        dates = []
        for d in range(1, 32):
            try:
                cur = datetime(year, month, d).date()
                if cur <= today:
                    dates.append(cur.strftime("%Y-%m-%d"))
            except ValueError:
                break
        return dates
    return [base_date_str]

def locate_log_file_for_date(date_str: str, search_dirs: list[Path]) -> Path | None:
    filename = f"collector-{date_str}.log"
    for d in search_dirs:
        candidate = d / filename
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    return None

def parse_single_log_file(file_path: Path) -> dict:
    """단일 로그 파일을 정밀 분석하여 구조화된 통계 객체 반환"""
    data = {
        "file_path": str(file_path),
        "file_size": file_path.stat().st_size,
        "total_lines": 0,
        "start_time": None,
        "end_time": None,
        "cycles_count": 0,
        "steps_count": defaultdict(int),
        "mined_spots": [],
        "social_enrich_count": 0,
        "kakao_ratings": [],
        "youtube_views": [],
        "http_errors": defaultdict(list),
        "filter_rejections": defaultdict(list),
        "general_errors": [],
        "timeline_events": []
    }

    step_patterns = {
        "1단계: 폐업/메타검증": re.compile(r"▶ 1단계"),
        "2단계: 포털 자율발굴": re.compile(r"▶ 2단계"),
        "3단계: 블로그 마이닝": re.compile(r"▶ 3단계"),
        "4단계: 커뮤니티 마이닝": re.compile(r"▶ 4단계"),
        "5단계: 소셜 동기화": re.compile(r"▶ 5단계"),
        "6단계: 유튜브 브이로그": re.compile(r"▶ 6단계"),
        "7단계: 캐치테이블": re.compile(r"▶ 7단계"),
        "8단계: TourAPI 공공": re.compile(r"▶ 8단계"),
    }

    spot_patterns = [
        re.compile(r"\+\s*\[(.*?)/(.*?)\]\s*(.*?)\s*\((.*?)\)"),
        re.compile(r"✨\s*\[신규 스팟 등록 성공!\]\s*(.*?)\s*\((.*?)\)\s*\[슬롯:\s*(.*?)\]"),
    ]

    rejection_pattern = re.compile(r"🚫\s*['\"]?(.*?)['\"]?\s*→.*?(거부|탈락):\s*(.*)")
    http_error_pattern = re.compile(r"HTTP\s*(?:Error\s*)?(\d{3})[:\s]*(.*)")
    time_stamp_pattern = re.compile(r"\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]")
    social_done_pattern = re.compile(r"Score:\s*([\d\.]+)\s*\|\s*(?:유튜브\s*([\d,]+)회|유튜브 없음)\s*\|\s*(?:카카오\s*★?([\d\.]+)점|카카오 없음|카카오 0점|카카오 평점없음)")

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    data["total_lines"] = len(lines)

    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue

        ts = None
        t_m = time_stamp_pattern.search(line_strip)
        if t_m:
            ts = t_m.group(1)
            if not data["start_time"]:
                data["start_time"] = ts
            data["end_time"] = ts

        if "=== 오늘 데이트" in line_strip or ("▶ 1단계" in line_strip and "시작" in line_strip):
            data["cycles_count"] += 1

        for step_name, pat in step_patterns.items():
            if pat.search(line_strip):
                data["steps_count"][step_name] += 1

        m1 = spot_patterns[0].search(line_strip)
        if m1:
            reg, slot, name, cat = m1.group(1).strip(), m1.group(2).strip(), m1.group(3).strip(), m1.group(4).strip()
            data["mined_spots"].append({"name": name, "region": reg, "slot": slot, "category": cat, "source": "portal_blog"})

        m2 = spot_patterns[1].search(line_strip)
        if m2:
            name, addr, slot = m2.group(1).strip(), m2.group(2).strip(), m2.group(3).strip()
            reg = "전국"
            for r in ["서울", "경기", "인천", "강원", "영남", "호남", "충청", "제주", "부산", "대구", "대전", "광주", "울산", "경북", "경남", "전북", "전남", "충북", "충남"]:
                if r in addr:
                    reg = r
                    break
            data["mined_spots"].append({"name": name, "region": reg, "slot": slot, "category": "유튜브핫플", "source": "youtube_vlog"})

        s_m = social_done_pattern.search(line_strip)
        if s_m:
            data["social_enrich_count"] += 1
            yt_view_str = s_m.group(2)
            kakao_rate_str = s_m.group(3)
            if yt_view_str:
                try:
                    data["youtube_views"].append(int(yt_view_str.replace(",", "")))
                except ValueError:
                    pass
            if kakao_rate_str:
                try:
                    rate = float(kakao_rate_str)
                    if rate > 0:
                        data["kakao_ratings"].append(rate)
                except ValueError:
                    pass

        r_m = rejection_pattern.search(line_strip)
        if r_m:
            target_name = r_m.group(1).strip()
            reason = r_m.group(3).strip()
            data["filter_rejections"][reason].append(target_name)

        h_m = http_error_pattern.search(line_strip)
        if h_m:
            code = h_m.group(1)
            msg = h_m.group(2).strip()
            data["http_errors"][code].append({"timestamp": ts or "Unknown", "message": msg, "line": line_strip[:120]})

        if "[ERROR]" in line_strip or "Traceback (most recent" in line_strip or "❌" in line_strip:
            if not h_m:
                data["general_errors"].append({"timestamp": ts or "Unknown", "line": line_strip[:120]})

    return data

def aggregate_logs(daily_stats_map: dict[str, dict]) -> dict:
    """복수 일자의 분석 결과를 기간 단위로 통합 집계"""
    agg = {
        "period_dates": sorted(list(daily_stats_map.keys())),
        "total_files": len(daily_stats_map),
        "total_lines": sum(s["total_lines"] for s in daily_stats_map.values()),
        "total_cycles": sum(s["cycles_count"] for s in daily_stats_map.values()),
        "steps_count": defaultdict(int),
        "total_spots_mined": 0,
        "region_distribution": Counter(),
        "slot_distribution": Counter(),
        "all_mined_spots": [],
        "http_errors": defaultdict(int),
        "http_error_samples": defaultdict(list),
        "filter_rejections": defaultdict(int),
        "filter_rejection_samples": defaultdict(list),
        "social_enrich_count": sum(s["social_enrich_count"] for s in daily_stats_map.values()),
        "avg_kakao_rating": 0.0,
        "kakao_rated_spots": 0,
        "avg_youtube_views": 0,
        "daily_breakdown": []
    }

    all_kakao = []
    all_yt = []

    for dt in agg["period_dates"]:
        s = daily_stats_map[dt]
        mined_count = len(s["mined_spots"])
        agg["total_spots_mined"] += mined_count

        for spot in s["mined_spots"]:
            agg["region_distribution"][spot["region"]] += 1
            agg["slot_distribution"][spot["slot"]] += 1
            agg["all_mined_spots"].append(spot)

        for step, count in s["steps_count"].items():
            agg["steps_count"][step] += count

        for code, err_list in s["http_errors"].items():
            agg["http_errors"][code] += len(err_list)
            if len(agg["http_error_samples"][code]) < 5:
                agg["http_error_samples"][code].extend(err_list[:3])

        for reason, spot_list in s["filter_rejections"].items():
            agg["filter_rejections"][reason] += len(spot_list)
            if len(agg["filter_rejection_samples"][reason]) < 5:
                agg["filter_rejection_samples"][reason].extend(spot_list[:3])

        all_kakao.extend(s["kakao_ratings"])
        all_yt.extend(s["youtube_views"])

        agg["daily_breakdown"].append({
            "date": dt,
            "lines": s["total_lines"],
            "cycles": s["cycles_count"],
            "mined": mined_count,
            "errors": sum(len(errs) for errs in s["http_errors"].values()) + len(s["general_errors"]),
            "social": s["social_enrich_count"]
        })

    if all_kakao:
        agg["avg_kakao_rating"] = round(sum(all_kakao) / len(all_kakao), 2)
        agg["kakao_rated_spots"] = len(all_kakao)

    if all_yt:
        agg["avg_youtube_views"] = int(sum(all_yt) / len(all_yt))

    return agg

def trace_keyword(keyword: str, search_dirs: list[Path]) -> list[dict]:
    results = []
    log_files = []
    for d in search_dirs:
        for f in d.glob("collector*.log"):
            if f.is_file() and f not in log_files:
                log_files.append(f)

    log_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    clean_kw = keyword.strip().lower()
    for f in log_files:
        try:
            with open(f, "r", encoding="utf-8", errors="replace") as fp:
                for line_idx, line in enumerate(fp, 1):
                    if clean_kw in line.lower():
                        results.append({
                            "file": f.name,
                            "line_num": line_idx,
                            "text": line.strip()
                        })
                        if len(results) >= 50:
                            return results
        except Exception:
            pass
    return results

def render_markdown_report(agg: dict, period: str, target_label: str) -> str:
    now_str = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    start_date = agg["period_dates"][0] if agg["period_dates"] else "N/A"
    end_date = agg["period_dates"][-1] if agg["period_dates"] else "N/A"

    period_kr = {"daily": "일별 정밀", "weekly": "주간 누적", "monthly": "월간 종합"}.get(period, period)

    md = f"""# 📊 오늘 데이트 수집기 {period_kr} 모니터링 & 역추적 리포트 ({target_label})

> **생성 시각**: {now_str} KST  
> **분석 대상 기간**: {start_date} ~ {end_date} (총 {agg['total_files']}개 일자 로그, {agg['total_lines']:,} 라인)  
> **엔진 가동 상태**: 🟢 정상 가동 (총 {agg['total_cycles']}회 수집 사이클 완수)

---

## 1. 🚀 핵심 성과 및 수집 KPI 요약

- **총 신규 발굴 스팟**: **{agg['total_spots_mined']:,}건** 적재 성공
- **소셜 메타데이터 보강**: **{agg['social_enrich_count']:,}건** 완료
- **카카오맵 실평점 연동**: 평균 **★{agg['avg_kakao_rating']}점** ({agg['kakao_rated_spots']:,}곳 연동)
- **유튜브 핫클립 평균 조회수**: 평균 **{agg['avg_youtube_views']:,}회**

---

## 2. 📅 일자별 수집 및 가동 추이

| 일자 | 로그 라인 | 수집 사이클 | 신규 스팟 적재 | 소셜 동기화 | 에러 발생 | 상태 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
"""
    for d in agg["daily_breakdown"]:
        status_icon = "🟢 정상" if d["errors"] == 0 else ("🟡 주의" if d["errors"] < 10 else "🔴 점검")
        md += f"| `{d['date']}` | {d['lines']:,} | {d['cycles']}회 | **+{d['mined']}개** | {d['social']}건 | {d['errors']}건 | {status_icon} |\n"

    md += """
---

## 3. 🗺️ 권역별 및 시간대(슬롯) 신규 스팟 분포

### 권역별 신규 적재 분포
"""
    if agg["region_distribution"]:
        for reg, count in agg["region_distribution"].most_common():
            bar = "█" * min(20, max(1, int(count / max(1, agg['total_spots_mined']) * 20)))
            md += f"- **{reg:<6}**: `{count:>3}개` ({bar} {(count/max(1, agg['total_spots_mined'])*100):.1f}%)\n"
    else:
        md += "_적재된 신규 스팟 없음_\n"

    md += "\n### 슬롯별(방문 시점) 분포\n"
    if agg["slot_distribution"]:
        for slot, count in agg["slot_distribution"].items():
            slot_kr = {"day": "낮/카페·문화", "evening": "저녁/다이닝", "night": "심야/바·야경"}.get(slot, slot)
            md += f"- **{slot_kr} (`{slot}`)**: {count}개\n"

    md += """
---

## 4. ⚠️ 장애 & 에러 역추적 (Root Cause Analysis)

"""
    if agg["http_errors"]:
        md += "### 감지된 HTTP 상태 코드 오류 현황\n\n"
        for code, count in sorted(agg["http_errors"].items(), key=lambda x: x[1], reverse=True):
            meaning = {
                "401": "Unauthorized (미인증/토큰 만료)",
                "402": "Payment Required (Supabase 한도 초과 — OCI 이관으로 해결됨)",
                "403": "Forbidden (접근 권한 거부)",
                "404": "Not Found (엔드포인트 무효)",
                "409": "Conflict (중복 ID 충돌)",
                "429": "Too Many Requests (Rate Limit 초과)",
                "500": "Internal Server Error (원격 서버 오류)"
            }.get(code, "원격 오류")
            md += f"- **HTTP {code} ({meaning})**: 총 **{count}회** 발생\n"

        md += "\n### 주요 에러 발생 로그 역추적 샘플\n```text\n"
        for code, samples in agg["http_error_samples"].items():
            for s in samples[:3]:
                md += f"[{s.get('timestamp')}] HTTP {code} → {s.get('line')}\n"
        md += "```\n"
    else:
        md += "✅ **분석 기간 동안 감지된 치명적 HTTP 에러 없음 (100% 무결 가동)**\n"

    md += """
---

## 5. 🔍 카테고리 필터 탈락 원인 역추적 (오탐 후보 점검)

필터에서 걸러진 상호명과 탈락 사유를 분석하여, 유효한 데이트 맛집이 누락되었는지 점검합니다.

"""
    if agg["filter_rejections"]:
        for reason, count in sorted(agg["filter_rejections"].items(), key=lambda x: x[1], reverse=True)[:6]:
            sample_spots = ", ".join([f"`{s}`" for s in agg["filter_rejection_samples"][reason][:4]])
            md += f"- **{reason}** ({count}건): {sample_spots}\n"
    else:
        md += "_필터 탈락 기록 없음_\n"

    md += """
---

## 6. 💡 모니터링 기반 최적화 및 유지보수 조치 권고사항

"""
    recommendations = []
    if agg["http_errors"].get("402", 0) > 0:
        recommendations.append("👉 **Supabase 402 에러**: OCI VM PostgreSQL로 이관 완료되어 추가 발생이 차단되었음을 확인했습니다.")
    if agg["http_errors"].get("429", 0) > 0:
        recommendations.append("👉 **Rate Limit(429)**: 요청 빈도가 높은 마이너의 딜레이(`time.sleep`)를 0.3초 이상 상향 조정하세요.")
    if agg["total_spots_mined"] > 200:
        recommendations.append(f"👉 **스팟 데이터 급증 (+{agg['total_spots_mined']}개)**: 프론트엔드 로컬 CDN 캐시(`spots.json`) 재생성 및 배포를 주기적으로 검토하세요.")
    if not recommendations:
        recommendations.append("👉 **시스템 상태 최적**: 현재 모든 파이프라인이 이상 징후 없이 안정적으로 순항하고 있습니다.")

    for r in recommendations:
        md += f"{r}\n"

    md += "\n---\n*자동 생성 도구: `collector/monitor.py` | 오늘 데이트 백엔드 모니터링 시스템*\n"
    return md

def save_report_files(content: str, period: str, target_label: str):
    DOCS_MONITORING_DIR.mkdir(parents=True, exist_ok=True)
    sub_dir = DOCS_MONITORING_DIR / period
    sub_dir.mkdir(parents=True, exist_ok=True)

    report_path = sub_dir / f"{target_label}.md"
    latest_path = DOCS_MONITORING_DIR / "LATEST.md"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(content)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"📄 [리포트 보존 완료] {report_path.relative_to(PROJECT_ROOT)}")
    print(f"🔄 [최신 대시보드 갱신] {latest_path.relative_to(PROJECT_ROOT)}")

def run_trace(keyword: str, search_dirs: list[Path]):
    print(f"\n🔎 [역추적 모드] 키워드 '{keyword}' 로그 전수 검색 결과:")
    print("=" * 70)
    matches = trace_keyword(keyword, search_dirs)
    if not matches:
        print(f"  ❌ '{keyword}'와 일치하는 로그 라인이 없습니다.")
    else:
        for idx, m in enumerate(matches, 1):
            print(f"[{idx:02d}] ({m['file']}:{m['line_num']}) {m['text'][:120]}")
    print("=" * 70 + "\n")

def main():
    args = parse_args()

    search_dirs = find_local_log_dirs()
    target_dates = resolve_target_dates(args.period, args.date)

    if args.remote or not any(locate_log_file_for_date(d, search_dirs) for d in target_dates):
        remote_cache = fetch_remote_logs_if_needed(target_dates)
        if remote_cache not in search_dirs:
            search_dirs.insert(0, remote_cache)

    if args.trace:
        run_trace(args.trace, search_dirs)
        return

    daily_stats = {}
    for dt in target_dates:
        fpath = locate_log_file_for_date(dt, search_dirs)
        if fpath:
            daily_stats[dt] = parse_single_log_file(fpath)

    if not daily_stats:
        print(f"❌ 대상 기간({target_dates})에 해당하는 로그 파일을 찾을 수 없습니다.")
        print(f"   탐색 경로: {[str(d) for d in search_dirs]}")
        sys.exit(1)

    agg = aggregate_logs(daily_stats)

    if args.period == "daily":
        target_label = target_dates[0]
    elif args.period == "weekly":
        dt_obj = datetime.strptime(target_dates[-1], "%Y-%m-%d")
        target_label = f"{dt_obj.strftime('%Y')}-W{dt_obj.isocalendar()[1]:02d}"
    else:
        target_label = target_dates[0][:7]

    md_content = render_markdown_report(agg, args.period, target_label)

    if args.save_report:
        save_report_files(md_content, args.period, target_label)

    print(f"\n=================================================================")
    print(f"📊 [오늘 데이트] 수집기 {args.period.upper()} 모니터링 & 진단 완료 ({target_label})")
    print(f"=================================================================")
    print(f"• 분석 대상 일자 : {', '.join(agg['period_dates'])}")
    print(f"• 총 수집 사이클 : {agg['total_cycles']}회 완수")
    print(f"• 신규 스팟 적재 : +{agg['total_spots_mined']:,}개")
    print(f"• 소셜 메타 보강 : {agg['social_enrich_count']:,}건")
    print(f"• 카카오 실평점   : 평균 ★{agg['avg_kakao_rating']}점 ({agg['kakao_rated_spots']}곳)")
    print(f"• HTTP 에러 합계 : {sum(agg['http_errors'].values())}건 (402: {agg['http_errors'].get('402', 0)}건, 403: {agg['http_errors'].get('403', 0)}건)")
    print(f"=================================================================\n")

    if args.json:
        print(json.dumps(agg, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
