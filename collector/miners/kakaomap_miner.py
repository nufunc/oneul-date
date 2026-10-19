#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 카카오맵 평점 & 즐겨찾기 마이너 (KakaoMap Miner)
장소명과 주소로 카카오맵 장소를 매칭하여 실평점, 리뷰 수, 링크를 수집합니다.
"""

from __future__ import annotations

import urllib.request
import urllib.parse
import re
import json
import unicodedata

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.kakao.com/",
}

# 주차장·화장실·편의점 같은 부속 시설 이름. 이름 포함 판정만으로는 '덕하시장'에 '덕하시장 공중화장실'이 붙었다(P-164).
# 케이블카 정류장·승강장과 휴게소는 그 자체가 장소인 행이 있어 넣지 않는다. 끝의 '점'을 떼면 '서울대입구점'이 걸리므로 떼지 않는다
ACCESSORY_PLACE_RE = re.compile(
    r'(주차장?\d*|주차장분기점|출입구|\d+번출구|입구|관리실|관리사무소|화장실|매표소|주유소|충전소|역\d+호선|사무실)$'
    r'|^(gs25|cu|세븐일레븐|이마트24|미니스톱)|carzone|쏘카존')


def _is_accessory_name(name):
    return bool(ACCESSORY_PLACE_RE.search(re.sub(r'[^0-9a-z가-힣]', '', unicodedata.normalize('NFKC', name or '').lower())))


def _pick_place(places, spot_name, address_or_area):
    """이름이 맞고, 주소가 있으면 시·도까지 같은 첫 결과. 종전에는 1위 결과를 대조 없이 써서
    '베르트'(광주)에 부천 '베르트', '성수 대림창고'에 옆 갤러리의 평점이 붙었다(2026-09-29).
    행 이름은 부속 시설이 아닌데 후보 이름이 부속 시설이면 건너뛴다."""
    from supabase_worker import place_name_matches, derive_region_area
    want_reg = derive_region_area(address_or_area)[0]
    spot_is_accessory = _is_accessory_name(spot_name)
    for p in places:
        if not spot_is_accessory and _is_accessory_name(p.get("name")):
            continue
        if not place_name_matches(spot_name, p.get("name")):
            continue
        p_reg = derive_region_area(p.get("new_address") or p.get("address"))[0]
        if want_reg and p_reg and p_reg != want_reg:
            continue
        return p
    return None


def search_kakaomap_place(spot_name: str, address_or_area: str = "", want_address: bool = False) -> dict | None:
    """
    카카오맵 검색(mapsearch/map.daum)을 통해 장소 ID와 실평점, 리뷰 수를 수집합니다.
    want_address가 참이면 고른 장소의 도로명·지번 주소를 "addresses"로 함께 돌려준다(저장할 값이 아니다).
    """
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', spot_name).strip()
    query = f"{address_or_area} {clean_name}" if address_or_area else clean_name
    encoded_query = urllib.parse.quote(query)
    url = f"https://search.map.kakao.com/mapsearch/map.daum?q={encoded_query}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=3.5) as res:
            if res.status == 200:
                data = json.loads(res.read().decode('utf-8'))
                places = data.get("place", []) or data.get("places", []) or []
                best = _pick_place(places, clean_name, address_or_area)
                if best:
                    place_id = best.get("confirmid") or best.get("id")
                    raw_rating = best.get("rating_average") or best.get("score") or best.get("rating")
                    rating = float(raw_rating) if raw_rating else 0.0
                    raw_reviews = best.get("reviewCount") or best.get("review_count") or best.get("comment_count")
                    review_count = int(raw_reviews) if raw_reviews else 0
                    bookmark_count = int(best.get("rating_count") or 0)
                    
                    if place_id:
                        place = {
                            "url": f"https://place.map.kakao.com/{place_id}",
                        }
                        if rating > 0:
                            place["rating"] = round(rating, 2)
                        if review_count > 0:
                            place["review_count"] = review_count
                        if bookmark_count > 0:
                            place["bookmark_count"] = bookmark_count
                        if want_address:
                            place["addresses"] = [a for a in (best.get("new_address"), best.get("address")) if a]
                        return place
    except Exception:
        pass

    # 폴백: 장소를 특정하지 못했으므로 검색 바로가기 링크만 돌려준다(평점 없음).
    return {
        "url": f"https://map.kakao.com/link/search/{urllib.parse.quote(clean_name)}",
    }

