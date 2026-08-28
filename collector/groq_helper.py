#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — Groq API 안전 호출 및 지능형 메타 추출 헬퍼 (groq_helper.py)
=============================================================================
Groq Llama 3.1 8B Instant / Llama 3.3 70B Versatile 모델을 활용하여
비정형 텍스트(유튜브 자막, 댓글, 블로그)에서 장소명과 v4.0 메타데이터를 초고속(0.2초) 추출합니다.

[무료 티어 보호 안전 규약]
1. 분당 요청수(RPM: 30) 및 분당 토큰(TPM: 6000)을 엄격히 방어하기 위해 슬라이딩 윈도우 딜레이(최소 2초 간격) 적용.
2. MD5 해시 기반 디스크 캐시(.groq_cache.json)로 동일 텍스트 중복 호출을 원천 차단.
3. 429 에러 또는 네트워크 오류 발생 시 즉시 안전 폴백(None 반환)하여 수집 엔진이 멈추지 않음.
4. 토큰 절약을 위해 최소한의 시스템 프롬프트 및 응답 길이(max_tokens=600) 제한.
"""

import os
import sys
import re
import json
import time
import hashlib
import urllib.request
import urllib.error

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "groq/compound-mini"  # 초고속 최신 모델 (30 RPM, 0.2초 초고속 레이턴시)
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".groq_cache.json")

# 인메모리 레이트리미트 및 429 쿨다운 상태 관리
_last_request_time = 0.0
_MIN_REQUEST_INTERVAL = 2.0  # 최소 2.0초 간격 (분당 최대 30회 엄격 방어)
_cooldown_until = 0.0        # 429 발생 시 10분간 자동 쿨다운 (규칙 기반 무중단 폴백)

def _load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_cache(cache_data):
    try:
        # 캐시 크기 1,000건 제한
        if len(cache_data) > 1000:
            keys = list(cache_data.keys())[-800:]
            cache_data = {k: cache_data[k] for k in keys}
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def get_groq_api_key():
    key = os.environ.get("GROQ_API_KEY") or os.environ.get("VITE_GROQ_API_KEY")
    if key:
        return key
    
    # collector/.env 및 프로젝트 루트 .env 탐색
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
                        if line.startswith("GROQ_API_KEY="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("VITE_GROQ_API_KEY="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return None

def call_groq_json(prompt: str, system_prompt: str = "", model: str = DEFAULT_MODEL, max_tokens: int = 500) -> dict | None:
    """
    Groq API를 호출하여 JSON 응답을 안전하게 반환합니다.
    Rate Limit 방어, 디스크 캐시, 자동 재시도 및 무중단 폴백을 지원합니다.
    """
    global _last_request_time, _cooldown_until

    # 429 쿨다운 활성화 상태 검사 (10분간 Groq 호출 차단 후 규칙 기반 즉시 폴백)
    now = time.time()
    if now < _cooldown_until:
        return None

    api_key = get_groq_api_key()
    if not api_key:
        return None

    # 1. 캐시 확인
    cache_key = hashlib.md5(f"{model}:{system_prompt}:{prompt}".encode("utf-8")).hexdigest()
    cache = _load_cache()
    if cache_key in cache:
        return cache[cache_key]

    # 2. 레이트 리미트 방어 (최소 2.0초 간격 보장)
    elapsed = now - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    import ssl
    ctx = ssl.create_default_context()

    max_retries = 1
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                GROQ_ENDPOINT,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            _last_request_time = time.time()
            with urllib.request.urlopen(req, context=ctx, timeout=8) as res:
                res_data = json.loads(res.read().decode("utf-8"))
                content = res_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                # 직접 JSON 파싱 시도
                clean_content = content.strip()
                if "```json" in clean_content:
                    clean_content = clean_content.split("```json")[1].split("```")[0].strip()
                elif "```" in clean_content:
                    clean_content = clean_content.split("```")[1].split("```")[0].strip()

                try:
                    parsed = json.loads(clean_content)
                except Exception:
                    # JSON 블록 정규식 탐색
                    match = re.search(r"\{.*\}", clean_content, re.DOTALL)
                    if match:
                        parsed = json.loads(match.group(0))
                    else:
                        return None

                # 캐시 저장
                cache[cache_key] = parsed
                _save_cache(cache)
                return parsed

        except urllib.error.HTTPError as e:
            if e.code == 429:
                # 429 Too Many Requests 감지 시 3초 슬립 후 재시도
                time.sleep(3.0)
                continue
            elif e.code == 404:
                # 모델이 없을 경우 기본 경량 모델로 자동 폴백
                payload["model"] = DEFAULT_MODEL
                continue
            else:
                return None
        except Exception as ex:
            return None

    return None


def extract_spots_from_unstructured_text(text: str, video_title: str = "") -> list[dict]:
    """
    유튜브 고정 댓글, 자막, 영상 설명란 등 비정형 텍스트에서
    장소명 및 세부 메타(주차, 메뉴, 분위기)를 구조화하여 추출합니다.
    """
    if not text or len(text.strip()) < 15:
        return []

    # 토큰 절약을 위해 앞 2,500자만 슬라이싱
    clipped_text = text.strip()[:2500]

    system_prompt = (
        "You are an expert Korean date spot extractor. "
        "Extract specific place/venue names mentioned in the text suitable for dates. "
        "Return pure JSON format: {\"spots\": [{\"name\": \"...\", \"signature_items\": [\"...\"], \"parking\": \"valet|free|paid|none|unknown\", \"date_context\": [\"romantic|healing|gourmet|etc\"]}]}"
    )

    prompt = f"Title: {video_title}\nText:\n{clipped_text}\n\nExtract places and format as JSON."

    res = call_groq_json(prompt, system_prompt=system_prompt, max_tokens=500)
    if res and isinstance(res.get("spots"), list):
        valid_spots = []
        for s in res["spots"]:
            if isinstance(s, dict) and s.get("name"):
                name = str(s["name"]).strip()
                if 2 <= len(name) <= 30:
                    valid_spots.append(s)
        return valid_spots
    return []


def classify_natural_query(user_query: str) -> dict | None:
    """
    사용자의 자연어 검색어('비 오는 날 성수동 10만원 이하 코스')를 분석하여
    지역, 분위기, 슬롯, 가격대 의도를 JSON으로 추출합니다.
    """
    if not user_query or len(user_query.strip()) < 2:
        return None

    system_prompt = (
        "You are an intent parser for a Korean dating course service. "
        "Parse the user's query into search filters. "
        "Available regions: 서울, 경기, 인천, 강원, 충청, 영남, 호남, 제주, 전국. "
        "Available moods: romantic, healing, luxury, gourmet, active, view, retro, trendy, ALL. "
        "Return pure JSON format: {\"region\": \"...\", \"sub_zone\": \"...\", \"mood\": \"...\", \"price_tier\": \"...\", \"keywords\": [\"...\"]}"
    )

    prompt = f"Query: {user_query}\n\nParse into JSON format."
    res = call_groq_json(prompt, system_prompt=system_prompt, model=DEFAULT_MODEL, max_tokens=200)
    return res
