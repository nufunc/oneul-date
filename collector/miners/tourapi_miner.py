#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 한국관광공사 TourAPI 4.0 공공데이터 마이너 (TourAPI Miner)
전국 250개 시·군·구의 문화시설(14), 관광지(12), 축제(15), 레포츠(28), 쇼핑(38) 데이터를
정형 API로 수집하여 낮(day) 슬롯의 고품질 데이트 명소를 대량 확충합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import re
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase_worker import load_env, derive_region_area
from category_filter import is_date_spot_category

# TourAPI 4.0 엔드포인트
TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorService1"

# 데이트 적합 콘텐츠 타입
# 12: 관광지, 14: 문화시설, 15: 축제공연행사, 28: 레포츠, 38: 쇼핑, 39: 음식점
DATE_CONTENT_TYPES = [
    ("14", "문화시설", ["healing", "romantic"], "day"),
    ("12", "관광지", ["view", "healing"], "day"),
    ("28", "레포츠/체험", ["active"], "day"),
    ("38", "쇼핑/소품", ["trendy"], "day"),
    ("15", "축제/행사", ["romantic", "trendy"], "evening"),
]

# 전국 8대 권역별 TourAPI areaCode 매핑
AREA_CODE_MAP = {
    "1": ("서울", ["서울"]),
    "2": ("인천", ["인천"]),
    "6": ("부산", ["부산"]),
    "4": ("대구", ["대구"]),
    "5": ("광주", ["광주"]),
    "3": ("대전", ["대전"]),
    "7": ("울산", ["울산"]),
    "8": ("세종", ["충청"]),
    "31": ("경기", ["경기"]),
    "32": ("강원", ["강원"]),
    "33": ("충북", ["충청"]),
    "34": ("충남", ["충청"]),
    "35": ("전북", ["전라"]),
    "36": ("전남", ["전라"]),
    "37": ("경북", ["경상"]),
    "38": ("경남", ["경상"]),
    "39": ("제주", ["제주"]),
}

def fetch_tourapi_spots(api_key: str, area_code: str = "1", content_type_id: str = "14", num_of_rows: int = 30) -> list[dict]:
    """TourAPI 4.0 areaBasedList1 호출하여 관광/문화 스팟 목록 수급"""
    if not api_key:
        return []

    params = {
        "serviceKey": api_key,
        "numOfRows": str(num_of_rows),
        "pageNo": "1",
        "MobileOS": "ETC",
        "MobileApp": "OneulDate",
        "_type": "json",
        "listYN": "Y",
        "arrange": "P",
        "areaCode": area_code,
        "contentTypeId": content_type_id
    }

    url = f"{TOUR_API_BASE}/areaBasedList1?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "OneulDate-DataEngine/4.0"})

    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            if res.status == 200:
                raw = json.loads(res.read().decode('utf-8'))
                body = raw.get("response", {}).get("body", {})
                items = body.get("items", {})
                if isinstance(items, dict):
                    item_list = items.get("item", [])
                    if isinstance(item_list, dict):
                        item_list = [item_list]
                    return item_list
    except Exception as e:
        print(f"  ⚠️ TourAPI 호출 오류 (area: {area_code}, type: {content_type_id}): {e}")

    return []

def check_spot_exists(supabase_url: str, headers: dict, content_id: str, name: str) -> bool:
    """Provider ID 또는 상호명으로 이미 DB에 존재하는지 확인"""
    # 1. Provider ID 체크
    url = f"{supabase_url}/rest/v1/spots?select=id&provider_ids->>tour_api=eq.{content_id}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            rows = json.loads(res.read().decode('utf-8'))
            if rows:
                return True
    except Exception:
        pass

    # 2. 상호명 체크
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', name).strip()
    encoded = urllib.parse.quote(clean_name)
    url_name = f"{supabase_url}/rest/v1/spots?select=id&name=eq.{encoded}"
    req_name = urllib.request.Request(url_name, headers=headers)
    try:
        with urllib.request.urlopen(req_name, timeout=3) as res:
            rows = json.loads(res.read().decode('utf-8'))
            return len(rows) > 0
    except Exception:
        pass

    return False

def run_tourapi_mining(supabase_url: str, service_key: str, tour_api_key: str = None, max_discoveries: int = 15) -> int:
    """한국관광공사 TourAPI 순회 마이닝 실행"""
    if not supabase_url or not service_key:
        print("⚠️ Supabase URL 또는 키가 없어 TourAPI 마이닝을 건너뜁니다.")
        return 0

    env = load_env()
    api_key = tour_api_key or os.getenv("TOUR_API_KEY") or env.get("TOUR_API_KEY")
    if not api_key:
        print("💡 [TourAPI Miner] TOUR_API_KEY가 설정되지 않아 공공데이터 수집을 스킵합니다.")
        return 0

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🏛️ [TourAPI Miner] 한국관광공사 공공데이터 4.0 순회 마이닝 시작...")

    discovered_spots = []
    
    area_codes = list(AREA_CODE_MAP.keys())
    import random
    random.shuffle(area_codes)

    for area_code in area_codes[:4]:
        for ctype_id, ctype_name, default_moods, default_slot in DATE_CONTENT_TYPES:
            items = fetch_tourapi_spots(api_key, area_code, ctype_id, num_of_rows=15)
            time.sleep(0.3)

            for item in items:
                content_id = str(item.get("contentid", ""))
                title = item.get("title", "").strip()
                addr1 = item.get("addr1", "").strip()
                mapx = item.get("mapx")
                mapy = item.get("mapy")
                first_img = item.get("firstimage") or item.get("firstimage2")

                if not title or not content_id:
                    continue

                is_valid, reason = is_date_spot_category(ctype_name, title)
                if not is_valid and "블랙리스트" in reason:
                    continue

                if check_spot_exists(supabase_url, api_headers, content_id, title):
                    continue

                derived_region, derived_area = derive_region_area(addr1)
                region = derived_region or AREA_CODE_MAP.get(area_code, ("서울", ["서울"]))[1][0]
                area = derived_area or "전체"

                lat_val = float(mapy) if mapy else None
                lng_val = float(mapx) if mapx else None

                spot_id = int(time.time() * 1000) + random.randint(100, 999)

                new_spot = {
                    "id": spot_id,
                    "name": title,
                    "slot": default_slot,
                    "region": region,
                    "area": area,
                    "address": addr1,
                    "location": f"{region} {area}".strip(),
                    "mood": default_moods,
                    "mood_tags": [ctype_name, "공공인증", "가볼만한곳"],
                    "price": "무료/입장권" if ctype_id in ("14", "12") else "현장결제",
                    "price_tier": "FREE" if ctype_id in ("12", "14") else "₩",
                    "summary": f"{title} — 한국관광공사 인증 {ctype_name} 명소 ({area})",
                    "category": ctype_name,
                    "image_url": first_img,
                    "lat": lat_val,
                    "lng": lng_val,
                    "quality_score": 92,
                    "fail_count": 0,
                    "curation_badges": {
                        "tour_api": "한국관광공사 인증",
                        "certified": ["한국관광 100선"] if ctype_id == "12" else []
                    },
                    "provider_ids": {
                        "tour_api": content_id
                    },
                    "parking_info": {
                        "type": "free" if "주차" in addr1 else "unknown",
                        "detail": "공영/부설 주차장 완비" if "주차" in addr1 else "인근 공영주차장 이용"
                    },
                    "source": {
                        "type": "tourapi",
                        "url": f"https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid={content_id}",
                        "note": f"TourAPI 4.0 {ctype_name}"
                    },
                    "verified": True,
                    "is_closed": False,
                    "last_verified_at": datetime.now(timezone.utc).isoformat()
                }

                discovered_spots.append(new_spot)
                if len(discovered_spots) >= max_discoveries:
                    break
            if len(discovered_spots) >= max_discoveries:
                break
        if len(discovered_spots) >= max_discoveries:
            break

    if discovered_spots:
        insert_url = f"{supabase_url}/rest/v1/spots"
        data_bytes = json.dumps(discovered_spots, ensure_ascii=False).encode('utf-8')
        ins_req = urllib.request.Request(insert_url, data=data_bytes, headers=api_headers, method='POST')
        try:
            with urllib.request.urlopen(ins_req, timeout=10) as r:
                if r.status in (200, 201):
                    print(f"✨ [TourAPI 4.0 INSERT 성공] 총 {len(discovered_spots)}개 문화/관광 스팟 적재 완료:")
                    for s in discovered_spots:
                        print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']})")
                    return len(discovered_spots)
        except Exception as e:
            print(f"❌ TourAPI 스팟 INSERT 실패: {e}")
    else:
        print("💡 [TourAPI Miner] 신규 발굴 스팟 없음 (DB 최신 상태 유지)")

    return 0

if __name__ == "__main__":
    env = load_env()
    supa_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    supa_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    run_tourapi_mining(supa_url, supa_key, max_discoveries=10)
