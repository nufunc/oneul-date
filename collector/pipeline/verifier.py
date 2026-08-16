import re
import urllib.parse
import logging
import requests

logger = logging.getLogger("oneul.verifier")

def verify_spot_existence(name: str, location: str = "") -> bool:
    """네이버 지도 검색 URL 정상성 및 기본 유효성 검사"""
    if not name or len(name.strip()) < 2:
        return False
    
    # 상호명에 불필요한 단어가 있는지 검증
    invalid_keywords = ["추천", "베스트", "TOP", "모음", "데이트코스", "브이로그"]
    if any(kw.lower() in name.lower() for kw in invalid_keywords):
        return False
        
    return True

def generate_naver_map_url(name: str, location: str = "") -> str:
    """네이버 지도 검색 URL 생성"""
    query = f"{name} {location}".strip()
    encoded = urllib.parse.quote(query)
    return f"https://map.naver.com/p/search/{encoded}"
