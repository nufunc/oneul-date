#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 점진적 소셜 메타데이터 동기화 워커 (Batch Social Enricher)
Supabase DB의 스팟들을 순차적으로 읽어 유튜브 핫클립 및 카카오맵 메타데이터를 수집하고
social_links, metrics, hot_score를 안전하게 업데이트합니다.
"""

import urllib.request
import urllib.parse
import json
import time
import sys
import os
from datetime import datetime, timezone, timedelta

from miners.youtube_miner import search_youtube_hotclip
from miners.kakaomap_miner import search_kakaomap_place
from score_engine import calculate_hot_score

def run_social_enrichment(supabase_url: str, service_key: str, batch_size: int = 15):
    """
    metrics->last_synced_at이 없거나 오래된 스팟을 batch_size만큼 가져와 소셜 데이터를 보강합니다.
    """
    if not supabase_url or not service_key:
        print("⚠️ Supabase URL 또는 키가 없어 소셜 동기화를 건너뜁니다.")
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 아직 social_links가 없거나 동기화가 가장 오래된 스팟 우선 순환 조회
    fetch_url = f"{supabase_url}/rest/v1/spots?select=id,name,location,area,verified,social_links,metrics&is_closed=eq.false&order=metrics->>last_synced_at.asc.nullsfirst,id.asc&limit={batch_size}"
    
    try:
        req = urllib.request.Request(fetch_url, headers=api_headers)
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status != 200:
                print(f"❌ DB 조회 실패 (HTTP {res.status})")
                return
            spots_to_enrich = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ DB 조회 중 오류: {e}")
        return

    if not spots_to_enrich:
        print("✅ 업데이트 대상 스팟이 없습니다.")
        return

    print(f"🔄 총 {len(spots_to_enrich)}개 스팟 소셜 메타데이터 보강 시작...\n")

    enriched_count = 0
    seen_spot_ids = set()

    for s in spots_to_enrich:
        spot_id = s.get("id")
        name = s.get("name", "").strip()
        location = s.get("location", "") or s.get("area", "")
        is_verified = bool(s.get("verified", False))

        if not name or spot_id in seen_spot_ids:
            continue

        seen_spot_ids.add(spot_id)

        # 단독 지명 및 오염된 일반명사는 소셜 API 조회 없이 자동 격리 처리
        if len(name) <= 2 or name in ["서울", "경기", "인천", "강원", "충청", "영남", "호남", "제주", "부산", "대구", "울산", "광주", "대전", "세종", "한남", "압구정", "카페", "곱창전골"]:
            try:
                quarantine_url = f"{supabase_url}/rest/v1/spots?id=eq.{spot_id}"
                patch_payload = json.dumps({"is_closed": True, "updated_at": datetime.now(timezone.utc).isoformat()}).encode('utf-8')
                q_req = urllib.request.Request(quarantine_url, data=patch_payload, headers=api_headers, method='PATCH')
                with urllib.request.urlopen(q_req, timeout=5):
                    pass
            except Exception:
                pass
            continue

        # 최근 3일(72시간) 이내에 이미 동기화된 스팟은 스킵 (불필요한 소셜 API 쿼리 낭비 방지)
        s_metrics = s.get("metrics") or {}
        last_synced = s_metrics.get("last_synced_at")
        if last_synced:
            try:
                sync_dt = datetime.fromisoformat(last_synced.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) - sync_dt < timedelta(days=3):
                    continue
            except Exception:
                pass

        print(f"  🔍 '{name}' ({location}) 소셜 마이닝 중...", end=" ", flush=True)

        try:
            # 1. 유튜브 핫클립 탐색
            yt_data = search_youtube_hotclip(name, location)
            time.sleep(0.5)

            # 2. 카카오맵 평점 탐색
            kakao_data = search_kakaomap_place(name, location)
            time.sleep(0.5)

            # 3. 종합 스코어 및 JSONB 조립 (기존 인스타/블로그 등 social_links 보존)
            hot_score, new_social, metrics = calculate_hot_score(yt_data, kakao_data, is_verified)
            existing_social = s.get("social_links") or {}
            merged_social = {**existing_social, **new_social}

            # 4. 스팟 설명(summary) 불량 감지 시 자동 교정
            from fix_spot_summaries import is_bad_summary, generate_curated_summary
            current_summary = s.get("summary", "")
            patch_data = {
                "social_links": merged_social,
                "metrics": metrics,
                "hot_score": hot_score,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if is_bad_summary(current_summary, name):
                curated_sum = generate_curated_summary(
                    name,
                    s.get("category", ""),
                    s.get("region", ""),
                    s.get("area", "") or location,
                    s.get("signature_items") or []
                )
                patch_data["summary"] = curated_sum

            # 5. Supabase DB PATCH 업데이트
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{spot_id}"
            payload = json.dumps(patch_data).encode('utf-8')

            patch_req = urllib.request.Request(patch_url, data=payload, headers=api_headers, method='PATCH')
            with urllib.request.urlopen(patch_req, timeout=5) as p_res:
                if p_res.status in (200, 204):
                    views_info = f"유튜브 {yt_data.get('views', 0):,}회" if yt_data else "유튜브 없음"
                    kakao_info = f"카카오 {kakao_data.get('rating', 0)}점" if kakao_data else "카카오 없음"
                    print(f"✅ 완료! (Score: {hot_score} | {views_info} | {kakao_info})")
                    enriched_count += 1
                else:
                    print(f"⚠️ 저장 실패 ({p_res.status})")

        except Exception as e:
            print(f"❌ 실패 ({e})")

        # 안전한 딜레이 (Rate Limit 방지)
        time.sleep(1.2)

    print(f"🎉 [소셜 메타데이터 동기화 완료] 총 {enriched_count}/{len(spots_to_enrich)}개 스팟 업데이트 성공!")
    return enriched_count
