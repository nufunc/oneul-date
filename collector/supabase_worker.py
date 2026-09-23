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
from datetime import datetime, timezone, timedelta
try:
    from fix_spot_summaries import is_bad_summary, generate_curated_summary
except ImportError:
    from .fix_spot_summaries import is_bad_summary, generate_curated_summary

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_env():
    env = {}
    candidates = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.getcwd(), ".env"),
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

_ENV = load_env()
KAKAO_REST_API_KEY = os.environ.get("KAKAO_REST_API_KEY") or _ENV.get("KAKAO_REST_API_KEY") or ""

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.naver.com/",
    "Origin": "https://map.naver.com"
}

def clean_keyword(name: str, location: str = "", address: str = "", region: str = "") -> str:
    clean = re.sub(r'\(.*?\)|\[.*?\]|（.*?）|【.*?】', '', name)
    
    # 화살표/경로 분리 (➔, →, ~)
    if re.search(r'[➔→~]', clean):
        arr_parts = re.split(r'[➔→~]', clean)
        if len(arr_parts[0].strip()) >= 2:
            clean = arr_parts[0].strip()

    # em-dash / en-dash 분리 ( — , – )
    if re.search(r'\s+[—–]\s+', clean):
        dash_parts = re.split(r'\s+[—–]\s+', clean)
        clean = dash_parts[0].strip()

    if ':' in clean:
        parts = clean.split(':')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if ' - ' in clean:
        parts = clean.split(' - ')
        clean = parts[1].strip() if len(parts) > 1 and parts[1].strip() else parts[0].strip()
    if re.search(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean):
        clean = re.split(r'&|\+|↔|&amp;|\s및\s|\s/\s', clean)[0].strip()

    descriptor_regex = (
        r'\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|가죽\s*아틀리에|도예\s*아틀리에|'
        r'갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|'
        r'야시장|먹거리|거리|골목|본점|직영점|요트|보트|샴페인|라운지|바베큐|바베큐장|테라스|그릴|다이닝|'
        r'루프탑|루프탑가든|디너|런치|오마카세|코스요리|패키지|렌탈|이용권|피크닉|캠크닉|캠핑|글램핑|스파|'
        r'사우나|감성|칵테일|와인|위스키|주점|호프|데이트|핫플|분위기좋은|분위기|추천|맛집|셀프사진관|'
        r'놀거리|커피디저트|글래스하우스|프라이빗|온실|파빌리온|럭셔리\s*카바나|카바나|한옥스테이|피제리아|'
        r'파인다이닝|두피\s*라운지|심레이싱\s*라운지|분재\s*갤러리|티하우스|도예\s*스튜디오|인피니티|풀빌라|'
        r'아쿠아\s*빌라|샬레|롯지|전망길|야장\s*골목).*$'
    )
    clean = re.sub(descriptor_regex, '', clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r'\s+(서촌|북촌|홍대본점|일산본점|산본|청담본점)$', '', clean).strip()
    clean = re.sub(r'\s+(서울|경기|인천|강원|충북|충남|전북|전남|경북|경남|제주|부산|대구|광주|대전|울산)\s+[가-힣0-9\s]+(?:구|동|읍|면|로|길)$', '', clean).strip()
    clean = re.sub(r'[^\w\s가-힣0-9.-]', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    lower = clean.lower()
    for eng, kor in KNOWN_MAP.items():
        if eng in lower:
            clean = re.sub(re.escape(eng), kor, clean, flags=re.IGNORECASE)

    # 지역 결합 (주소, location 또는 region에서 시/군/구/동 추출)
    # 시/군/구 단위를 도로명(로/길)보다 먼저 시도한다: "번영로", "호수로" 같은
    # 도로명을 붙이면 네이버·카카오 둘 다 검색이 아예 0건이 되는 경우가
    # 많다(2026-09-22 실측: "조가네갑오징어 왕송호수점 초평로" 0건 vs
    # "조가네갑오징어 왕송호수점 의왕시" 정상 매칭). 도로명은 주소에 시/군/구
    # 토큰이 없는 골목/상권형 스팟에서만 최후 폴백으로 쓴다.
    area_hint = ""
    if address:
        m = re.search(r'([가-힣0-9]+(?:시|군|구))', address)
        if m:
            area_hint = m.group(1)
    if not area_hint and location:
        m = re.search(r'([가-힣0-9]+(?:시|군|구|동|읍|면))', location)
        if m and m.group(1) not in ('전국', '수도권'):
            area_hint = m.group(1)
    if not area_hint and address:
        m = re.search(r'([가-힣0-9]+(?:로|길|동|읍|면))', address)
        if m:
            area_hint = m.group(1)
    if not area_hint and region and region not in ('전국', '수도권'):
        area_hint = region

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

    # 2. 카카오 로컬 공식 API (dapi.kakao.com). 소규모 상호 색인율이 비공식
    # 스크래핑 엔드포인트보다 훨씬 높다 — 2026-09-22 실측: "바이닐시티"류
    # 저인지도 상호가 비공식 엔드포인트에서 지역명을 붙여도 0건이었다.
    # 이미지는 제공하지 않으므로 카테고리/좌표만 채워지고, 이미지는 3번
    # 비공식 폴백이 잡으면 보충한다.
    if KAKAO_REST_API_KEY:
        try:
            k2_url = f"https://dapi.kakao.com/v2/local/search/keyword.json?query={urllib.parse.quote(query)}"
            k2_req = urllib.request.Request(k2_url, headers={"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"})
            with urllib.request.urlopen(k2_req, timeout=5) as k2_res:
                if k2_res.status == 200:
                    k2_data = json.loads(k2_res.read().decode('utf-8'))
                    docs = k2_data.get("documents", [])
                    if docs:
                        return [
                            {
                                "name": d.get("place_name"),
                                "roadAddress": d.get("road_address_name") or d.get("address_name"),
                                "thumUrl": None,
                                "category": d.get("category_name"),
                                "x": d.get("x"),
                                "y": d.get("y"),
                            }
                            for d in docs[:3]
                        ]
        except Exception:
            pass

    # 3. 카카오맵 비공식 실시간 검색 폴백 (공식 API도 못 찾을 때의 마지막 수단.
    # 이미지 썸네일은 공식 API에 없으므로 이 경로가 유일한 이미지 출처이기도 하다)
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

ZONE_STREET_KEYWORDS = [
    "골목", "거리", "먹자골목", "카페거리", "공방거리", "포차거리", "야시장", 
    "전통시장", "시장", "길", "로드", "마을", "단지", "상권", "특화거리", "맛길"
]

def is_zone_street_spot(name: str) -> bool:
    """골목/거리/시장/상권형 스팟 여부 판정"""
    if not name:
        return False
    return any(kw in name for kw in ZONE_STREET_KEYWORDS)

def search_address_or_landmark(query: str):
    """주소 또는 랜드마크 지오코딩으로 좌표 및 정규 주소 획득 (골목/상권 스팟 폴백용)"""
    if not query:
        return None
    # 1. 네이버 지도 주소/장소 검색
    url = f"https://map.naver.com/p/api/search/allSearch?query={urllib.parse.quote(query)}&type=all&searchCoord=&boundary="
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                res_data = data.get("result") or {}
                addr_list = res_data.get("address", {}).get("list", [])
                if addr_list:
                    top = addr_list[0]
                    return {
                        "roadAddress": top.get("roadAddress") or top.get("fullAddress") or top.get("jibunAddress"),
                        "x": top.get("x") or top.get("lng"),
                        "y": top.get("y") or top.get("lat"),
                        "category": "골목/상권 명소"
                    }
                places = res_data.get("place", {}).get("list", []) or res_data.get("site", {}).get("list", [])
                if places:
                    top = places[0]
                    return {
                        "roadAddress": top.get("roadAddress") or top.get("address"),
                        "x": top.get("x") or top.get("lng"),
                        "y": top.get("y") or top.get("lat"),
                        "category": top.get("category") or "골목/상권 명소"
                    }
    except Exception:
        pass

    # 2. 카카오 로컬 공식 API 키워드 검색
    if KAKAO_REST_API_KEY:
        try:
            k2_url = f"https://dapi.kakao.com/v2/local/search/keyword.json?query={urllib.parse.quote(query)}"
            k2_req = urllib.request.Request(k2_url, headers={"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"})
            with urllib.request.urlopen(k2_req, timeout=5) as k2_res:
                if k2_res.status == 200:
                    docs = json.loads(k2_res.read().decode('utf-8')).get("documents", [])
                    if docs:
                        d = docs[0]
                        return {
                            "roadAddress": d.get("road_address_name") or d.get("address_name"),
                            "x": d.get("x"),
                            "y": d.get("y"),
                            "category": d.get("category_name") or "골목/상권 명소"
                        }
        except Exception:
            pass

    # 3. 카카오맵 비공식 주소/장소 검색 (최후 폴백)
    try:
        k_url = f"https://search.map.kakao.com/mapsearch/map.daum?q={urllib.parse.quote(query)}"
        k_req = urllib.request.Request(k_url, headers={"User-Agent": HEADERS["User-Agent"], "Referer": "https://map.kakao.com/"})
        with urllib.request.urlopen(k_req, timeout=5) as k_res:
            if k_res.status == 200:
                k_data = json.loads(k_res.read().decode('utf-8'))
                k_places = k_data.get("place", [])
                if k_places:
                    kp = k_places[0]
                    return {
                        "roadAddress": kp.get("new_address") or kp.get("address"),
                        "x": kp.get("lon"),
                        "y": kp.get("lat"),
                        "category": kp.get("last_cate_name") or "골목/상권 명소"
                    }
    except Exception:
        pass

    return None

def is_polluted_header_name(name: str) -> bool:
    """소제목/헤더형 텍스트 또는 방송/채널명으로 오염된 상호명 여부 판별"""
    if not name:
        return False
    if len(name) >= 25:
        return True
    indicators = [
        " & ", " · ", "복합공간", "명소", "플래그십 &", "살롱 &", "찻자리 &", 
        "다이닝 &", "명품 한옥", "코스 모음", "추천 리스트", "데이트 코스", "감성 핫플",
        "또간집", "풍자", "먹을텐데", "성시경", "줄서는식당", "줄 서는 식당", 
        "맛있는녀석들", "맛있는 녀석들", "놀라운토요일", "수요미식회", "골목식당", "백종원",
        "생활의달인", "전현무계획", "최자로드", "유튜브", "브이로그", "vlog", "shorts"
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


_ADDR_TAIL_TOKEN_RE = re.compile(
    r'^(지하)?\d+층$|^B\d+.*$|^\d+호$|^\d+동$|'
    r'^.*(빌딩|타워|센터|플라자|프라자|스퀘어|하우스|맨션|파크|몰|상가)$'
)


# 광역명 정식 표기/축약 표기가 섞여 있어(예: "경기도" vs "경기") 같은 곳인데도
# 문자열이 달라 중복 검사를 통과하는 걸 막는다. 축약형을 정본으로 삼는다.
_SIDO_ABBREV_MAP = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남",
    "제주도": "제주", "제주특별자치도": "제주",
}


def fix_garbled_sido_prefix(address):
    """카카오 비공식 검색이 광주·전남 지역 주소에 실존하지 않는
    "전남광주통합특별시"를 시도 접두어로 반환하는 경우가 있다(2026-09-22
    확인, 상호명·업종 무관하게 재현되는 카카오 쪽 데이터 문제라 우리
    코드가 만드는 값이 아니다). 다음 토큰이 구로 끝나면 광주, 시/군으로
    끝나면 전남으로 되돌린다.
    """
    prefix = "전남광주통합특별시"
    if not address or not address.startswith(prefix):
        return address
    rest = address[len(prefix):].strip()
    next_token = rest.split()[0] if rest else ""
    sido = "광주" if next_token.endswith("구") else "전남"
    return f"{sido} {rest}".strip()


def normalize_spot_address(address):
    """주소 비교용 정규화: 광역명 표기를 축약형으로 통일하고, 건물명·층·호 등
    뒤쪽 꼬리 토큰을 반복 제거한 뒤 공백 없이 이어붙인다.

    "서울 강남구 도산대로67길 19"와 "서울 강남구 도산대로67길 19 힐탑빌딩 2층"이
    같은 곳을 가리키는데도 문자열이 달라 중복 검사를 통과하는 문제를 막는다.
    원래 주소에 있던 공백 경계로만 꼬리를 잘라내므로 도로명의 숫자(번지)까지
    잘못 지우지 않는다.
    """
    if not address:
        return ""
    tokens = address.strip().split()
    if tokens:
        tokens[0] = _SIDO_ABBREV_MAP.get(tokens[0], tokens[0])
    while tokens and _ADDR_TAIL_TOKEN_RE.match(tokens[-1]):
        tokens.pop()
    return "".join(tokens)


def find_duplicate_spot(supabase_url, headers, name, address=""):
    """상호명(+주소)으로 DB에 이미 있는 스팟인지 확인한다.

    이름은 원형과 괄호 제거본 둘 다로 조회하고, 주소가 주어지면
    normalize_spot_address로 건물명/층 꼬리를 제거한 뒤 비교해 같은 곳을
    가리키는 표기 차이(건물명 유무 등)를 흡수한다. 주소가 없으면 이름
    일치만으로 중복 처리한다(과거 마이너들의 동작과 동일).
    이름이 같아도 주소가 명백히 다르면(동명 다른 지점) 중복으로 보지 않는다.
    조회 자체가 실패하면 수집 파이프라인을 막지 않기 위해 중복 아님으로 간주한다.
    """
    if not name:
        return False
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', name).strip()
    if not clean_name:
        return False
    encoded = urllib.parse.quote(name)
    encoded_clean = urllib.parse.quote(clean_name)
    names_clause = f"name.eq.{encoded}" if encoded == encoded_clean else f"name.eq.{encoded},name.eq.{encoded_clean}"
    url = f"{supabase_url}/rest/v1/spots?select=id,name,address&or=({names_clause})&limit=20"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            rows = json.loads(res.read().decode('utf-8'))
    except Exception:
        return False

    if not rows:
        return False
    if not address:
        return True

    target_addr = normalize_spot_address(address)
    if not target_addr:
        return True
    return any(normalize_spot_address(row.get("address", "")) == target_addr for row in rows)


_PRICE_COMMA_RE = re.compile(r'\d{1,3}(?:,\d{3})+')
_PRICE_MANWON_RE = re.compile(r'(\d+(?:\.\d+)?)\s*만\s*원')
_PRICE_CHEONWON_RE = re.compile(r'(\d+)\s*천\s*원')
_PRICE_PLAIN_NUM_RE = re.compile(r'\d{4,7}')


def derive_price_tier_from_text(price_text):
    """price 자유텍스트에서 avg_price_per_person과 price_tier를 규칙 기반으로
    추출한다. 못 읽으면 (None, None)을 반환한다(추정해서 지어내지 않는다).

    실측(2026-09-21, 활성 12,923건 중 price 채워진 11,168건): 이 규칙으로
    필드가 채워진 것 중 90.4%(전체 활성 기준 78.1%)를 변환할 수 있었다.
    "매장별 상이", "정가제"처럼 숫자가 없는 서술형만 걸러진다(의도한 동작).
    """
    if not price_text:
        return (None, None)
    text = price_text.strip()

    is_free = '무료' in text or text in ('0원', '0')
    avg = None
    if not is_free:
        commas = [int(m.replace(',', '')) for m in _PRICE_COMMA_RE.findall(text)]
        if commas:
            avg = sum(commas) / len(commas)
        else:
            manwon = _PRICE_MANWON_RE.findall(text)
            if manwon:
                avg = sum(float(m) * 10000 for m in manwon) / len(manwon)
            else:
                nums = [int(n) for n in _PRICE_PLAIN_NUM_RE.findall(text)]
                if nums:
                    avg = sum(nums) / len(nums)
                else:
                    cheonwon = _PRICE_CHEONWON_RE.findall(text)
                    if cheonwon:
                        avg = sum(float(m) * 1000 for m in cheonwon) / len(cheonwon)

    if is_free:
        # avg_price_per_person은 INTEGER 컬럼이고 "1인당 평균 가격" 개념 자체가
        # 무료에는 성립하지 않는다. 0을 넣지 않고 null로 둔다.
        return ("FREE", None)

    if avg is None:
        return (None, None)

    if avg < 15000:
        tier = "₩"
    elif avg < 30000:
        tier = "₩₩"
    elif avg < 50000:
        tier = "₩₩₩"
    else:
        tier = "₩₩₩₩"
    # avg_price_per_person은 INTEGER 컬럼이라 float를 그대로 보내면
    # (예: 15500.5) DB가 400으로 거부한다. 반올림해 정수로 반환한다.
    return (tier, int(round(avg)))


# ---------------------------------------------------------------------------
# 슬롯 자동교정 (Slot Healing)
#   네이버/카카오 지도가 실제로 내려주는 "공식 카테고리" 표기를 유일한 판정 근거로
#   삼아 slot(day/evening/night/stay)을 도출한다.
#
#   계약은 derive_region_area 와 동일하다:
#     - 판정 불가면 None 을 반환하고, 호출부는 그 경우 기존 값을 절대 덮어쓰지 않는다.
#     - '모르면 현상 유지'가 기본값. 추측해서 슬롯을 바꾸지 않는다.
#
#   판정 근거를 카테고리로 한정한 이유:
#     상호명은 지오코딩 최근접 POI 흡착·문서 소제목 오염이 섞여 있어 근거로 쓰면
#     추측기가 하나 더 늘어난다. 상호명은 stay 판정을 '거부(veto)'하는 데만 쓴다.
# ---------------------------------------------------------------------------

def _c(patterns):
    return [re.compile(p, re.IGNORECASE) for p in patterns]

# (0) 데이트 스팟 업종이 아예 아닌 카테고리.
#     지오코딩 최근접 POI 흡착 흔적(신한은행/다이소/요양원/교육청 ...)이므로
#     어떤 슬롯의 근거도 되지 못한다 → 무조건 None(현상 유지).
SLOT_NONSPOT_RE = _c([
    r"은행", r"금고", r"증권", r"보험", r"\bATM\b", r"신협", r"새마을금고", r"금융서비스",
    r"지하철", r"출구", r"환승", r"\d호선",
    r"주차장", r"주유소", r"충전소", r"칼텍스", r"오일뱅크", r"주유",
    r"편의점", r"세븐일레븐", r"GS25", r"이마트", r"코스트코", r"올리브영", r"다이소",
    r"백화점", r"쇼핑몰", r"상가", r"아케이드", r"유통", r"도매", r"플라자",
    r"병원", r"의원", r"약국", r"응급실", r"한의원", r"치과", r"의학과", r"요양", r"복지", r"보건소",
    r"학원", r"학교", r"유치원", r"어린이집", r"교육", r"교습", r"수련시설",
    r"경찰", r"소방", r"지구대", r"파출소", r"행정복지", r"주민센터", r"의회", r"관공서",
    r"우체국", r"우편",
    r"아파트", r"오피스텔", r"빌라", r"주택", r"빌딩", r"부동산", r"중개",
    r"건설", r"건축", r"토목", r"인테리어공사", r"인테리어시공", r"공업", r"제조",
    r"산업", r"기계",
    r"철물", r"자재", r"원예업", r"농자재",
    r"자동차", r"카센타", r"카센터", r"정비", r"폐차", r"튜닝", r"렌터카", r"모터스",
    r"양복", r"화장품", r"귀금속", r"보석", r"가구", r"식품", r"전자제품",
    r"미용", r"메이크업", r"네일", r"필라테스", r"헬스", r"체육관", r"스포츠시설",
    r"골프연습장", r"세탁", r"안경",
    r"예식", r"결혼", r"장례", r"교회", r"성당", r"기도원",
    r"기업", r"법인", r"컨설팅", r"광고", r"기획사", r"인터넷", r"에너지", r"가스",
    r"전기", r"전자", r"통신",
    r"물류", r"택배", r"운수", r"화물", r"창고",
    r"단체", r"협회", r"조합", r"공단", r"^공사$", r"본부", r"지사", r"사무소",
    r"지명", r"^기타", r"공간대여", r"시설물", r"시설관리", r"녹음실", r"연예",
])

# (1) 숙박 계열 카테고리 → stay.
#     네이버/카카오 실제 표기 기준: 숙박 / 펜션 / 호텔 / 여관,모텔 / 콘도,리조트 /
#     민박 / 게스트하우스 / 한옥숙소 / 글램핑장 / 야영,캠핑장 / 오토캠핑장 /
#     생활형숙박시설 / 브랜드 체인(롯데호텔·하얏트호텔·소노호텔앤리조트 ...)
SLOT_STAY_RE = _c([
    r"숙박", r"숙소", r"펜션", r"호텔", r"모텔", r"여관", r"콘도", r"리조트",
    r"게스트하우스", r"호스텔", r"민박", r"글램핑", r"야영", r"캠핑", r"카라반",
    r"풀\s*빌라", r"료칸", r"산장", r"롯지", r"별장", r"독채",
    r"\bhotel\b", r"\bresort\b", r"pension", r"\bstay\b", r"glamping", r"hostel",
])

# (1-b) stay 거부(veto) — 상호명이 명백히 '숙박이 아닌 업종'을 말하면 판정을 포기한다.
#     예: 카테고리 '한옥숙소' + 상호명 '전주한옥마을 도예공방 소소' → None
#         카테고리 '하얏트호텔' + 상호명 '파크하앗트부산 리빙룸바' → None
#     veto 는 값을 '쓰지 않는' 방향이라 다소 넓어도 안전하다.
SLOT_STAY_VETO_RE = _c([
    r"카페", r"커피", r"베이커리", r"제과", r"디저트", r"찻집", r"티하우스", r"\bcafe\b",
    r"공방", r"공예", r"체험관", r"박물관", r"미술관", r"갤러리", r"전시",
    r"식당", r"맛집", r"레스토랑", r"다이닝", r"횟집", r"고깃집", r"국수", r"분식",
    r"라운지", r"펍", r"주점", r"포차", r"\bbar\b", r"바$",
    r"공원", r"해수욕장", r"해변", r"폭포", r"전망대", r"수목원", r"식물원", r"시장",
    r"서점", r"도서관", r"사찰", r"휴양림", r"올레길", r"둘레길", r"산책로", r"마을$",
])

# (1-c) 상호명이 명백한 숙박업소인데 카테고리가 비(非)숙박인 경우
#     (예: 상호명 '시그니엘 STAY' + 카테고리 '프랑스음식' — 건물 내 식당이 흡착된 것)
#     카테고리만 믿고 숙소를 강등하면 오히려 데이터가 깨진다 → 판정 포기.
#     단 상호명에도 업종 신호(바/레스토랑/카페 ...)가 함께 있으면 그쪽을 신뢰한다
#     (예: 'JW 메리어트 호텔 모보 바' + '칵테일바' → night).
SLOT_LODGING_NAME_RE = _c([
    r"호텔", r"리조트", r"펜션", r"풀\s*빌라", r"글램핑", r"스테이(?!크)", r"숙소",
    r"게스트하우스", r"료칸", r"민박", r"모텔", r"\bstay\b", r"\bhotel\b", r"\bresort\b",
])

# (2) 야간(술) 계열 → night. '바'는 단어 경계 주의('바다' 오매칭 금지).
SLOT_NIGHT_RE = _c([
    r"(와인|칵테일|루프탑|재즈|몰트|위스키|하이볼|오뎅|스탠딩|스피크이지|라운지)\s*바(?!다)",
    r"바\(bar\)", r"\bbar\b", r"\bpub\b", r"펍",
    r"호프", r"주점", r"술집", r"포차", r"포장마차", r"이자카야", r"바텐더",
    r"칵테일", r"위스키", r"막걸리", r"전통주", r"맥주", r"브루어리", r"야경", r"나이트",
])

# (3) 식사/다이닝 계열 → evening.
SLOT_EVENING_RE = _c([
    r"음식점", r"한식", r"양식", r"일식", r"중식", r"분식", r"뷔페", r"레스토랑",
    r"다이닝", r"오마카세", r"이탈리", r"프랑스음식", r"베트남음식", r"태국음식",
    r"멕시칸", r"브라질", r"아시아음식", r"인도음식", r"퓨전", r"한정식", r"노포",
    r"육류", r"고기", r"갈비", r"삼겹살", r"곱창", r"막창", r"닭요리", r"치킨",
    r"오리", r"장어", r"국밥", r"칼국수", r"국수", r"돈까스", r"우동", r"순대",
    r"떡볶이", r"샤브샤브", r"스테이크", r"파스타", r"피자", r"햄버거",
    r"해물", r"생선", r"해산물", r"조개", r"전복", r"대게", r"초밥", r"스시", r"횟집",
    r"먹자골목", r"맛집", r"식당", r"요리",
])

# (4) 낮(카페·문화·자연·체험) 계열 → day.
SLOT_DAY_RE = _c([
    r"카페", r"커피", r"베이커리", r"제과", r"빵집", r"디저트", r"빙수", r"브런치",
    r"찻집", r"티하우스", r"아이스크림", r"도넛", r"케이크", r"초콜릿", r"한과",
    r"샌드위치", r"과실음료", r"청량음료", r"음료", r"\bcafe\b",
    r"미술관", r"박물관", r"전시", r"갤러리", r"화랑", r"문화시설", r"문화원",
    r"문화센터", r"기념관", r"도서관", r"서점", r"책방", r"과학관", r"천문대",
    r"공원", r"관광", r"명소", r"유원지", r"테마파크", r"정원", r"수목원", r"식물원",
    r"해수욕장", r"해변", r"전망대", r"봉우리", r"계곡", r"폭포", r"호수", r"저수지",
    r"연못", r"하천", r"오름", r"^섬", r"항구", r"등대", r"숲", r"휴양림",
    r"둘레길", r"올레길", r"해파랑길", r"갈맷길", r"도보여행", r"산책", r"광장",
    r"고개", r"교량", r"다리", r"습지",
    r"유적", r"성곽", r"산성", r"사찰", r"고택", r"생가", r"릉", r"고궁", r"궁궐",
    r"한옥마을", r"민속마을",
    r"체험", r"공방", r"공예", r"도예", r"도자기", r"클래스", r"방탈출", r"보드게임",
    r"볼링", r"당구", r"사진관", r"포토", r"스튜디오", r"인생네컷", r"즉석사진",
    r"동물원", r"수족관", r"아쿠아리움", r"목장", r"농장", r"승마", r"케이블카",
    r"루지", r"요트", r"카약", r"수상스포츠", r"레저", r"관광농원",
    r"온천", r"사우나", r"목욕", r"찜질", r"스파", r"워터파크", r"워터테마파크",
    r"시장", r"카페거리", r"테마거리", r"꽃집", r"플라워", r"소품", r"편집샵",
    r"잡화", r"패션잡화", r"의류", r"주방용품", r"생활용품", r"문구", r"팬시", r"리빙",
    r"인테리어장식", r"인테리어소품", r"향수", r"캔들", r"디퓨저", r"골동품",
    r"빈티지", r"레코드", r"음반", r"라이프스타일", r"팝업",
    r"복합문화", r"미술,공예", r"음악감상",
])

# (5) 1~2자 카테고리 토큰은 부분일치 오탐이 커서 '정확히 일치'할 때만 인정한다.
SLOT_EXACT_TOKENS = {
    "산": "day", "섬": "day", "숲": "day", "성": "day", "떡": "day", "빵": "day",
    "회": "evening", "면": "evening",
    "바": "night", "술": "night",
}


def derive_slot(category, name=""):
    """네이버 공식 카테고리를 근거로 slot 을 도출한다.

    - 반환: "stay" | "day" | "evening" | "night" | None
    - None 은 '판정 불가'이며, 호출부는 기존 slot 을 절대 덮어쓰면 안 된다.
    - 판정 근거는 category 뿐이다. name 은 stay 오판을 거부(veto)하는 데만 쓴다.
    """
    cat = (category or "")
    if not isinstance(cat, str):
        return None
    cat = cat.strip()
    if not cat:
        return None

    nm = (name or "").strip() if isinstance(name, str) else ""

    # 0. 비(非)스팟 업종 = 오염된 카테고리 → 근거로 쓰지 않는다
    if any(p.search(cat) for p in SLOT_NONSPOT_RE):
        return None

    # 1. 숙박 계열 (상호명이 명백한 비숙박 업종이면 판정 포기)
    if any(p.search(cat) for p in SLOT_STAY_RE):
        if nm and any(p.search(nm) for p in SLOT_STAY_VETO_RE):
            return None
        return "stay"

    # 2. 야간 → 3. 저녁 → 4. 낮 (infer_slot 계열 규칙과 동일한 우선순위)
    verdict = None
    if any(p.search(cat) for p in SLOT_NIGHT_RE):
        verdict = "night"
    elif any(p.search(cat) for p in SLOT_EVENING_RE):
        verdict = "evening"
    elif any(p.search(cat) for p in SLOT_DAY_RE):
        verdict = "day"
    else:
        # 5. 짧은 토큰 정확 일치
        for tok in re.split(r"[>,/·|]", cat):
            tok = tok.strip()
            if tok in SLOT_EXACT_TOKENS:
                verdict = SLOT_EXACT_TOKENS[tok]
                break

    # 6. 화이트리스트 어디에도 없는 카테고리 → 판정 불가 (현상 유지)
    if verdict is None:
        return None

    # 7. 상호명이 숙박업소인데 업종 신호가 없으면 강등하지 않는다 (1-c 참조)
    if nm and any(p.search(nm) for p in SLOT_LODGING_NAME_RE) \
            and not any(p.search(nm) for p in SLOT_STAY_VETO_RE):
        return None

    return verdict


def _env_flag(name, env=None):
    """환경변수(또는 .env) 값이 truthy 인지 판별"""
    raw = os.getenv(name)
    if raw is None and env is not None:
        raw = env.get(name)
    return str(raw or "").strip().lower() in ("1", "true", "yes", "y", "on")


def run_worker(supabase_url: str, service_key: str, limit: int = 50):
    if not supabase_url or not service_key:
        print("❌ Supabase 환경변수가 설정되지 않았습니다 (SUPABASE_URL, SUPABASE_SERVICE_KEY).")
        return

    supabase_url = supabase_url.rstrip("/")

    # [Slot Healing] 안전장치 플래그
    #   SLOT_HEAL_DRYRUN : truthy 면 로그만 찍고 PATCH 에 slot 을 넣지 않는다 (기본 off)
    #   SLOT_HEAL_ALL    : truthy 면 day/evening/night 사이 재배치까지 교정한다.
    #                      기본(off)은 'stay 축' 교정만 — 문서에서 명시적으로 부여된
    #                      day/evening/night 를 카테고리 한 토큰으로 뒤엎지 않기 위함.
    _env = load_env()
    slot_heal_dryrun = _env_flag("SLOT_HEAL_DRYRUN", _env)
    slot_heal_all = _env_flag("SLOT_HEAL_ALL", _env)
    if slot_heal_dryrun:
        print("🧪 [Slot Healing] DRY-RUN 모드 — 슬롯 교정 로그만 남기고 DB 에는 쓰지 않습니다.")

    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1. 검증 및 고도화 대상 스팟 가져오기 (오래된 순, 최소 24시간 쿨다운)
    # 이미 최근 24시간 이내에 검증된 스팟은 재검증하지 않고 스킵 (하루 1회 정밀 순환)
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    or_clause = urllib.parse.quote(f"(updated_at.is.null,updated_at.lt.{cutoff_24h})")
    query_url = f"{supabase_url}/rest/v1/spots?select=*&is_closed=eq.false&or={or_clause}&order=updated_at.asc.nullsfirst,id.asc&limit={limit}"
    req = urllib.request.Request(query_url, headers=api_headers)

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            spots = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ Supabase 조회 오류: {e}")
        return

    if not spots:
        print("✅ [1단계 검증 스킵] 최근 24시간 이내에 모든 정상 스팟이 검증 완료되었습니다. (0건 처리)")
        return

    print(f"🔄 OCI VM 고도화 엔진 시작: {len(spots)}개 스팟 심층 분석 및 동기화...")

    enriched_count = 0
    verified_count = 0
    region_fixed_count = 0
    slot_fixed_count = 0
    summary_fixed_count = 0
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

        # 3차 검색 (골목/거리/시장/상권 스팟: 지오코딩 및 랜드마크 폴백)
        if not places and is_zone_street_spot(name):
            geo_res = search_address_or_landmark(keyword) or search_address_or_landmark(name)
            if not geo_res and addr:
                geo_res = search_address_or_landmark(addr)
            if not geo_res and loc:
                geo_res = search_address_or_landmark(loc)
            if geo_res:
                places = [geo_res]

        patch_data = {}
        if places and len(places) > 0:
            # 1위 결과가 비스팟(주차장, 아파트, 은행 등)이면 2~3위 중 정상 데이트 장소 탐색
            best_place = None
            for p in places:
                p_cat = p.get("category") or ""
                if not isinstance(p_cat, str):
                    p_cat = str(p_cat)
                if not any(pat.search(p_cat) for pat in SLOT_NONSPOT_RE):
                    best_place = p
                    break
            top = best_place if best_place else places[0]
            road_addr = fix_garbled_sido_prefix(top.get("roadAddress") or top.get("address"))

            # 권역 충돌 방지: 기존 reg가 명확한데 검색된 주소가 타 권역이면 권역 힌트로 재검색
            if reg and reg not in ('전국', '수도권') and road_addr:
                d_reg, _ = derive_region_area(road_addr)
                if d_reg and d_reg != reg:
                    retry_places = search_naver(f"{name} {reg}")
                    time.sleep(0.1)
                    if retry_places:
                        for rp in retry_places:
                            r_addr = fix_garbled_sido_prefix(rp.get("roadAddress") or rp.get("address"))
                            if r_addr:
                                r_reg, _ = derive_region_area(r_addr)
                                if r_reg == reg:
                                    top = rp
                                    road_addr = r_addr
                                    break

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

            now_iso = datetime.now(timezone.utc).isoformat()
            patch_data = {
                "verified": True,
                "is_closed": False,
                "fail_count": 0,
                "quality_score": calculate_quality_score(spot, place_meta),
                "updated_at": now_iso
            }

            # [Provider ID 추적]
            top_id = top.get("id") or top.get("placeId")
            if top_id:
                p_ids = spot.get("provider_ids") or {}
                if not isinstance(p_ids, dict):
                    p_ids = {}
                p_ids["naver"] = str(top_id)
                patch_data["provider_ids"] = p_ids

            # [Auto-Healing] 소제목으로 오염된 상호명을 네이버 공식 상호명으로 자동 치유
            if is_polluted_header_name(name):
                official_name = top.get("name", "").strip()
                if official_name and len(official_name) < 25 and official_name != name:
                    patch_data["name"] = official_name
                    old_sum = spot.get("summary") or ""
                    patch_data["summary"] = f"{name} — {old_sum}"[:150] if old_sum and old_sum not in name else name

            # [Noise Quarantine] 단독 지명, 2자 이하 일반명사, 오염 헤더명은 자동 격리
            check_name = patch_data.get("name") or name
            if len(check_name) <= 2 or check_name in ["서울", "경기", "인천", "강원", "충청", "영남", "호남", "제주", "부산", "대구", "울산", "광주", "대전", "세종", "한남", "압구정", "카페", "곱창전골", "맛집", "식당"]:
                patch_data["is_closed"] = True

            if road_addr and not spot.get("address"):
                patch_data["address"] = road_addr

            # [Region & Location Healing] 검증된 주소를 근거로 region/area/location 오염을 교정한다.
            # 기존 값이 이미 있어도 주소 근거가 있으면 덮어쓴다(도출 실패 시에만 보존).
            if road_addr:
                d_region, d_area = derive_region_area(road_addr)
                if d_region or d_area:
                    old_region = spot.get("region")
                    old_area = spot.get("area")
                    old_loc = spot.get("location")
                    fixed = False
                    if d_region and d_region != old_region:
                        patch_data["region"] = d_region
                        fixed = True
                    if d_area and d_area != old_area:
                        patch_data["area"] = d_area
                        fixed = True
                    
                    calc_loc = f"{d_region or old_region or ''} {d_area or old_area or ''}".strip()
                    if calc_loc and calc_loc != old_loc:
                        patch_data["location"] = calc_loc
                        fixed = True

                    if fixed:
                        region_fixed_count += 1
                        print(
                            f"  🔧 [Region & Location Fix] id={s_id} "
                            f"'{old_loc or '-'}' → '{calc_loc}' "
                            f"({road_addr})"
                        )

            # [Slot Healing] 네이버 공식 카테고리를 근거로 slot 오염 및 누락 교정
            heal_cat = place_meta.get("category") or spot.get("category") or ""
            heal_name = patch_data.get("name") or name or ""
            d_slot = derive_slot(heal_cat, heal_name)
            old_slot = spot.get("slot")
            if d_slot and (not old_slot or (d_slot != old_slot and (slot_heal_all or "stay" in (d_slot, old_slot)))):
                slot_fixed_count += 1
                print(
                    f"  🔧 [Slot Fix]{' [DRY-RUN]' if slot_heal_dryrun else ''} id={s_id} "
                    f"{old_slot or '(누락)'} → {d_slot} (네이버: {heal_cat})"
                )
                if not slot_heal_dryrun:
                    patch_data["slot"] = d_slot

            # 2026-09-21 제거: [Lodging Quarantine]이 숙박/펜션/호텔/글램핑 업소를
            # 무조건 is_closed=True로 자동 격리했다. stay가 아직 정식 슬롯이 아니던
            # 시절("당일치기 코스 대상이 아니다") 설계로, 지금은 stay가 정식 슬롯이라
            # (category_filter.py의 allow_lodging 게이트로 오늘 수집 경로도 새로
            # 열어뒀다) 이 로직이 그 수집분을 다음 재검증 주기마다 도로 닫아버린다.
            # slot="stay" 태깅은 위 [Slot Healing] 블록이 derive_slot()로 이미 처리한다.

            if thum and not spot.get("image_url"):
                patch_data["image_url"] = thum
                enriched_count += 1
            if lat_val and lng_val and not spot.get("lat"):
                patch_data["lat"] = lat_val
                patch_data["lng"] = lng_val
                enriched_count += 1
            # [Category Healing] 기존 카테고리가 없거나 비스팟 오염(은행/다이소/요양원 등)인 경우에만 교정
            if category:
                new_cat_str = str(category).strip()
                old_cat = (spot.get("category") or "").strip()
                is_old_polluted = any(p.search(old_cat) for p in SLOT_NONSPOT_RE) if old_cat else True
                if not old_cat or is_old_polluted:
                    patch_data["category"] = new_cat_str
                    if old_cat and new_cat_str != old_cat:
                        print(f"  🔧 [Category Fix] id={s_id} '{old_cat}' → '{new_cat_str}'")

            # [Summary Healing] 판박이 더미 문구 발견 시 에디토리얼 자동 치유
            current_summary = spot.get("summary") or ""
            target_name = patch_data.get("name") or name
            if is_bad_summary(current_summary, target_name) or not current_summary:
                target_cat = patch_data.get("category") or spot.get("category") or ""
                target_area = patch_data.get("area") or spot.get("area") or ""
                target_reg = patch_data.get("region") or spot.get("region") or ""
                target_sigs = spot.get("signature_items") or []
                
                curated_summary = generate_curated_summary(target_name, target_cat, target_area, target_reg, target_sigs)
                if curated_summary and curated_summary != current_summary:
                    patch_data["summary"] = curated_summary
                    summary_fixed_count += 1
                    print(f"  🔧 [Summary Fix] id={s_id} '{current_summary[:30]}' → '{curated_summary[:30]}'")

            # [Price Healing] price 자유텍스트에서 price_tier/avg_price_per_person을
            # 규칙 기반으로 추출해 비어있으면 채운다(추정 금지, 못 읽으면 그대로 공백).
            if not spot.get("price_tier") and not spot.get("avg_price_per_person"):
                price_text = patch_data.get("price") or spot.get("price") or ""
                derived_tier, derived_avg = derive_price_tier_from_text(price_text)
                if derived_tier:
                    patch_data["price_tier"] = derived_tier
                    patch_data["avg_price_per_person"] = derived_avg

            verified_count += 1
        else:
            # 3단계 다단계 폐업 안전 판별 (골목/거리/상권 스팟은 폐업 격리에서 면제 보호)
            #
            # 2026-09-21 임시 비활성화: search_naver()가 부르는 네이버 지도 비공식
            # API가 ncaptcha 봇 차단 게이트를 새로 걸어(실측: "홍종흔베이커리 본점"
            # 등 정상 업체 조회가 100% ncaptcha-all-search-no-result로 실패) 3회
            # 연속 실패가 실제 폐업이 아니라 캡차 차단 때문에 발생하고 있었다.
            # is_closed=True는 이후 재검증 쿼리(is_closed=eq.false)에서 영구 제외돼
            # 복구 경로가 없어, 최근 8일간 정상 스팟 6,700여 건이 잘못 격리됐다.
            # 네이버 캡차 우회(또는 카카오 폴백의 상호명 일치 검증) 전까지 fail_count
            # 기반 자동 폐업을 중단한다. 임계값을 높여 로직은 남기고 발동만 막는다.
            now_iso = datetime.now(timezone.utc).isoformat()
            new_fail = fail_count + 1
            AUTO_CLOSE_DISABLED_THRESHOLD = 999999
            if new_fail >= AUTO_CLOSE_DISABLED_THRESHOLD and not is_zone_street_spot(name):
                patch_data = {
                    "is_closed": True,
                    "fail_count": new_fail,
                    "updated_at": now_iso
                }
                closed_count += 1
                print(f"  ⚠️ [3회 연속 검색 실패 -> 폐업 격리] id: {s_id}, name: {name}")
            else:
                patch_data = {
                    "verified": True if is_zone_street_spot(name) else False,
                    "fail_count": new_fail,
                    "updated_at": now_iso
                }
                fail_warn_count += 1

        # Supabase UPDATE (컬럼 부재 시 자동 복구 재시도)
        if patch_data:
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            patch_bytes = json.dumps(patch_data).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_bytes, headers=api_headers, method='PATCH')
            try:
                urllib.request.urlopen(patch_req, timeout=6)
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode('utf-8', errors='replace')
                # 'column ... does not exist' 에러 시 미존재 컬럼(last_verified_at 등) 제거 후 1회 재시도
                if "does not exist" in err_msg and "last_verified_at" in patch_data:
                    safe_patch = {k: v for k, v in patch_data.items() if k != "last_verified_at"}
                    try:
                        safe_bytes = json.dumps(safe_patch).encode('utf-8')
                        safe_req = urllib.request.Request(patch_url, data=safe_bytes, headers=api_headers, method='PATCH')
                        urllib.request.urlopen(safe_req, timeout=6)
                    except Exception as retry_err:
                        print(f"  ❌ DB 업데이트 재시도 실패 (id: {s_id}): {retry_err}")
                else:
                    print(f"  ❌ DB 업데이트 실패 (id: {s_id}, HTTP {e.code}): {err_msg}")
            except Exception as e:
                print(f"  ❌ DB 업데이트 실패 (id: {s_id}): {e}")

    slot_note = " (DRY-RUN, 미반영)" if slot_heal_dryrun else ""
    print(f"✅ OCI 엔진 완료: 정상검증 {verified_count}건, 신규메타보강 {enriched_count}건, 지역교정 {region_fixed_count}건, 슬롯교정 {slot_fixed_count}건{slot_note}, 설명교정 {summary_fixed_count}건, 주의플래그 {fail_warn_count}건, 폐업격리 {closed_count}건")

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
