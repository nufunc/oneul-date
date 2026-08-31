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
        "정보 없음", "설명이 없습니다", "골목의 남다른 감각", "남다른 감각과 로맨틱한 무드가",
        "소소하지만 확실한 행복을 만끽할 수 있는 다정한 분위기의 공간이에요"
    ]
    if any(k in s.lower() for k in bad_keywords):
        return True
    
    return False

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
    
    if sig_items and len(sig_items) > 0:
        sig = sig_items[0]
        sig_templates = [
            f"대표 메뉴 '{sig}'의 특별한 풍미와 함께 감각적인 분위기를 즐기기 좋은 곳이에요.",
            f"정성껏 빚어낸 시그니처 '{sig}'와 함께 잊지 못할 미식 데이트를 만끽해보세요.",
            f"눈과 입이 모두 즐거운 '{sig}'의 매력으로 소중한 사람의 미소를 자아내는 스팟이에요.",
            f"깊은 풍미의 '{sig}'를 맛보며 다정하게 이야기를 나누기 딱 좋은 추천 맛집이에요.",
            f"시그니처 '{sig}'와 함께하는 둘만의 로맨틱한 식사로 특별한 하루를 완성해보세요.",
        ]
        return sig_templates[id_hash % len(sig_templates)]

    cat_lower = cat_label.lower()
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
        return cafe_pool[id_hash % len(cafe_pool)]

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
        return bar_pool[id_hash % len(bar_pool)]

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
        return food_pool[id_hash % len(food_pool)]

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
        return creative_pool[id_hash % len(creative_pool)]

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
        return nature_pool[id_hash % len(nature_pool)]

    master_default_pool = [
        "현지인과 여행자 모두에게 사랑받는 검증된 핫플레이스로 실패 없는 데이트를 약속해요.",
        "남다른 개성과 트렌디한 감각으로 SNS에서 뜨겁게 주목받는 감성 스팟이에요.",
        "정성 가득한 공간 연출과 따스한 온기로 방문객들의 호평이 이어지는 곳이에요.",
        "세련된 감각과 아늑한 무드가 공존하여 머무는 내내 행복한 미소가 번지는 장소예요.",
        "다정한 분위기 속에서 사랑하는 사람과 함께 특별한 추억을 아로새기기 좋아요.",
        "특별한 날, 소중한 인연과 함께 오래도록 기억에 남을 하루를 완성해보세요.",
        "한 번 발걸음하면 자꾸만 다시 찾고 싶어지는 매력적인 아지트예요.",
        "기분 좋은 설렘과 편안함이 공존하여 둘만의 데이트를 더욱 풍성하게 만들어줘요.",
        "감각적인 플레이팅과 정성스러운 분위기로 취향을 저격하는 핫플레이스예요.",
        "도란도란 이야기를 나누며 서로에게 온전히 집중할 수 있는 따뜻한 쉼터예요.",
        "트렌디한 감성과 편안한 무드가 어우러져 매 순간이 특별해지는 공간이에요.",
        "사랑하는 사람의 미소를 바라보며 소중한 하루를 기록하기 좋은 추천 명소예요.",
        "일상의 작은 쉼표가 되어주는 아늑하고 감성적인 데이트 코스예요.",
        "정갈한 맛과 감각적인 분위기로 언제 찾아도 만족스러운 데이트 스팟이에요.",
        "둘만의 특별한 날을 더욱 빛나고 근사하게 완성해주는 감성 명소예요.",
        "소중한 사람과 함께 행복한 기억의 한 페이지를 채워가기 더없이 좋은 곳이에요.",
        "머무는 것만으로도 기분 전환이 되는 매력 넘치는 데이트 장소예요.",
        "둘만의 소소하고 따뜻한 온기를 나누며 잊지 못할 추억을 만들어보세요.",
        "서로의 취향을 나누며 편안하게 쉬어갈 수 있는 감성 가득한 공간이에요.",
        "사랑하는 사람과 손잡고 방문하기 딱 좋은 매력적인 추천 스팟이에요.",
    ]
    return master_default_pool[id_hash % len(master_default_pool)]

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
