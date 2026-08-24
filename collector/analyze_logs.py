#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 수집기 로그 미비점 & 성능 분석기 (analyze_logs.py)

수집기 로그(collector.log 또는 collector-YYYY-MM-DD.log)를 파싱하여
1) 마이너 단계별 수집량 및 전환율
2) 예외 및 HTTP 에러(429 Rate Limit, 403, Timeout 등)
3) 비핫플/소외 지역(가산, 구로 등) 탐색 현황
4) 카테고리 필터 탈락 사유 및 품질 미비점
을 종합 진단하고 개선 액션 아이템을 리포트합니다.
"""

import os
import sys
import re
import json
import argparse
from datetime import datetime
from collections import defaultdict, Counter

def parse_args():
    parser = argparse.ArgumentParser(description="오늘 데이트 수집기 로그 미비점 분석 도구")
    parser.add_argument("--file", "-f", help="분석할 로그 파일 경로 (기본: /mnt/data/logs/collector.log 또는 ./logs/collector.log)")
    parser.add_argument("--date", "-d", help="분석할 특정 날짜 (예: 2026-08-23)")
    parser.add_argument("--lines", "-n", type=int, default=0, help="최근 N줄만 분석 (기본: 0, 전체 분석)")
    parser.add_argument("--report-md", "-m", help="마크다운 리포트로 저장할 파일 경로")
    return parser.parse_args()

def find_log_file(custom_path=None, date_str=None):
    if custom_path and os.path.exists(custom_path):
        return custom_path

    candidates = [
        "/mnt/data/logs",
        os.path.join(os.path.dirname(__file__), "data", "logs"),
        os.path.join(os.path.dirname(__file__), "logs"),
        os.path.join(os.path.dirname(__file__)),
        os.getcwd()
    ]

    if date_str:
        filename = f"collector-{date_str}.log"
        for base in candidates:
            p = os.path.join(base, filename)
            if os.path.exists(p):
                return p

    for base in candidates:
        p = os.path.join(base, "collector.log")
        if os.path.exists(p):
            return p

    return None

def analyze_logs(log_path: str, max_lines: int = 0):
    if not log_path or not os.path.exists(log_path):
        print(f"❌ 로그 파일을 찾을 수 없습니다: {log_path}")
        return None

    stats = {
        "log_path": log_path,
        "total_lines": 0,
        "start_time": None,
        "end_time": None,
        "cycles_count": 0,
        "steps_count": defaultdict(int),
        "mined_spots": defaultdict(list),
        "gap_detections": [],
        "errors": defaultdict(int),
        "http_errors": defaultdict(int),
        "rate_limits": 0,
        "filter_rejections": defaultdict(int),
        "recent_error_samples": [],
    }

    step_patterns = {
        "1단계: 메타보강/폐업검증": re.compile(r"▶ 1단계"),
        "2단계: 포털 자율발굴": re.compile(r"▶ 2단계"),
        "3단계: 블로그 마이닝": re.compile(r"▶ 3단계"),
        "4단계: 커뮤니티 마이닝": re.compile(r"▶ 4단계"),
        "5단계: 소셜 동기화": re.compile(r"▶ 5단계"),
        "6단계: 유튜브 브이로그": re.compile(r"▶ 6단계"),
        "7단계: 캐치테이블": re.compile(r"▶ 7단계"),
        "8단계: TourAPI 공공": re.compile(r"▶ 8단계"),
    }

    spot_detail_pattern = re.compile(r"\+\s*\[(.*?)\]\s*(.*?)\s*\((.*?)\)")
    error_pattern = re.compile(r"\[ERROR\]|(❌.*?오류)|(Exception:)|(Error:)")
    http_error_pattern = re.compile(r"HTTP\s*(?:Error\s*)?(\d{3})")
    gap_detect_pattern = re.compile(r"\[DB 커버리지 갭 감지\]\s*(.*)")
    cycle_start_pattern = re.compile(r"===.*?데이터 엔진.*?가동|▶ 1단계")
    time_stamp_pattern = re.compile(r"\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]")

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
        if max_lines > 0:
            lines = lines[-max_lines:]

        stats["total_lines"] = len(lines)

        for line in lines:
            t_match = time_stamp_pattern.search(line)
            if t_match:
                ts = t_match.group(1)
                if not stats["start_time"]:
                    stats["start_time"] = ts
                stats["end_time"] = ts

            if cycle_start_pattern.search(line) and "1단계" in line:
                stats["cycles_count"] += 1

            for step_name, pat in step_patterns.items():
                if pat.search(line):
                    stats["steps_count"][step_name] += 1

            gap_m = gap_detect_pattern.search(line)
            if gap_m:
                stats["gap_detections"].append(gap_m.group(1).strip())

            spot_m = spot_detail_pattern.search(line)
            if spot_m:
                region_slot = spot_m.group(1).strip()
                name = spot_m.group(2).strip()
                category = spot_m.group(3).strip()
                stats["mined_spots"][region_slot].append({"name": name, "category": category})

            if error_pattern.search(line):
                clean_err = line.strip()
                stats["errors"][clean_err[:80]] += 1
                if len(stats["recent_error_samples"]) < 10:
                    stats["recent_error_samples"].append(clean_err)

            http_m = http_error_pattern.search(line)
            if http_m:
                code = http_m.group(1)
                stats["http_errors"][code] += 1
                if code == "429":
                    stats["rate_limits"] += 1

    return stats

def print_report(stats: dict):
    if not stats:
        return

    print("\n" + "=" * 65)
    print("📊 [오늘 데이트] 수집기 로그 미비점 & 성능 정밀 진단 리포트")
    print("=" * 65)
    print(f"📁 분석 대상 파일  : {stats['log_path']}")
    print(f"🕒 분석 로그 구간  : {stats['start_time'] or 'N/A'} ~ {stats['end_time'] or 'N/A'}")
    print(f"📄 총 분석 라인 수: {stats['total_lines']:,} 줄 | 감지된 수집 사이클: {stats['cycles_count']} 회")
    print("-" * 65)

    print("\n[1] 🚀 마이너 단계별 실행 횟수")
    for step, count in stats["steps_count"].items():
        print(f"  • {step:<20} : {count:>4} 회 실행")

    total_mined = sum(len(spots) for spots in stats["mined_spots"].values())
    print(f"\n[2] ✨ 신규 발굴 스팟 적재 현황 (총 {total_mined}건)")
    if stats["mined_spots"]:
        for region_slot, spots in stats["mined_spots"].items():
            sample_names = ", ".join([s["name"] for s in spots[:3]])
            print(f"  • [{region_slot}] : {len(spots)}개 ({sample_names}{'...' if len(spots)>3 else ''})")
    else:
        print("  • (로그 내 신규 스팟 등록 상세 라인이 없거나 0건입니다)")

    print(f"\n[3] ⚖️ DB 커버리지 갭(소외지역) 탐색 로그")
    if stats["gap_detections"]:
        for g in stats["gap_detections"][-3:]:
            print(f"  • {g}")
    else:
        print("  • 갭 감지 모듈 최근 가동 이력 대기 중")

    total_errors = sum(stats["errors"].values())
    print(f"\n[4] ⚠️ 미비점 & 장애 진단 (총 {total_errors}건 에러/경고)")
    if stats["http_errors"]:
        print("  [HTTP 상태 코드 오류]")
        for code, count in stats["http_errors"].items():
            meaning = "Rate Limit (요청 한도 초과)" if code == "429" else ("Forbidden (접근 거부)" if code == "403" else "서버/클라이언트 오류")
            print(f"    - HTTP {code} ({meaning}): {count} 회 발생")

    if stats["recent_error_samples"]:
        print("  [주요 발생 에러 샘플 TOP 5]")
        for idx, err in enumerate(stats["recent_error_samples"][:5], 1):
            print(f"    {idx}. {err[:110]}")
    else:
        print("  • 특이 에러 없이 무결하게 가동 중입니다.")

    print("\n[5] 💡 AI 수집기 최적화 액션 아이템")
    if stats["rate_limits"] > 0:
        print("  👉 [Rate Limit 경고] HTTP 429 에러가 발생했습니다. 해당 API 요청 간격(sleep)을 0.3~0.5초 늘리는 것을 권장합니다.")
    if total_mined == 0 and stats["cycles_count"] > 0:
        print("  👉 [전환율 주의] 사이클은 돌았으나 신규 적재가 0건입니다. DB 중복 검사 조건이나 카테고리 필터 기준을 점검하세요.")
    print("  👉 [무중단 유지] 일자별 collector-YYYY-MM-DD.log 분할 저장으로 장기 로그를 추적하세요.")
    print("=" * 65 + "\n")

def generate_markdown_report(stats: dict, output_path: str):
    if not stats or not output_path:
        return

    md_content = f"""# 📊 오늘 데이트 수집기 로그 미비점 & 성능 정밀 진단 리포트

> **분석 시각**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
> **로그 파일**: `{stats['log_path']}`  
> **분석 구간**: {stats['start_time'] or 'N/A'} ~ {stats['end_time'] or 'N/A'} ({stats['total_lines']:,} lines, {stats['cycles_count']} cycles)

---

## 1. 🚀 마이너 단계별 실행 통계

| 단계 | 실행 횟수 | 상태 |
| :--- | :---: | :--- |
"""
    for step, count in stats["steps_count"].items():
        md_content += f"| {step} | {count}회 | 정상 가동 |\n"

    md_content += f"""
---

## 2. ✨ 신규 발굴 스팟 적재 현황 (총 {sum(len(s) for s in stats['mined_spots'].values())}건)

"""
    if stats["mined_spots"]:
        for region_slot, spots in stats["mined_spots"].items():
            names = ", ".join([f"`{s['name']}`" for s in spots[:5]])
            md_content += f"- **[{region_slot}]**: {len(spots)}곳 ({names})\n"
    else:
        md_content += "_신규 등록된 스팟 데이터 없음 (기존 DB 유지)_\n"

    md_content += f"""
---

## 3. ⚠️ 미비점 및 에러 진단 (총 {sum(stats['errors'].values())}건)

- **HTTP 429 (Rate Limit)**: {stats['rate_limits']}회
"""
    for code, count in stats["http_errors"].items():
        md_content += f"- **HTTP {code}**: {count}회\n"

    if stats["recent_error_samples"]:
        md_content += "\n### 주요 에러 로그 샘플\n```text\n"
        for err in stats["recent_error_samples"][:5]:
            md_content += f"{err}\n"
        md_content += "```\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"📄 마크다운 리포트 저장 완료: {output_path}")

def main():
    args = parse_args()
    log_file = find_log_file(args.file, args.date)
    if not log_file:
        print("❌ 분석할 로그 파일을 찾지 못했습니다. /mnt/data/logs 또는 collector/logs 디렉토리를 확인하세요.")
        sys.exit(1)

    stats = analyze_logs(log_file, args.lines)
    if stats:
        print_report(stats)
        if args.report_md:
            generate_markdown_report(stats, args.report_md)

if __name__ == "__main__":
    main()
