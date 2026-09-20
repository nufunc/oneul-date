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
from collections import Counter

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

def is_bad_summary(summary: str, name: str = "") -> bool:
    """비정상적이거나 판박이 템플릿인 스팟 설명인지 엄격 판정"""
    if not summary:
        return True
    s = summary.strip()
    n = (name or "").strip()
    
    if len(s) < 8:
        return True
    if s.lower() == n.lower():
        return True
    if re.match(r"^[a-zA-Z_\s,]+$", s):  # 순수 영문 태그 나열
        return True
    
    # 판박이 더미 문구 패턴 블랙리스트
    bad_keywords = [
        "trendy", "romantic", "healing", "scenic", "luxury", "gourmet", "active", "cost_effective",
        "정보 없음", "설명이 없습니다", "골목의 남다른 감각", "남다른 감각과 로맨틱한 무드가",
        "소소하지만 확실한 행복을 만끽할 수 있는 다정한 분위기의 공간이에요",
        "감성과 머무는 순간이", "머무는 순간이 편안한", "매력적인 데이트 장소예요",
        "에서 즐기는 감성적인", "트렌디한 감성과 머무는", "로맨틱한 감성과 머무는",
        "힐링 감성과 머무는", "미식 감성과 머무는", "뷰·전망 감성과 머무는",
        "럭셔리 감성과 머무는", "레트로·전통 감성과 머무는", "액티비티 감성과 머무는"
    ]
    if any(k in s for k in bad_keywords):
        return True
    
    return False

# 카테고리별 짧은 도입 어구 뱅크. 각 항목은 그 자체로 완결된 부사절(쉼표로 끝남)이라
# 어떤 base 문장 앞에 붙여도 조사 충돌 없이 자연스럽게 이어진다. pool 크기(7~15) ×
# 이 뱅크 크기(15~18)만큼 조합이 늘어나 실제 고유 문장 수가 크게 늘어난다.
OPENER_BANK = {
    "street": [
        "노을이 물드는 저녁,", "북적이는 인파 속에서도,", "정겨운 간판 불빛 아래,",
        "고소한 냄새가 진동하는 골목에서,", "떠들썩한 활기가 넘치는 이곳에서,",
        "손을 꼭 잡고 걷다 보면,", "따끈한 먹거리를 나눠 먹으며,",
        "구수한 정취가 살아 있는 이 거리에서,", "오래된 간판들이 반기는 골목에서,",
        "왁자지껄한 분위기 속에서,", "발걸음을 멈추게 하는 이 거리에서,",
        "낮과는 또 다른 밤의 매력이 피어나는 곳에서,", "정든 단골집들이 늘어선 이 거리에서,",
        "여기저기서 들려오는 웃음소리 속에서,", "허름하지만 정감 가는 이 골목에서,",
        "불빛이 하나둘 켜지는 저녁 골목에서,", "지글지글 익어가는 소리에 이끌려,",
        "사람 사는 냄새가 물씬 풍기는 이곳에서,", "좁은 골목을 누비는 재미 속에서,",
        "정든 노포들이 자리를 지키는 이 거리에서,", "김이 모락모락 피어오르는 노점 앞에서,",
        "활기찬 흥정 소리가 오가는 시장에서,", "소박한 간판들이 늘어선 골목을 걸으며,",
        "저녁 바람에 실려 오는 냄새를 따라,", "오래된 정취가 그대로 남아 있는 이곳에서,",
    ],
    "cafe": [
        "은은한 조명 아래,", "포근한 소파에 마주 앉아,", "창밖 풍경을 바라보며,",
        "고소한 원두 향이 감도는 이곳에서,", "느긋한 오후의 여유 속에서,",
        "잔잔한 음악이 흐르는 공간에서,", "따뜻한 차 한 잔을 앞에 두고,",
        "아늑한 조명이 스며든 자리에서,", "달콤한 디저트 향이 퍼지는 이곳에서,",
        "빛이 잘 드는 창가 자리에 앉아,", "포근한 담요를 두르듯 편안하게,",
        "고요한 분위기에 몸을 맡긴 채,", "향긋한 커피 한 모금과 함께,",
        "정겨운 소품들로 꾸며진 공간에서,", "여유로운 시간의 흐름 속에서,",
        "싱그러운 화분들 사이에 앉아,", "조용히 책장 넘기는 소리가 들리는 곳에서,",
        "부드러운 크림 거품을 앞에 두고,", "살랑이는 커튼 사이로 햇살이 비치는 자리에서,",
        "핸드드립 향이 은은하게 퍼지는 이곳에서,", "낮은 조도의 조명이 편안함을 더하는 곳에서,",
        "수다가 끊이지 않는 편안한 테이블에서,", "창밖 거리 풍경을 안주 삼아,",
        "고즈넉한 골목 안 숨은 자리에서,", "둘만의 아지트 같은 구석 자리에 앉아,",
    ],
    "bar": [
        "은은한 조명이 낮게 깔린 이곳에서,", "잔잔한 재즈 선율이 흐르는 밤,",
        "촛불 하나 켜둔 테이블에 마주 앉아,", "하루의 긴장을 내려놓으며,",
        "잔을 부딪히는 소리와 함께,", "어둑한 조명 아래 두런두런 이야기 나누며,",
        "달빛이 스며드는 창가 자리에서,", "취기가 살짝 오르는 기분 좋은 밤,",
        "낮은 음악 소리에 몸을 맡긴 채,", "은밀하고 아늑한 이 공간에서,",
        "하루를 마무리하는 홀가분한 마음으로,", "느슨해진 대화가 이어지는 밤,",
        "잔 속 얼음이 부딪히는 소리를 들으며,", "조용히 흐르는 시간 속에서,",
        "둘만의 은밀한 아지트에서,",
        "자정을 넘긴 여유로운 시간에,", "부드러운 위스키 향을 음미하며,",
        "낮은 스피커에서 흘러나오는 음악과 함께,", "조도 낮은 바 테이블에 나란히 앉아,",
        "하루의 무게를 내려놓는 이 공간에서,", "은은한 취기와 함께 미소가 번지는 밤,",
        "조용한 골목 안 숨은 이 바에서,", "잔에 맺힌 물방울을 바라보며,",
        "두런두런 속삭이듯 대화가 이어지는 밤,", "편안하게 몸을 기댄 채,",
    ],
    "food": [
        "정갈하게 차려진 상 앞에서,", "따끈한 음식이 나오길 기다리며,",
        "은은한 조명 아래 마주 앉아,", "고소한 냄새가 식욕을 자극하는 이곳에서,",
        "정성 가득한 한 상을 마주하고,", "셰프의 손끝에서 완성된 요리를 앞에 두고,",
        "따뜻한 김이 모락모락 피어오르는 식탁에서,", "오붓하게 마주 앉은 저녁 자리에서,",
        "풍미 가득한 한 입을 나누며,", "정갈한 그릇에 담긴 요리를 앞에 두고,",
        "기분 좋은 포만감을 기대하며,", "정성스레 차려진 코스를 앞에 두고,",
        "따스한 온기가 느껴지는 식탁에서,", "향긋한 냄새가 감도는 주방 앞에서,",
        "소중한 사람과 마주한 저녁 식탁에서,",
        "정성이 느껴지는 플레이팅 앞에서,", "오늘 하루의 노고를 위로하며,",
        "코스 요리가 하나둘 채워지는 식탁에서,", "둘만의 조용한 룸에 자리를 잡고,",
        "셰프의 정성이 담긴 한 접시를 마주하고,", "맛있는 냄새에 이끌려 들어선 이곳에서,",
        "창가 자리에 마주 앉아 메뉴를 고르며,", "기분 좋은 대화가 끊이지 않는 식탁에서,",
        "정갈한 상차림에 눈이 즐거워지는 이곳에서,", "소박하지만 정성 가득한 한 끼 앞에서,",
    ],
    "creative": [
        "손끝에 온 신경을 집중하며,", "낯선 재료 앞에서 설레는 마음으로,",
        "조용한 전시관을 거닐며,", "새로운 것을 배우는 즐거움 속에서,",
        "서로의 손길이 스치는 작업대에서,", "은은한 조명 아래 작품을 감상하며,",
        "낯선 도전 앞에서 웃음이 끊이지 않는 이곳에서,", "차분히 몰입하는 시간 속에서,",
        "완성될 작품을 기대하며,", "예술적 영감이 가득한 공간에서,",
        "서로를 바라보며 웃음짓는 순간마다,", "새로운 취향을 발견하는 재미 속에서,",
        "조용히 감상에 잠기는 이곳에서,", "정성껏 하나하나 만들어가며,",
        "낯설지만 즐거운 경험 속에서,",
        "처음 만져보는 재료의 촉감을 느끼며,", "둘만의 작품이 완성되어 가는 순간마다,",
        "조용한 큐레이터의 설명에 귀 기울이며,", "서로의 창작물을 보며 웃음을 터뜨리며,",
        "낯선 도구를 손에 쥐고,", "작업실 가득한 재료 냄새 속에서,",
        "천천히 흘러가는 시간을 즐기며,", "완성작을 서로에게 자랑하며,",
        "몰입의 즐거움에 시간 가는 줄 모르고,", "작품 하나하나에 담긴 이야기를 나누며,",
    ],
    "nature": [
        "선선한 바람을 맞으며,", "탁 트인 풍경을 바라보며,", "손을 맞잡고 천천히 걸으며,",
        "붉게 물든 노을을 바라보며,", "푸른 나무 그늘 아래에서,", "맑은 공기를 깊게 들이마시며,",
        "잔잔한 물결을 바라보며,", "계절의 향기를 느끼며,", "반짝이는 윤슬을 바라보며,",
        "고요한 산책로를 거닐며,", "따스한 햇살 아래를 걸으며,", "탁 트인 하늘 아래에서,",
        "새소리가 들려오는 오솔길에서,", "잔디밭에 나란히 앉아,", "시원한 그늘을 따라 걸으며,",
        "물비린내 섞인 바람을 맞으며,", "발밑에 부서지는 낙엽 소리를 들으며,",
        "멀리 보이는 능선을 바라보며,", "싱그러운 풀내음을 맡으며,",
        "두 사람의 그림자가 길게 늘어지는 오후,", "자전거를 타고 천천히 지나치며,",
        "물수제비를 뜨며 웃음짓는 순간,", "이슬 맺힌 풀숲을 지나며,",
        "조용히 내려앉는 노을빛 아래서,", "바람에 흔들리는 나뭇잎 소리를 들으며,",
    ],
    "default": [
        "특별할 것 없는 하루에도,", "소소한 일상 속에서,", "편안한 분위기 속에서,",
        "여유로운 시간을 보내며,", "잔잔한 분위기에 스며들어,", "마음이 편안해지는 이 공간에서,",
        "일상에 작은 쉼표를 찍으며,", "포근한 분위기 속에서,", "은은하게 스며드는 감성 속에서,",
        "차분한 시간의 흐름 속에서,", "소중한 사람과 함께,", "발걸음을 옮길 때마다,",
        "기분 좋은 설렘을 안고,", "여유롭게 흐르는 시간 속에서,", "특별한 하루를 기대하며,",
        "별다른 계획 없이 들른 이곳에서,", "익숙한 듯 새로운 하루 속에서,",
        "둘만의 대화가 끊이지 않는 이곳에서,", "오늘따라 유난히 다정한 분위기 속에서,",
        "작은 우연이 특별해지는 이 공간에서,", "바쁜 일상을 잠시 내려놓고,",
        "함께라서 더 즐거운 시간 속에서,", "조용히 서로를 바라보는 순간,",
        "편안한 침묵마저 즐거운 이곳에서,", "오늘 하루의 마무리를 이곳에서,",
    ],
}


def generate_curated_summary(name: str, cat: str, region: str, area: str, sig_items: list = None, spot_id: int = 0) -> str:
    """Groq LLM 또는 100선 고감도 룰베이스 에디토리얼 풀을 통해 감성 한줄 소개 생성"""
    groq_key = get_groq_api_key()
    sig_text = f", 대표메뉴: {', '.join(sig_items[:2])}" if sig_items else ""
    loc = area or region or ""
    cat_label = cat or "데이트 스팟"
    
    if groq_key:
        prompt = (
            f"장소명: {name}, 카테고리: {cat_label}, 지역: {region} {loc}{sig_text}\n\n"
            "위 장소의 고유한 매력과 분위기를 담아 2030 커플을 위한 감각적인 매거진 에디토리얼 한 줄 소개(25~45자 내외, 다정하고 세련된 한국어 추천 문장)를 작성해주세요.\n"
            "규칙: '~한다' 문어체 종결 금지. '~하기 좋은 곳이에요', '~의 매력을 오롯이 즐겨보세요', '~을 다정하게 만끽해보세요' 등 다정한 추천 어조 사용.\n"
            "JSON 형식으로만 응답: {\"summary\": \"...\"}"
        )
        system_prompt = "You are a professional Korean dating magazine editor. Output only valid JSON."
        res = call_groq_json(prompt, system_prompt=system_prompt, model="groq/compound-mini", max_tokens=200)
        if res and isinstance(res.get("summary"), str):
            clean = res["summary"].replace('"', '').replace("'", "").strip()
            if 10 <= len(clean) <= 60 and not is_bad_summary(clean, name):
                return clean

    # 100선 풍부한 에디토리얼 폴백 풀
    id_hash = abs(spot_id or sum(ord(c) for c in name))

    def _opener(pool_key: str, base: str) -> str:
        """짧은 도입 어구 하나를 앞에 붙여 같은 문장 풀도 훨씬 다양하게 보이게 한다.
        도입구는 그 자체로 완결된 부사절이라 뒤 문장과 조사 충돌 없이 안전하게 이어붙일 수 있다.
        base 인덱스와 다른 산술(곱셈 해시 믹스)로 골라 base 선택과 상관관계를 줄인다."""
        openers = OPENER_BANK.get(pool_key) or OPENER_BANK["default"]
        mixed = (id_hash * 2654435761) & 0xFFFFFFFF
        return f"{openers[mixed % len(openers)]} {base}"

    if sig_items and len(sig_items) > 0:
        sig = sig_items[0]
        sig_templates = [
            f"대표 메뉴 '{sig}'의 특별한 풍미와 함께 감각적인 분위기를 즐기기 좋은 곳이에요.",
            f"정성껏 빚어낸 시그니처 '{sig}'와 함께 잊지 못할 미식 데이트를 만끽해보세요.",
            f"눈과 입이 모두 즐거운 '{sig}'의 매력으로 소중한 사람의 미소를 자아내는 스팟이에요.",
            f"깊은 풍미의 '{sig}'를 맛보며 다정하게 이야기를 나누기 딱 좋은 추천 맛집이에요.",
            f"시그니처 '{sig}'와 함께하는 둘만의 로맨틱한 식사로 특별한 하루를 완성해보세요.",
        ]
        return _opener("food", sig_templates[id_hash % len(sig_templates)])

    cat_lower = (cat_label + " " + name).lower()

    # 1. 골목 / 거리 / 시장 / 야장 / 포차형 스팟
    if any(k in cat_lower for k in ["골목", "거리", "시장", "야시장", "포차", "야장", "로드", "단지"]):
        street_pool = [
            f"활기찬 골목 정취와 맛깔스러운 먹거리가 가득해 퇴근 후 둘만의 낭만을 만끽하기 좋아요.",
            f"다채로운 먹거리와 북적이는 활기가 어우러져 발걸음 닿는 곳마다 즐거움이 넘치는 명소예요.",
            f"정겨운 야외 테이블에 마주 앉아 시원한 술 한잔을 기울이며 하루의 피로를 날려보세요.",
            f"골목 곳곳 숨은 맛집을 탐방하며 도란도란 정겨운 데이트를 즐기기 딱 좋은 곳이에요.",
            f"소박하지만 깊은 내공의 맛과 사람 냄새 나는 따스한 분위기가 매력적인 거리예요.",
            f"둘만의 소소하고 진솔한 대화를 나누며 정겨운 밤 정취를 느끼기 좋은 명소예요.",
            f"맛있는 냄새와 활기찬 에너지가 가득해 언제 찾아도 기분 좋은 설렘을 선물해요.",
        ]
        return _opener("street", street_pool[id_hash % len(street_pool)])

    if any(k in cat_lower for k in ["카페", "커피", "베이커리", "디저트", "찻집"]):
        cafe_pool = [
            "차분하게 내려앉은 햇살 아래, 은은한 원두 향과 함께 둘만의 깊은 대화에 빠져들기 좋은 곳이에요.",
            "달콤한 디저트와 향긋한 커피 한 잔으로 일상의 피로를 사르르 녹여주는 감성 카페예요.",
            "갓 구워낸 빵의 고소한 풍미와 따스한 인테리어가 어우러진 베이커리 명소예요.",
            "감각적인 가구와 잔잔한 음악 속에서 특별한 티타임을 즐기기 좋아요.",
            "창가 너머 풍경을 바라보며 도란도란 여유로운 오후를 만끽할 수 있는 스팟이에요.",
            "세련된 무드와 정갈한 시그니처 음료로 데이트의 낭만을 더해주는 공간이에요.",
            "한 모금의 커피와 함께 서로의 온기를 나누며 쉬어가기 좋은 아늑한 카페예요.",
            "감성 가득한 플레이팅과 포토제닉한 비주얼로 둘만의 추억을 남기기 딱 좋아요.",
            "은은한 조명과 조용한 분위기로 온전히 서로에게 집중할 수 있는 힐링 티하우스예요.",
            "향긋한 원두 풍미와 감각적인 감성이 머무는 감성 디저트 맛집이에요.",
            "달콤한 케이크와 부드러운 라떼로 기분 좋은 설렘을 채워주는 공간이에요.",
            "따스한 원목 인테리어와 자연광이 예쁘게 쏟아지는 감성 아지트예요.",
            "둘만의 소중한 시간을 달콤한 디저트와 함께 채워보세요.",
            "향긋한 스페셜티 커피의 깊은 풍미를 다정하게 음미하기 좋은 곳이에요.",
            "소소하지만 특별한 이야기꽃을 피우며 머물기 좋은 낭만적인 카페예요.",
        ]
        return _opener("cafe", cafe_pool[id_hash % len(cafe_pool)])

    if any(k in cat_lower for k in ["주점", "와인", "칵테일", "이자카야", "포차", "펍", "호프", "바"]):
        bar_pool = [
            "도심의 소음을 뒤로하고 은은한 조명과 감각적인 재즈 선율 속에서 와인잔을 부딪히기 좋아요.",
            "로맨틱한 촛불 아래서 달콤한 칵테일과 함께 둘만의 밤을 무르익게 만드는 바예요.",
            "정성 담긴 맛깔스러운 안주와 함께 다정하게 술잔을 기울이기 좋은 감성 주점이에요.",
            "감각적인 음악과 아늑한 무드로 깊은 대화를 나누기 딱 좋은 분위기 맛집이에요.",
            "하루의 끝자락, 서로의 하루를 다독이며 오붓하게 술 한잔 곁들이기 좋은 공간이에요.",
            "은은한 앰비언트 사운드와 함께 로맨틱한 밤 데이트를 완성하기 좋은 핫플레이스예요.",
            "다채로운 풍미의 와인과 페어링 요리로 낭만적인 밤을 만끽할 수 있는 다이닝 바예요.",
            "조용한 골목 끝, 둘만의 아지트 같은 아늑함 속에서 하이볼과 위스키를 즐겨보세요.",
            "기분 좋은 취기와 함께 서로에게 더 깊이 스며드는 로맨틱한 밤을 선물해요.",
            "세련된 무드와 섬세한 칵테일 한 잔으로 특별한 설렘을 채워주는 바예요.",
            "은은한 조명 속에서 속마음을 털어놓으며 둘만의 거리를 좁혀가기 좋은 술집이에요.",
            "하루를 근사하게 마무리하며 도란도란 이야기 나누기 좋은 감성 이자카야예요.",
            "분위기 있는 바 테이블에 나란히 앉아 로맨틱한 밤을 즐겨보세요.",
            "감미로운 음악과 맛있는 요리로 기분 좋은 밤의 여유를 누릴 수 있는 곳이에요.",
            "둘만의 특별한 밤을 더욱 빛내줄 감각적인 무드의 주점이에요.",
        ]
        return _opener("bar", bar_pool[id_hash % len(bar_pool)])

    if any(k in cat_lower for k in ["음식점", "한식", "양식", "일식", "중식", "레스토랑", "다이닝", "파스타", "스테이크", "초밥"]):
        food_pool = [
            "눈길을 사로잡는 정갈한 플레이팅과 깊은 풍미로 특별한 날의 디너를 빛내주는 맛집이에요.",
            "신선한 제철 재료로 빚어낸 정성 가득한 요리를 소중한 사람과 함께 나누기 좋아요.",
            "오붓하고 프라이빗한 분위기 속에서 잊지 못할 미식 데이트를 완성할 수 있는 곳이에요.",
            "한 입 베어 무는 순간 기분 좋은 감탄이 번지는 감각적인 다이닝 스팟이에요.",
            "세련된 인테리어와 정성 어린 코스로 둘만의 로맨틱한 식사를 즐겨보세요.",
            "셰프의 섬세한 터치와 따뜻한 환대가 어우러져 특별한 추억을 선물하는 식당이에요.",
            "맛있는 음식과 함께 마주 앉아 다정한 눈빛을 나누기 더없이 좋은 공간이에요.",
            "정갈한 맛과 고급스러운 무드로 기념일 데이트에 강력 추천하는 미식 명소예요.",
            "입안 가득 퍼지는 풍부한 풍미와 감각적인 플레이팅이 매력적인 맛집이에요.",
            "오붓한 식사와 함께 서로의 취향을 나누며 행복한 미소를 짓게 되는 공간이에요.",
            "소중한 사람과의 기념일을 더욱 특별하고 근사하게 만들어주는 레스토랑이에요.",
            "정성 담긴 요리 한 접시로 마음까지 따뜻하게 채워주는 감성 다이닝이에요.",
            "눈과 입이 동시에 즐거운 감각적인 미식의 향연을 즐겨보세요.",
            "분위기 있는 조명 아래서 서로의 이야기에 귀 기울이며 맛있는 식사를 즐기기 좋아요.",
            "특별한 날, 소중한 사람에게 잊지 못할 감동의 한 끼를 선물할 수 있는 곳이에요.",
        ]
        return _opener("food", food_pool[id_hash % len(food_pool)])

    if any(k in cat_lower for k in ["미술관", "전시", "박물관", "갤러리", "문화", "공연", "서점", "공방", "체험", "원데이"]):
        creative_pool = [
            "서로를 위해 세상에 단 하나뿐인 선물을 빚어내며 특별한 추억을 간직할 수 있는 감성 공방이에요.",
            "함께 몰입하여 무언가를 만들어가는 유쾌한 즐거움과 웃음이 가득한 이색 체험 스팟이에요.",
            "감각적인 예술 작품과 영감을 나누며 서로의 취향을 깊이 알아가는 문화 공간이에요.",
            "이색적인 원데이 클래스로 평소 해보지 못한 색다른 경험을 함께 나눠보세요.",
            "정성껏 만든 작품을 서로에게 선물하며 데이트의 설렘을 오래도록 간직할 수 있어요.",
            "다채로운 전시와 볼거리를 감상하며 감성 충만한 하루를 보내기 좋은 갤러리예요.",
            "서로의 손끝에서 완성되는 특별한 추억을 사진과 기념품으로 담아갈 수 있는 명소예요.",
            "조용한 전시관을 거닐며 도란도란 감상을 나누는 낭만적인 문화 데이트 코스예요.",
            "웃음꽃이 끊이지 않는 즐거운 체험으로 둘 사이의 케미를 한층 더 높여보세요.",
            "새로운 취미를 함께 시작하며 둘만의 특별한 연결고리를 만들어가는 공간이에요.",
            "감각적인 오브제와 영감으로 가득한 공간에서 특별한 하루를 채워보세요.",
            "손수 만든 향기나 소품으로 둘만의 기억을 향기롭게 각인시키는 공방이에요.",
            "서로에게 더 집중하고 소통하며 즐거운 추억을 쌓을 수 있는 액티비티 스팟이에요.",
            "예술적 감성을 충전하며 감각적인 사진을 남기기 좋은 핫플레이스예요.",
            "일상을 벗어나 유쾌한 에너지와 활력을 가득 채워주는 이색 데이트 코스예요.",
        ]
        return _opener("creative", creative_pool[id_hash % len(creative_pool)])

    if any(k in cat_lower for k in ["공원", "관광", "수목원", "식물원", "산책", "전망대", "야경", "호수", "해변"]):
        nature_pool = [
            "선선한 바람을 맞으며 손을 잡고 계절의 정취를 오롯이 느끼며 걷기 좋은 힐링 코스예요.",
            "탁 트인 풍경과 맑은 공기 속에서 도심을 벗어나 온전한 여유를 만끽할 수 있는 명소예요.",
            "붉게 물드는 노을을 나란히 바라보며 낭만적인 순간을 눈에 담기 좋은 전망 스팟이에요.",
            "도심 속 푸른 자연을 배경으로 여유롭게 산책하며 다정한 대화를 나누기 좋아요.",
            "사계절 변화하는 풍경을 따라 거닐며 둘만의 감성적인 사진을 남기기 좋은 곳이에요.",
            "반짝이는 도심의 야경을 배경으로 로맨틱한 하루의 마침표를 찍을 수 있는 뷰 맛집이에요.",
            "자연이 들려주는 잔잔한 소리에 귀 기울이며 마음의 쉼표를 찍어가는 힐링 스팟이에요.",
            "손잡고 천천히 발맞추어 걷는 것만으로도 행복해지는 낭만적인 산책길이에요.",
            "탁 트인 시야와 시원한 바람이 머무는 곳에서 가슴 벅찬 감동을 함께 나눠보세요.",
            "일상의 번잡함을 잊고 서로의 온기에 기대어 쉬어가기 좋은 자연 명소예요.",
            "계절마다 새로운 옷을 갈아입는 아름다운 풍경 속에서 특별한 추억을 만들어보세요.",
            "빛나는 밤하늘과 도시의 불빛이 어우러진 환상적인 야경 데이트 명소예요.",
            "시원한 그늘 아래 돗자리를 펴고 둘만의 피크닉을 즐기기 더없이 좋은 곳이에요.",
            "호숫가를 따라 이어지는 잔잔한 산책로를 걸으며 잊지 못할 추억을 남겨보세요.",
            "아름다운 자연 속에서 서로에게 오롯이 집중하며 힐링할 수 있는 추천 코스예요.",
        ]
        return _opener("nature", nature_pool[id_hash % len(nature_pool)])

    master_default_pool = [
        f"감각적인 인테리어와 아늑한 분위기로 머무는 내내 기분 좋은 설렘을 채워주는 {loc or '도심 속'} 명소예요.",
        f"소중한 사람과 함께 둘만의 소소하고 따뜻한 온기를 나누며 추억을 쌓기 좋은 공간이에요.",
        f"정갈하고 세련된 무드가 공존하여 실패 없는 데이트를 약속하는 핫플레이스예요.",
        f"도란도란 이야기를 나누며 온전히 서로에게 집중할 수 있는 다정한 분위기의 아지트예요.",
        f"특별한 날, 소중한 인연과 함께 오래도록 기억에 남을 낭만적인 하루를 완성해보세요.",
        f"한 번 발걸음하면 자꾸만 다시 찾고 싶어지는 매력 넘치는 추천 데이트 스팟이에요.",
        f"사랑하는 사람의 미소를 바라보며 소중한 하루를 기록하기 더없이 좋은 곳이에요.",
        f"일상의 작은 쉼표가 되어주는 아늑하고 감성 가득한 데이트 코스예요.",
        f"이곳만의 특별한 매력이 발걸음을 이끄는 인기 데이트 명소예요.",
        f"함께여서 더 빛나는 순간을 만들어주는 소중한 공간이에요.",
        f"잔잔한 즐거움이 켜켜이 쌓이는 다정한 데이트 코스예요.",
        f"말없이 함께 있는 것만으로도 충분한 편안함을 주는 곳이에요.",
        f"서로의 하루를 나누며 자연스럽게 스며드는 힐링 명소예요.",
        f"가볍게 들렀다가도 오래 머물고 싶어지는 매력적인 공간이에요.",
        f"둘만의 리듬으로 시간을 보내기 좋은 아늑한 데이트 스팟이에요.",
        f"SNS에도 자랑하고 싶어지는 감각적인 포토제닉 명소예요.",
        f"지친 하루 끝에 서로를 다독이며 쉬어가기 좋은 곳이에요.",
        f"익숙함 속에서도 매번 새로운 설렘을 발견하게 되는 곳이에요.",
        f"가까운 사람과 함께라면 더욱 특별해지는 데이트 명소예요.",
        f"오래도록 이야기할 추억 하나를 남기기 좋은 장소예요.",
        f"번잡함을 잊고 온전히 둘만의 시간에 집중하기 좋아요.",
        f"다정한 손길과 따뜻한 눈빛이 자연스럽게 오가는 공간이에요.",
        f"계획 없이 걸음을 옮겨도 만족스러운 하루가 되는 곳이에요.",
    ]
    return _opener("default", master_default_pool[id_hash % len(master_default_pool)])

def fix_all_spot_summaries(supabase_url: str, service_key: str, limit: int = 5000):
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

    # is_bad_summary는 깨진/더미 텍스트만 잡고 "잘 쓰였지만 대량으로 겹치는" 것은
    # 못 잡는다. 같은 summary가 임계치보다 많이 반복되면 그것도 교정 대상에 넣는다.
    DUPLICATE_THRESHOLD = 5
    summary_counts = Counter(s.get("summary", "") for s in spots if s.get("summary"))

    def _is_duplicated(summary: str) -> bool:
        return bool(summary) and summary_counts.get(summary, 0) > DUPLICATE_THRESHOLD

    bad_spots = [
        s for s in spots
        if is_bad_summary(s.get("summary", ""), s.get("name", "")) or _is_duplicated(s.get("summary", ""))
    ]
    print(f"📊 전체 {len(spots)}개 스팟 중 교정 대상 {len(bad_spots)}개 감지됨"
          f"(깨진 텍스트 + {DUPLICATE_THRESHOLD}회 초과 중복).\n")

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

        time.sleep(0.05)

    print(f"🎉 [완료] 총 {success_count}/{len(targets)}개 스팟 설명 교정 완료!")

if __name__ == "__main__":
    _load_env_credentials()
    sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    fix_all_spot_summaries(sb_url, sb_key, limit=5000)
