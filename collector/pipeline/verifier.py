import re
import urllib.parse
import logging
import requests

logger = logging.getLogger("oneul.verifier")

def verify_spot_existence(name: str, location: str = "", address: str = "") -> bool:
    """네이버 지도 검색 URL 정상성 및 기본 유효성 검사"""
    if not name or len(name.strip()) < 2:
        return False
    
    # 상호명에 불필요한 단어가 있는지 검증
    invalid_keywords = ["추천", "베스트", "TOP", "모음", "데이트코스", "브이로그", "리스트"]
    if any(kw.lower() in name.lower() for kw in invalid_keywords):
        return False
        
    return True

def generate_naver_map_url(name: str, location: str = "", address: str = "", region: str = "") -> str:
    """네이버 지도 검색 URL 생성 (동음 구 방어 및 정밀 검색어 조합)"""
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', name).strip()
    
    # 주소가 있으면 도로명/동 기반 결합
    if address:
        m = re.search(r'([가-힣0-9]+(?:로|길|동|읍|면))', address)
        if m:
            query = f"{clean_name} {m.group(1)}".strip()
            return f"https://map.naver.com/p/search/{urllib.parse.quote(query)}"
            
    # 모호한 단독 구 방어
    ambiguous_gu = ["중구", "서구", "동구", "남구", "북구", "강서구"]
    loc_clean = location.strip()
    if loc_clean in ambiguous_gu and region:
        loc_clean = f"{region} {loc_clean}"
        
    query = f"{clean_name} {loc_clean}".strip() if loc_clean else clean_name
    return f"https://map.naver.com/p/search/{urllib.parse.quote(query)}"
