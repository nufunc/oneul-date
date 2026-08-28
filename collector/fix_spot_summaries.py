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

# Windows 콘솔 인코딩 방어
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from groq_helper import get_groq_api_key, call_groq_json

def _load_env_credentials():
    search_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    ]
    for env_path in search_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VITE_SUPABASE_URL=") or line.startswith("SUPABASE_URL="):
                            os.environ["SUPABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("SUPABASE_SERVICE_KEY=") or line.startswith("SUPABASE_KEY=") or line.startswith("VITE_SUPABASE_ANON_KEY="):
                            os.environ["SUPABASE_SERVICE_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass

def is_bad_summary(summary: str, name: str) -> bool:
    """비정상적이거나 판박이 템플릿인 스팟 설명인지 엄격 판정"""
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
    
    bad_keywords = [
        "trendy", "romantic", "healing", "scenic", "luxury", "gourmet", "active", "cost_effective",
        "정보 없음", "설명이 없습니다", "골목의 남다른 감각", "남다른 감각과 로맨틱한 무드가"
    ]
    if any(k in s.lower() for k in bad_keywords):
        return True
    
    return False

def generate_curated_summary(name: str, cat: str, region: str, area: str, sig_items: list = None, spot_id: int = 0) -> str:
    """Groq LLM 또는 풍부한 룰베이스 풀을 통해 고감도 감성 한줄 소개 생성"""
    groq_key = get_groq_api_key()
    sig_text = f", 대표메뉴: {', '.join(sig_items[:2])}" if sig_items else ""
    loc = area or region or ""
    cat_label = cat or "데이트 스팟"
    
    if groq_key:
        prompt = (
            f"장소명: {name}, 카테고리: {cat_label}, 지역: {region} {loc}{sig_text}\n\n"
            "위 장소의 고유한 매력과 분위기를 담아 2030 커플을 위한 감각적인 매거진 에디토리얼 한 줄 소개(20~35자 내외, 다정하고 세련된 한국어 추천 문장)를 작성해주세요.\n"
            "규칙: '~한다' 문어체 종결 금지. '~하기 좋은 곳이에요', '~의 매력을 오롯이 즐겨보세요', '~을 다정하게 만끽해보세요' 등 다정한 추천 어조 사용.\n"
            "JSON 형식으로만 응답: {\"summary\": \"...\"}"
        )
        system_prompt = "You are a professional Korean dating magazine editor. Output only valid JSON."
        res = call_groq_json(prompt, system_prompt=system_prompt, model="groq/compound-mini", max_tokens=200)
        if res and isinstance(res.get("summary"), str):
            clean = res["summary"].replace('"', '').replace("'", "").strip()
            if 10 <= len(clean) <= 50 and not is_bad_summary(clean, name):
                return clean

    # 룰베이스 풍부한 폴백 풀
    id_hash = abs(spot_id or sum(ord(c) for c in name))
    loc_prefix = f"{loc}에서 " if loc else ""
    loc_in = f"{loc}의 " if loc else ""
    
    if sig_items and len(sig_items) > 0:
        sig_templates = [
            f"{loc_prefix}대표 시그니처 '{sig_items[0]}'와 함께 감각적인 분위기를 즐기기 좋은 곳이에요.",
            f"{loc_in}시그니처 '{sig_items[0]}'의 특별한 풍미를 다정하게 만끽할 수 있는 명소예요.",
            f"{loc_prefix}정성 가득한 '{sig_items[0]}'와 함께 특별한 미식 데이트를 즐겨보세요.",
        ]
        return sig_templates[id_hash % len(sig_templates)]

    cat_lower = cat_label.lower()
    if any(k in cat_lower for k in ["카페", "커피", "베이커리", "디저트", "찻집"]):
        pool = [
            f"{loc_prefix}향긋한 커피와 달콤한 디저트로 여유로운 대화를 나누기 좋은 감성 카페예요.",
            f"{loc_in}따스한 채광과 아늑한 인테리어 속에서 둘만의 힐링을 누릴 수 있는 곳이에요.",
            f"{loc_prefix}갓 구운 빵의 고소한 향기와 감각적인 무드가 매력적인 베이커리 명소예요.",
            f"{loc_in}감각적인 공간에서 특별한 티타임을 즐기며 쉬어가기 좋은 데이트 코스예요.",
        ]
        return pool[id_hash % len(pool)]

    if any(k in cat_lower for k in ["주점", "와인", "칵테일", "이자카야", "포차", "펍", "호프", "바"]):
        pool = [
            f"{loc_in}은은한 조명 아래에서 로맨틱한 와인과 분위기를 만끽하기 좋은 다이닝 바예요.",
            f"{loc_prefix}맛깔스러운 안주와 함께 다정하게 술잔을 기울이기 좋은 감성 주점이에요.",
            f"{loc_in}감각적인 음악과 무드 속에서 둘만의 저녁 데이트를 완성하기 좋은 핫플레이스예요.",
            f"{loc_prefix}도란도란 이야기를 나누며 하루의 피로를 기분 좋게 풀 수 있는 곳이에요.",
        ]
        return pool[id_hash % len(pool)]

    if any(k in cat_lower for k in ["음식점", "한식", "양식", "일식", "중식", "레스토랑", "다이닝", "파스타", "스테이크", "초밥"]):
        pool = [
            f"{loc_prefix}정성 가득한 요리와 함께 소중한 사람과 미식의 즐거움을 나누기 좋은 곳이에요.",
            f"{loc_in}세련된 분위기 속에서 오붓하게 특별한 식사를 즐길 수 있는 추천 맛집이에요.",
            f"{loc_prefix}신선한 재료와 정갈한 플레이팅으로 눈과 입이 모두 즐거운 다이닝 스팟이에요.",
            f"{loc_in}아늑한 공간에서 둘만의 오붓한 데이트 디너를 만끽해보세요.",
        ]
        return pool[id_hash % len(pool)]

    if any(k in cat_lower for k in ["미술관", "전시", "박물관", "갤러리", "문화", "공연", "서점"]):
        pool = [
            f"{loc_prefix}감각적인 예술 작품과 영감을 함께 나누며 사색하기 좋은 문화 공간이에요.",
            f"{loc_in}다채로운 전시와 볼거리를 감상하며 색다른 추억을 남길 수 있는 데이트 코스예요.",
            f"{loc_prefix}조용히 거닐며 서로의 취향과 감상을 나누기 딱 좋은 힐링 명소예요.",
        ]
        return pool[id_hash % len(pool)]

    pool = [
        f"{loc_in}트렌디한 감성과 머무는 순간이 편안한 매력적인 데이트 장소예요.",
        f"{loc_prefix}소소하지만 확실한 행복을 만끽할 수 있는 다정한 분위기의 공간이에요.",
        f"{loc_in}남다른 개성과 아늑한 무드가 돋보이는 숨은 힐링 스팟이에요.",
        f"{loc_prefix}사랑하는 사람과 함께 특별한 하루를 완성하기 좋은 추천 장소예요.",
    ]
    return pool[id_hash % len(pool)]

def fix_all_spot_summaries(supabase_url: str, service_key: str, limit: int = 100):
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

    print("🔍 Supabase spots 테이블 전체 전수 페이지네이션 스캔 시작...")
    page_size = 1000
    offset = 0
    spots = []

    while True:
        fetch_url = f"{supabase_url}/rest/v1/spots?select=id,name,category,region,area,summary,signature_items&is_closed=eq.false&order=id.asc&offset={offset}&limit={page_size}"
        try:
            req = urllib.request.Request(fetch_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as res:
                batch = json.loads(res.read().decode('utf-8'))
                if not batch:
                    break
                spots.extend(batch)
                if len(batch) < page_size:
                    break
                offset += page_size
        except Exception as e:
            print(f"❌ DB 조회 실패: {e}")
            break

    bad_spots = [s for s in spots if is_bad_summary(s.get("summary", ""), s.get("name", ""))]
    print(f"📊 전체 {len(spots)}개 스팟 중 교정 대상 {len(bad_spots)}개 감지됨.\n")

    if not bad_spots:
        print("🎉 모든 스팟의 설명이 이미 완벽하게 정제되어 있습니다!")
        return

    targets = bad_spots[:limit]
    print(f"🚀 이번 배치 {len(targets)}개 스팟 설명 교정 시작 (Groq AI + 스마트 풀)...\n")

    success_count = 0
    for idx, s in enumerate(targets, 1):
        s_id = s.get("id")
        name = s.get("name", "")
        cat = s.get("category", "")
        region = s.get("region", "")
        area = s.get("area", "")
        old_sum = s.get("summary", "")
        sig = s.get("signature_items") or []

        new_sum = generate_curated_summary(name, cat, region, area, sig, spot_id=s_id)
        print(f"[{idx}/{len(targets)}] [{s_id}] '{name}' ({cat or '미분류'})")
        print(f"  - 이전: {old_sum}")
        print(f"  + 교정: {new_sum}")

        # PATCH 업데이트
        patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
        payload = json.dumps({"summary": new_sum}).encode('utf-8')
        try:
            p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
            with urllib.request.urlopen(p_req, timeout=5) as p_res:
                if p_res.status in (200, 204):
                    print("  ✅ DB 업데이트 성공!\n")
                    success_count += 1
                else:
                    print(f"  ⚠️ DB 업데이트 실패 ({p_res.status})\n")
        except Exception as ex:
            print(f"  ❌ 오류 발생 ({ex})\n")

        time.sleep(0.5)

    print(f"🎉 [완료] 총 {success_count}/{len(targets)}개 스팟 설명 교정 완료!")

if __name__ == "__main__":
    _load_env_credentials()
    sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    fix_all_spot_summaries(sb_url, sb_key, limit=300)
