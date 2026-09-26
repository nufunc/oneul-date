#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 네이버 캡차 오탐으로 잘못 폐업 격리된 스팟 복구 스크립트

배경: supabase_worker.py의 search_naver()가 부르는 네이버 지도 비공식 API가
ncaptcha 봇 차단 게이트를 걸어(2026-09-21 실측 확인) "3회 연속 검색 실패"가
실제 폐업이 아니라 캡차 차단 때문에 발생했다. is_closed=true가 되면 이후
재검증 쿼리(is_closed=eq.false)에서 영구 제외돼 자연 복구가 안 된다.

대상 조건: is_closed=true AND fail_count>=3 AND 최근 RECOVERY_WINDOW_DAYS일
이내에 갱신됨. 이 조건은 정상 중복 정리(cleanup_spots_and_dedup.py가 닫은
것들은 fail_count=0으로 남는다)나 오래 전부터 진짜 폐업 상태였던 스팟과
겹치지 않는다(실측으로 확인: "테르메덴"/"정식당" 등 중복 정리로 닫힌
스팟은 전부 fail_count=0).
"""

import os
import sys
import json
import urllib.request
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

RECOVERY_WINDOW_DAYS = 9


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_recovery_candidates():
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RECOVERY_WINDOW_DAYS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    headers = build_headers()
    page_size = 1000
    offset = 0
    rows = []
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/spots?select=id,name,category,fail_count,updated_at,source"
               f"&is_closed=eq.true&fail_count=gte.3&updated_at=gte.{cutoff}"
               f"&order=id.asc&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as res:
            batch = json.loads(res.read().decode('utf-8'))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    # 사람이 정리했거나 병합으로 닫은 행은 캡차 차단 오폐업이 아니므로 되열지 않는다.
    # note를 보지 않아 2026-09-27 기준 fail_count>=3 닫힌 행 45건(closed 44·merged_into 1)이 되열릴 수 있었다
    def _closed_on_purpose(row):
        note = ((row.get("source") or {}).get("note") or "") if isinstance(row.get("source"), dict) else ""
        return "merged_into" in note or "closed" in note
    return [r for r in rows if not _closed_on_purpose(r)]


def reopen_spots_batch(spot_ids):
    if not spot_ids:
        return True
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    chunk_size = 50
    success = True
    for i in range(0, len(spot_ids), chunk_size):
        chunk = spot_ids[i:i + chunk_size]
        ids_param = ",".join(str(sid) for sid in chunk)
        url = f"{SUPABASE_URL}/rest/v1/spots?id=in.({ids_param})"
        payload = json.dumps({"is_closed": False, "fail_count": 0}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
        try:
            with urllib.request.urlopen(req) as res:
                if res.status not in (200, 204):
                    success = False
        except Exception as e:
            print(f"❌ PATCH 오류: {e}")
            success = False
    return success


def main():
    print(f"🔍 [복구 대상 조회] is_closed=true AND fail_count>=3 AND 최근 {RECOVERY_WINDOW_DAYS}일 이내 갱신")
    candidates = fetch_recovery_candidates()
    print(f"  • 복구 대상: {len(candidates):,}개")

    if not candidates:
        print("복구할 대상이 없습니다.")
        return

    print("▶ 대표 샘플 10선:")
    for c in candidates[:10]:
        print(f"  - [{c['id']}] {c['name']} (카테고리: {c.get('category') or '없음'}, fail_count: {c['fail_count']}, updated_at: {c['updated_at']})")

    ids = [c["id"] for c in candidates]
    print(f"\n⚡ [복구 실행] {len(ids):,}개 스팟 is_closed=false, fail_count=0으로 되돌리는 중...")
    if reopen_spots_batch(ids):
        print(f"🎉 [복구 완료] {len(ids):,}개 스팟을 다시 열었습니다.")
    else:
        print("❌ 일부 스팟 복구 중 오류가 발생했습니다.")


if __name__ == "__main__":
    main()
