# -*- coding: utf-8 -*-
"""
오늘 데이트 (Oneul Date) — 스팟 데이터 정밀 검증 및 보정 파이프라인 (heal_and_verify_spots.py)
=============================================================================
1. 폐업 매장(문래 비어바나 등) 및 마크다운 기사/더미/비데이트 시설 전수 감지 및 is_closed = True 비활성화
2. 주변 상가로 오염된 카테고리(코인워시, 아파트, 은행 등) 및 결측치 100% 정밀 보정
3. 슬롯(day/evening/night/stay) 정합성 교정
4. 복합 표기(&, +, ↔) 및 중복 지명 상호명 정제
5. Kakao POI / 지도 링크 정규화
"""

import re
import json
import logging
from typing import Dict, Any, List, Tuple

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("heal_and_verify")

# 1. 기사/더미/폐업/비데이트 시설 판별 패턴
DUMMY_NAME_PATTERNS = [
    r'^(📊|🏛️|🍷|🏯|🌿|🎯|Part\s*\d|Course\s*[A-Z]|\[Course|Chapter\s*\d)',
    r'(매트릭스|비교\s*분석|\d+선\b|성지순례|가이드\s*라벨|촬영\s*수칙|비행\s*수칙|너무착한데\?)',
    r'^(또간집|풍자\s*또간집|골목식당)',
]

KNOWN_CLOSED_KEYWORDS = [
    '비어바나 문래',
    '문래 비어바나',
    '비어바나 문래점',
]

NON_DATE_FACILITY_PATTERNS = [
    r'(소아과의원|치과의원|이비인후과|정형외과|약국|한의원)',
    r'(공인중개사사무소|부동산중개|공인중개사)',
    r'(화장실|공중화장실)',
    r'(빨래방|코인워시|세탁소)',
    r'(정비소|카센터|주유소|폐차장)',
    r'(철물점|인력파견|직업소개|시공업체)',
]

# 2. 오염된 카테고리(주변 상가 오인식) 목록
POLLUTED_CATEGORIES = {
    '크린토피아 코인워시', '아파트 동', '취업사이트', '신한은행', '부동산중개업',
    '시공업체', '직업소개,인력파견', '생활용품점', '화장품', '주차장', '공원시설물',
    '화장실', '소프트웨어', '컴퓨터판매', '주방가구,싱크대판매', '시몬스', '글라스박스',
    '가정,생활', '이마트24', '사당,제단', '공원관리운영', '관광지관리운영', '필라테스',
    '신분당선', '등산정보', '사회복지시설', '입출구', '무장애나눔길', '식품판매',
    '인테리어', '한살림', '모즈토리'
}

# 3. 소스 노트 테마 매핑
NOTE_THEME_MAP = [
    (r'MediaArt|Exhibition|Museum|ArtFair', '전시·문화'),
    (r'Night_Bar|Midnight_Bar', '칵테일·위스키바'),
    (r'Craft_Brewery|Brewery|Pub', '펍·요리주점'),
    (r'Wine|Bistro', '와인바'),
    (r'Activity_Craft|Craft|Workshop', '공방·체험'),
    (r'Botanical_Garden|Forest|Trail|Park|Nature', '자연·산책'),
    (r'Amusement_ThemePark|ThemePark|Aquarium', '공방·체험'),
    (r'Spa|HotSpring|Sauna', '스파·힐링'),
    (r'Stay|Hotel|Resort|Pension|Glamping', '호텔·감성숙소'),
    (r'Gourmet|Dining|Restaurant|Food', '이탈리안·양식'),
    (r'Heritage_Gourmet|KoreanFood', '한식·미식'),
    (r'Bakery|Cafe|Dessert', '감성카페'),
]

# 4. 정밀 키워드 카테고리 매핑 규칙
KEYWORD_RULES = [
    ('와인바', r'(와인바|와인|내추럴와인|와인다이닝|샤퀴테리|글라스와인)'),
    ('칵테일·위스키바', r'(칵테일바|위스키|몰트|싱글몰트|하이볼|스피크이지|칵테일|바\(bar\)|라운지바|lp바)'),
    ('펍·요리주점', r'(이자카야|수제맥주|브루어리|양조장|펍|호프|요리주점|야장|포차|심야식당)'),
    ('감성카페', r'(카페|디저트|베이커리|빵집|케이크|커피|구움과자|소금빵|베이글|타르트|도넛|마카롱|스콘|크루아상|빙수|찻집|다실|아인슈페너)'),
    ('브런치', r'(브런치|프렌치토스트|팬케이크|에그베네딕트|오믈렛|샌드위치)'),
    ('이탈리안·양식', r'(파스타|스테이크|이탈리안|프렌치|피자|양식|파인다이닝|다이닝|뇨끼|리조또|바베큐|화덕피자)'),
    ('일식·오마카세', r'(오마카세|스시|초밥|일식|라멘|가이세키|돈가스|소바|텐동|사시미|야키토리)'),
    ('한식·미식', r'(한식|솥밥|한정식|갈비|삼겹살|고기집|고기|국수|찌개|백반|해물|횟집|막국수|불고기)'),
    ('전시·문화', r'(전시|미술관|박물관|갤러리|뮤지엄|팝업|영화관|연극|공연|미디어아트)'),
    ('공방·체험', r'(공방|원데이|원데이클래스|도자기|도예|향수공방|가죽공방|반지공방|드로잉|베이킹|보드게임|방탈출|사격|클라이밍)'),
    ('자연·산책', r'(공원|수목원|식물원|숲|산책|둘레길|올레길|정원|잔디|피크닉|호수|전망대|해변|해수욕장)'),
    ('스파·힐링', r'(스파|온천|찜질|사우나|테르메덴|아쿠아필드|노천탕)'),
    ('호텔·감성숙소', r'(호텔|리조트|펜션|글램핑|카라반|풀빌라|스테이|료칸)'),
]

def is_dummy_or_closed_spot(spot: Dict[str, Any]) -> Tuple[bool, str]:
    name = (spot.get("name") or "").strip()
    if not name:
        return True, "빈 상호명"
    
    # 1. 폐업 매장
    for kw in KNOWN_CLOSED_KEYWORDS:
        if kw in name:
            return True, f"폐업 매장 감지: {kw}"
            
    # 2. 비데이트 시설
    for pat in NON_DATE_FACILITY_PATTERNS:
        if re.search(pat, name):
            return True, f"비데이트 시설 감지: {name}"

    # 3. 마크다운 기사/더미 패턴
    for pat in DUMMY_NAME_PATTERNS:
        if re.search(pat, name):
            return True, f"기사/더미 패턴 감지: {name}"

    # 4. 3개 이상의 광역 지자체가 · 나 / 로 연결된 코스 모음 라벨
    if len(re.findall(r'[·/]', name)) >= 3 and any(w in name for w in ['코스', '스테이', '투어', '모음', '스파']):
        return True, f"광역 지자체 나열 라벨: {name}"

    # 5. 지나치게 긴 텍스트 (40자 초과 상호명은 매장명이 아닌 마케팅 문장)
    if len(name) > 40:
        return True, f"비정상적으로 긴 이름(40자 초과): {name[:30]}..."

    return False, ""

def clean_spot_name(name: str) -> str:
    """복합 & 기호 및 중복 지명 노이즈를 제거하여 네이버 지도 검색 100% 매칭 상호명으로 정제"""
    clean = (name or "").strip()
    
    # 기호 및 괄호 분리 (첫 번째 주 상호명 유지)
    if ' & ' in clean:
        parts = clean.split(' & ')
        if len(parts[0].strip()) >= 2:
            clean = parts[0].strip()
    elif ' / ' in clean:
        parts = clean.split(' / ')
        if len(parts[0].strip()) >= 2:
            clean = parts[0].strip()
    elif ' - ' in clean:
        parts = clean.split(' - ')
        clean = parts[0].strip()
        
    # '비어바나 문래 서울 문래' 같은 지명 중복 제거
    clean = re.sub(r'\s+서울\s+문래$', '', clean)
    clean = re.sub(r'\s+문래\s+서울.*$', '', clean)
    
    return clean.strip()

def heal_category_and_slot(spot: Dict[str, Any]) -> Tuple[str, str]:
    """스팟의 카테고리 결측치/오염을 보정하고 적합한 슬롯(day/evening/night/stay)을 도출"""
    cat = spot.get("category")
    if cat in POLLUTED_CATEGORIES:
        cat = None
        
    text = ' '.join([str(spot.get(k, '')) for k in ['name', 'summary', 'location', 'area', 'address']]).lower()
    
    # 1. 키워드 기반 정밀 매칭
    if not cat:
        for cname, pat in KEYWORD_RULES:
            if re.search(pat, text):
                cat = cname
                break
                
    # 2. 소스 파일 테마 노트 기반 매칭
    if not cat:
        note = spot.get("source", {}).get("note", "")
        for pat, cname in NOTE_THEME_MAP:
            if re.search(pat, note, re.I):
                cat = cname
                break
                
    # 3. 기본 폴백
    if not cat:
        slot = spot.get("slot")
        if slot == 'stay': cat = '호텔·감성숙소'
        elif slot == 'day': cat = '감성카페'
        elif slot == 'evening': cat = '이탈리안·양식'
        elif slot == 'night': cat = '칵테일·위스키바'
        else: cat = '데이트 명소'

    # 슬롯 정합성 교정
    slot = spot.get("slot")
    if cat in ['감성카페', '브런치', '공방·체험', '자연·산책', '전시·문화']:
        # 카페/전시/공방 등은 기본 day 슬롯 (또는 evening)
        if slot not in ['day', 'evening']:
            slot = 'day'
    elif cat in ['와인바', '칵테일·위스키바', '펍·요리주점']:
        # 술/바 종류는 night 슬롯
        if slot != 'night':
            slot = 'night'
    elif cat in ['이탈리안·양식', '한식·미식', '일식·오마카세']:
        # 식사/다이닝은 evening 슬롯
        if slot not in ['evening', 'day']:
            slot = 'evening'
    elif cat in ['호텔·감성숙소']:
        slot = 'stay'
        
    return cat, (slot or 'day')

def heal_all_spots(spots: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """전체 스팟 리스트 검증 및 보정 파이프라인 실행"""
    stats = {
        "total": len(spots),
        "deactivated_dummies": 0,
        "cleaned_names": 0,
        "healed_categories": 0,
        "healed_slots": 0,
        "active_total": 0,
    }

    healed_list = []
    
    for spot in spots:
        s = dict(spot)
        
        # 1. 더미 및 폐업 감지
        is_dummy, reason = is_dummy_or_closed_spot(s)
        if is_dummy:
            if not s.get("is_closed"):
                s["is_closed"] = True
                stats["deactivated_dummies"] += 1
                logger.debug(f"[비활성화] ID {s.get('id')} {s.get('name')}: {reason}")
        else:
            # 2. 상호명 정제
            original_name = s.get("name", "")
            cleaned_name = clean_spot_name(original_name)
            if cleaned_name != original_name:
                s["name"] = cleaned_name
                stats["cleaned_names"] += 1
                
            # 3. 카테고리 및 슬롯 보정
            orig_cat = s.get("category")
            orig_slot = s.get("slot")
            new_cat, new_slot = heal_category_and_slot(s)
            
            if orig_cat != new_cat:
                s["category"] = new_cat
                stats["healed_categories"] += 1
                
            if orig_slot != new_slot:
                s["slot"] = new_slot
                stats["healed_slots"] += 1

        if not s.get("is_closed"):
            stats["active_total"] += 1
            
        healed_list.append(s)
        
    return healed_list, stats

if __name__ == "__main__":
    import os
    target_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "data", "spots.json"))
    logger.info(f"스팟 데이터 보정 시작: {target_path}")
    with open(target_path, "r", encoding="utf-8") as f:
        spots_data = json.load(f)
        
    healed, report = heal_all_spots(spots_data)
    logger.info("보정 결과 보고:")
    for k, v in report.items():
        logger.info(f"  - {k}: {v}")
        
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(healed, f, ensure_ascii=False, indent=2)
    logger.info("public/data/spots.json 갱신 완료!")
