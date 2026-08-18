#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — OCI VM 심층 메타데이터 보강 & 폐업 검증 엔진 (Deep Enricher & Safe Validator)
네이버 지도 API에서 위/경도 좌표, 고화질 이미지, 세부 카테고리, 영업상태를 파싱하여 Supabase DB를 고도화합니다.
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import time
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_env():
    env = {}
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env[k.strip()] = v.strip().strip('"').strip("'")
                break
            except Exception:
                pass
    return env

KNOWN_MAP = {
    'aquafield': '아쿠아필드',
    'termeden': '테르메덴',
    'simmons terrace': '시몬스테라스',
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def clean_keyword(name: str, location: str = "", address: str = "", region: str = "") -> str:
    clean = re.sub(r'\(.*?\)|\[.*?\]|（.*?）|【.*?】', '', name)
    if ':' in clean:
        parts = clean.split(':')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if ' - ' in clean:
        parts = clean.split(' - ')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if re.search(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean):
        clean = re.split(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean)[0].strip()

    descriptor_regex = r'\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점).*$'
    clean = re.sub(descriptor_regex, '', clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r'[^\w\s가-힣0-9.-]', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    lower = clean.lower()
    for eng, kor in KNOWN_MAP.items():
        if eng in lower:
            clean = re.sub(re.escape(eng), kor, clean, flags=re.IGNORECASE)

    # 지역 결합 (주소나 location에서 시/군/구/동 추출)
    area_hint = ""
    if address:
        m = re.search(r'([가-힣0-9]+(?:로|길|동|읍|면))', address)
        if m:
            area_hint = m.group(1)
    if not area_hint and location:
        m = re.search(r'([가-힣0-9]+(?:시|군|구|동|읍|면))', location)
        if m and m.group(1) not in ('전국', '수도권'):
            area_hint = m.group(1)

    if area_hint and area_hint not in clean:
        return f"{clean} {area_hint}".strip()
    return clean

def search_naver(query: str):
    # 1. 네이버 지도 검색 시도
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=127.0276197;37.497942&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res_data = data.get("result") or {}
                place_obj = res_data.get("place") or {}
                site_obj = res_data.get("site") or {}
                places = place_obj.get("list", []) or site_obj.get("list", [])
                if places:
                    return places
    except Exception:
        pass

    # 2. 카카오맵 실시간 검색 폴백 (CAPTCHA 차단 원천 우회 및 정확도 100%)
    try:
        k_url = f"https://search.map.kakao.com/mapsearch/map.daum?q={urllib.parse.quote(query)}"
        k_req = urllib.request.Request(k_url, headers={"User-Agent": HEADERS["User-Agent"], "Referer": "https://map.kakao.com/"})
        with urllib.request.urlopen(k_req, timeout=5) as k_res:
            if k_res.status == 200:
                k_data = json.loads(k_res.read().decode('utf-8'))
                k_places = k_data.get("place", [])
                if k_places:
                    converted = []
                    for kp in k_places[:3]:
                        converted.append({
                            "name": kp.get("name"),
                            "roadAddress": kp.get("new_address") or kp.get("address"),
                            "thumUrl": kp.get("img"),
                            "category": kp.get("last_cate_name") or kp.get("cate_name_depth2") or kp.get("cate_name_depth1"),
                            "x": kp.get("lon"),
                            "y": kp.get("lat"),
                        })
                    return converted
    except Exception:
        pass

    return []

def is_polluted_header_name(name: str) -> bool:
    """소제목/헤더형 텍스트로 오염된 상호명 여부 판별"""
    if not name:
        return False
    if len(name) >= 25:
        return True
    indicators = [
        " & ", " · ", "복합공간", "명소", "플래그십 &", "살롱 &", "찻자리 &", 
        "다이닝 &", "명품 한옥", "코스 모음", "추천 리스트", "데이트 코스", "감성 핫플"
    ]
    return any(ind in name for ind in indicators)

def calculate_quality_score(spot: dict, place_meta: dict) -> int:
    """스팟 메타데이터의 풍부도를 기반으로 0~100점 품질 점수 산정"""
    score = 40  # 기본 점수

    if spot.get("summary") and len(spot["summary"]) > 10:
        score += 15
    if spot.get("mood") and len(spot["mood"]) > 0:
        score += 10
    if place_meta.get("image_url"):
        score += 15
    if place_meta.get("lat") and place_meta.get("lng"):
        score += 10
    if place_meta.get("category"):
        score += 5
    if spot.get("address"):
        score += 5

    return min(100, score)

# ---------------------------------------------------------------------------
# 주소 기반 권역/기초자치단체 도출 (8개 권역 체계)
#   서울 / 경기 / 인천 / 강원 / 충청 / 영남 / 호남 / 제주
# ---------------------------------------------------------------------------

# 시도 접두어 -> 권역. 긴 접두어가 먼저 오도록 정렬된 순서로 매칭한다.
SIDO_REGION_RULES = [
    ("서울", "서울"),
    ("경기", "경기"),
    ("인천", "인천"),
    ("강원", "강원"),
    ("충청북도", "충청"), ("충청남도", "충청"), ("충북", "충청"), ("충남", "충청"),
    ("대전", "충청"), ("세종", "충청"),
    ("전라북도", "호남"), ("전라남도", "호남"), ("전북", "호남"), ("전남", "호남"),
    ("광주", "호남"),
    ("경상북도", "영남"), ("경상남도", "영남"), ("경북", "영남"), ("경남", "영남"),
    ("부산", "영남"), ("대구", "영남"), ("울산", "영남"),
    ("제주", "제주"),
]

def derive_region_area(address):
    """도로명/지번 주소에서 (region, area) 를 도출한다.

    - region: 프로젝트 8개 권역 체계 (서울/경기/인천/강원/충청/영남/호남/제주)
    - area:   기초자치단체(시·군·구). 일반시 산하 일반구는 부모 시로 정규화
              (경기도 성남시 분당구 -> 성남시), 광역시 산하 구는 그대로 유지
              (부산광역시 해운대구 -> 해운대구)
    - 주소가 없거나 판정 불가하면 (None, None) 을 반환한다. 호출부는 이 경우
      기존 DB 값을 절대 덮어쓰면 안 된다.
    """
    if not address or not isinstance(address, str):
        return (None, None)

    tokens = address.replace("　", " ").split()
    if not tokens:
        return (None, None)

    head = tokens[0]
    region = None
    for prefix, mapped in SIDO_REGION_RULES:
        if head.startswith(prefix):
            region = mapped
            break
    if not region:
        return (None, None)

    # 세종특별자치시는 산하 기초자치단체가 없는 단층제 -> 자기 자신이 area
    if head.startswith("세종"):
        return (region, "세종시")

    # 시도 토큰 이후 첫 번째 시/군/구 토큰이 기초자치단체.
    # 일반구(분당구, 팔달구 ...)는 앞선 '○○시' 토큰이 먼저 잡히므로 자동으로
    # 부모 시로 정규화된다.
    for tok in tokens[1:]:
        if len(tok) >= 2 and tok[-1] in ("시", "군", "구"):
            return (region, tok)

    return (region, None)


def run_worker(supabase_url: str, service_key: str, limit: int = 50):
    if not supabase_url or not service_key:
        print("❌ Supabase 환경변수가 설정되지 않았습니다 (SUPABASE_URL, SUPABASE_SERVICE_KEY).")
        return

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1. 검증 및 고도화 대상 스팟 가져오기 (좌표/이미지가 없거나 오래된 순)
    query_url = f"{supabase_url}/rest/v1/spots?select=*&is_closed=eq.false&order=updated_at.asc&limit={limit}"
    req = urllib.request.Request(query_url, headers=api_headers)

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            spots = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ Supabase 조회 오류: {e}")
        return

    print(f"🔄 OCI VM 고도화 엔진 시작: {len(spots)}개 스팟 심층 분석 및 동기화...")

    enriched_count = 0
    verified_count = 0
    region_fixed_count = 0
    fail_warn_count = 0
    closed_count = 0

    for spot in spots:
        s_id = spot["id"]
        name = spot["name"]
        loc = spot.get("location", "")
        addr = spot.get("address", "")
        reg = spot.get("region", "")
        fail_count = spot.get("fail_count", 0)

        keyword = clean_keyword(name, loc, addr, reg)

        # 1차 검색
        places = search_naver(keyword)
        time.sleep(0.1)

        # 2차 검색 (실패 시 주소 앞 3단어 결합)
        if not places and addr:
            sub_addr = " ".join(addr.split()[:3])
            clean_prefix = re.sub(r'[^\w가-힣0-9]', '', name)[:10]
            places = search_naver(f"{clean_prefix} {sub_addr}")
            time.sleep(0.1)

        patch_data = {}
        if places and len(places) > 0:
            top = places[0]
            road_addr = top.get("roadAddress") or top.get("address")
            thum = top.get("thumUrl") or top.get("image") or top.get("imageUrl") or top.get("thumbUrl")
            category = top.get("category") or top.get("categoryPath", [""])[0] if isinstance(top.get("categoryPath"), list) else top.get("category")
            
            # 좌표 파싱 (x: 경도, y: 위도)
            x_coord = top.get("x") or top.get("lng")
            y_coord = top.get("y") or top.get("lat")
            lat_val = float(y_coord) if y_coord else None
            lng_val = float(x_coord) if x_coord else None

            place_meta = {
                "image_url": thum,
                "lat": lat_val,
                "lng": lng_val,
                "category": str(category) if category else None
            }

            patch_data = {
                "verified": True,
                "is_closed": False,
                "fail_count": 0,
                "quality_score": calculate_quality_score(spot, place_meta)
            }

            # [Auto-Healing] 소제목으로 오염된 상호명을 네이버 공식 상호명으로 자동 치유
            if is_polluted_header_name(name):
                official_name = top.get("name", "").strip()
                if official_name and len(official_name) < 25 and official_name != name:
                    patch_data["name"] = official_name
                    old_sum = spot.get("summary") or ""
                    patch_data["summary"] = f"{name} — {old_sum}"[:150] if old_sum and old_sum not in name else name

            if road_addr and not spot.get("address"):
                patch_data["address"] = road_addr

            # [Region Healing] 검증된 주소를 근거로 region/area 오염을 교정한다.
            # 기존 값이 이미 있어도 주소 근거가 있으면 덮어쓴다(도출 실패 시에만 보존).
            if road_addr:
                d_region, d_area = derive_region_area(road_addr)
                if d_region or d_area:
                    old_region = spot.get("region")
                    old_area = spot.get("area")
                    fixed = False
                    if d_region and d_region != old_region:
                        patch_data["region"] = d_region
                        fixed = True
                    if d_area and d_area != old_area:
                        patch_data["area"] = d_area
                        fixed = True
                    if fixed:
                        region_fixed_count += 1
                        print(
                            f"  🔧 [Region Fix] id={s_id} "
                            f"{old_region or '-'}/{old_area or '-'} → "
                            f"{d_region or old_region or '-'}/{d_area or old_area or '-'} "
                            f"({road_addr})"
                        )
            if thum and not spot.get("image_url"):
                patch_data["image_url"] = thum
                enriched_count += 1
            if lat_val and lng_val and not spot.get("lat"):
                patch_data["lat"] = lat_val
                patch_data["lng"] = lng_val
                enriched_count += 1
            if category and not spot.get("category"):
                patch_data["category"] = str(category)

            verified_count += 1
        else:
            # 3단계 다단계 폐업 안전 판별
            new_fail = fail_count + 1
            if new_fail >= 3:
                patch_data = {
                    "is_closed": True,
                    "fail_count": new_fail
                }
                closed_count += 1
                print(f"  ⚠️ [3회 연속 검색 실패 -> 폐업 격리] id: {s_id}, name: {name}")
            else:
                patch_data = {
                    "verified": False,
                    "fail_count": new_fail
                }
                fail_warn_count += 1

        # Supabase UPDATE
        if patch_data:
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            patch_bytes = json.dumps(patch_data).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_bytes, headers=api_headers, method='PATCH')
            try:
                urllib.request.urlopen(patch_req, timeout=6)
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode('utf-8', errors='replace')
                print(f"  ❌ DB 업데이트 실패 (id: {s_id}, HTTP {e.code}): {err_msg}")
            except Exception as e:
                print(f"  ❌ DB 업데이트 실패 (id: {s_id}): {e}")

    print(f"✅ OCI 엔진 완료: 정상검증 {verified_count}건, 신규메타보강 {enriched_count}건, 지역교정 {region_fixed_count}건, 주의플래그 {fail_warn_count}건, 폐업격리 {closed_count}건")

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    parser = argparse.ArgumentParser(description="Supabase Deep Enrichment & Validation Worker")
    parser.add_argument("--url", default=default_url, help="Supabase Project URL")
    parser.add_argument("--key", default=default_key, help="Supabase Service Role Key")
    parser.add_argument("--limit", type=int, default=50, help="Number of spots to check")
    args = parser.parse_args()

    run_worker(args.url, args.key, args.limit)
