#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 스팟 한줄 설명(summary) 자동 감지 및 감성 큐레이션 교정기 (fix_spot_summaries.py)
=============================================================================
DB 내 스팟 설명(summary) 중:
1. 스팟명과 동일한 텍스트 (예: '오드 메종')
2. 영문 태그 나열 (예: 'trendy, luxury, healing', 'romantic, gourmet')
3. 5자 미만이거나 무의미한 텍스트 ('정보 없음', '설명이 없습니다')
를 자동으로 감지하여 Groq LLM 및 감각적인 데이트 매거진 스타일 한줄 소개로 교정(PATCH)합니다.
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse
from groq_helper import get_groq_api_key, call_groq_json

def is_bad_summary(summary: str, name: str) -> bool:
    """비정상적인 스팟 설명인지 엄격 판정"""
    if not summary:
        return True
    s = summary.strip()
    n = (name or "").strip()
    
    if len(s) < 5:
        return True
    if s.lower() == n.lower():
        return True
    if re.match(r"^[a-zA-Z_\s,]+$", s):  # 순수 영문 태그 나열
        return True
    
    bad_keywords = ["trendy", "romantic", "healing", "scenic", "luxury", "gourmet", "active", "cost_effective", "정보 없음", "설명이 없습니다"]
    if any(k in s.lower() for k in bad_keywords) and len(s) < 30:
        return True
    
    return False

def generate_curated_summary(name: str, cat: str, region: str, area: str, sig_items: list = None) -> str:
    """Groq LLM 또는 룰베이스를 통해 고감도 감성 한줄 소개 생성"""
    groq_key = get_groq_api_key()
    sig_text = f", 대표메뉴: {', '.join(sig_items[:2])}" if sig_items else ""
    
    if groq_key:
        prompt = (
            f"장소명: {name}, 카테고리: {cat}, 지역: {region} {area}{sig_text}\n\n"
            "위 장소의 분위기와 매력을 담아 2030 커플을 위한 감각적인 매거진 에디토리얼 한 줄 소개(20~35자 내외, 순수 한글 문장)를 작성해주세요.\n"
            "출력 스키마: {\"summary\": \"...\"}"
        )
        system_prompt = "You are a professional Korean dating magazine editor. Output only JSON."
        res = call_groq_json(prompt, system_prompt=system_prompt, max_tokens=200)
        if res and isinstance(res.get("summary"), str):
            clean = res["summary"].replace('"', '').replace("'", "").strip()
            if 10 <= len(clean) <= 50 and not is_bad_summary(clean, name):
                return clean

    # 룰베이스 스마트 폴백
    loc = area or region or ""
    cat_label = cat or "데이트 스팟"
    if sig_items and len(sig_items) > 0:
        return f"{loc}에서 대표 시그니처({sig_items[0]})와 함께 감각적인 시간을 만끽하기 좋은 {cat_label}입니다."
    return f"{loc} 골목의 남다른 감각과 로맨틱한 무드가 돋보이는 {cat_label}입니다."

def fix_all_spot_summaries(supabase_url: str, service_key: str, limit: int = 50):
    """DB 내 비정상 summary 스팟들을 조회하여 교정 수행"""
    if not supabase_url or not service_key:
        print("⚠️ Supabase 접속 정보가 없습니다.")
        return

    supabase_url = supabase_url.rstrip("/")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🔍 Supabase spots 테이블에서 설명(summary) 점검 대상 조회 중...")
    fetch_url = f"{supabase_url}/rest/v1/spots?select=id,name,category,region,area,summary,signature_items&is_closed=eq.false&limit=1000"

    try:
        req = urllib.request.Request(fetch_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as res:
            spots = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ DB 조회 실패: {e}")
        return

    bad_spots = [s for s in spots if is_bad_summary(s.get("summary", ""), s.get("name", ""))]
    print(f"📊 총 {len(spots)}개 스팟 중 교정 대상 {len(bad_spots)}개 감지됨.\n")

    if not bad_spots:
        print("🎉 모든 스팟의 설명이 이미 완벽하게 정제되어 있습니다!")
        return

    targets = bad_spots[:limit]
    print(f"🚀 이번 배치 {len(targets)}개 스팟 설명 교정 시작...\n")

    success_count = 0
    for s in targets:
        s_id = s.get("id")
        name = s.get("name", "")
        cat = s.get("category", "")
        region = s.get("region", "")
        area = s.get("area", "")
        old_sum = s.get("summary", "")
        sig = s.get("signature_items") or []

        new_sum = generate_curated_summary(name, cat, region, area, sig)
        print(f"  [{s_id}] '{name}'")
        print(f"    - 이전: {old_sum}")
        print(f"    + 교정: {new_sum}")

        # PATCH 업데이트
        patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
        payload = json.dumps({"summary": new_sum}).encode('utf-8')
        try:
            p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
            with urllib.request.urlopen(p_req, timeout=5) as p_res:
                if p_res.status in (200, 204):
                    print("    ✅ DB 업데이트 성공!\n")
                    success_count += 1
                else:
                    print(f"    ⚠️ DB 업데이트 실패 ({p_res.status})\n")
        except Exception as ex:
            print(f"    ❌ 오류 발생 ({ex})\n")

        time.sleep(1.0)

    print(f"🎉 [완료] 총 {success_count}/{len(targets)}개 스팟 설명 교정 완료!")

if __name__ == "__main__":
    sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    fix_all_spot_summaries(sb_url, sb_key, limit=30)
