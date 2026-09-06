#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 카카오맵 평점 & 즐겨찾기 마이너 (KakaoMap Miner)
장소명과 주소로 카카오맵 장소를 매칭하여 실평점, 리뷰 수, 링크를 수집합니다.
"""

import urllib.request
import urllib.parse
import re
import json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://map.kakao.com/",
}

def search_kakaomap_place(spot_name: str, address_or_area: str = "") -> dict | None:
    """
    카카오맵 검색(mapsearch/map.daum)을 통해 장소 ID와 실평점, 리뷰 수를 수집합니다.
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
                if places and len(places) > 0:
                    best = places[0]
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
                        return place
    except Exception:
        pass

    # 폴백: 장소를 특정하지 못했으므로 검색 바로가기 링크만 돌려준다(평점 없음).
    return {
        "url": f"https://map.kakao.com/link/search/{urllib.parse.quote(clean_name)}",
    }

