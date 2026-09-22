#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — "전남광주통합특별시" 오염 주소 일괄 교정

카카오 비공식 검색이 광주·전남 주소에 실존하지 않는 시도 접두어
"전남광주통합특별시"를 반환하는 경우가 있어(2026-09-22 확인, 데이터
큐레이션 감사 발견), 이미 저장된 활성 스팟 주소에도 남아 있다.
supabase_worker.fix_garbled_sido_prefix로 향후 신규 수집분은 막았고,
이 스크립트는 기존 행을 일괄 교정한다.

기본은 드라이런. --execute 를 줘야 실제 PATCH.
"""

import os
import sys
import json
import urllib.request
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env, fix_garbled_sido_prefix

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

PREFIX = "전남광주통합특별시"


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_targets():
    headers = build_headers()
    page_size = 1000
    offset = 0
    rows = []
    while True:
        encoded_prefix = urllib.parse.quote(PREFIX)
        url = (f"{SUPABASE_URL}/rest/v1/spots?select=id,name,address"
               f"&address=like.*{encoded_prefix}*&order=id.asc&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as res:
            chunk = json.loads(res.read().decode("utf-8"))
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def patch_address(spot_id, new_address):
    headers = build_headers({"Content-Type": "application/json", "Prefer": "return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    payload = json.dumps({"address": new_address}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    print(f"🔍 [대상 조회] address LIKE '*{PREFIX}*'")
    targets = fetch_targets()
    print(f"  • 대상: {len(targets):,}개")

    fixed = [(t["id"], t["name"], t["address"], fix_garbled_sido_prefix(t["address"])) for t in targets]

    print("▶ 대표 샘플 5선:")
    for sid, name, old, new in fixed[:5]:
        print(f"  - [{sid}] {name}: {old!r} → {new!r}")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 고치려면 --execute 를 붙여 다시 실행하세요.")
        return

    print(f"\n⚡ [교정 실행] {len(fixed):,}건 PATCH 중...")
    success = 0
    for idx, (sid, name, old, new) in enumerate(fixed, 1):
        try:
            if patch_address(sid, new):
                success += 1
        except Exception as e:
            print(f"  ❌ PATCH 오류 id={sid}: {e}")
        if idx % 100 == 0 or idx == len(fixed):
            print(f"  진행률: {idx}/{len(fixed)} — 성공 {success}")

    print(f"\n🎉 [완료] {success}/{len(fixed)}건 성공")


if __name__ == "__main__":
    main()
