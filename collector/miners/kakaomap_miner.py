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
}

def search_kakaomap_place(spot_name: str, address_or_area: str = "") -> dict | None:
    """
    카카오맵 검색을 통해 장소 ID와 실평점을 수집합니다.
    """
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', spot_name).strip()
    query = f"{address_or_area} {clean_name}" if address_or_area else clean_name
    encoded_query = urllib.parse.quote(query)
    url = f"https://search.map.kakao.com/lookup/place?q={encoded_query}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=3.5) as res:
            if res.status == 200:
                data = json.loads(res.read().decode('utf-8'))
                places = data.get("places", []) or data.get("items", [])
                if places and len(places) > 0:
                    best = places[0]
                    place_id = best.get("id") or best.get("confirmid")
                    rating = float(best.get("score") or best.get("rating") or 0.0)
                    review_count = int(best.get("review_count") or best.get("comment_count") or 0)
                    
                    if place_id:
                        # 평점은 '실제로 받아낸 경우에만' 싣는다.
                        # 예전에는 실패 시 4.2를 채워 넣었는데, lookup 엔드포인트가
                        # {"code":-40400}로 응답하는 현재 상태에서는 전 스팟이 예외 없이
                        # 4.2가 되어 (a) 점수 축의 변별력이 0이 되고
                        # (b) 이메일 리포트에 존재하지 않는 ★4.2 배지가 찍혔다.
                        # 모르면 비워 두는 편이 낫다.
                        place = {
                            "url": f"https://place.map.kakao.com/{place_id}",
                        }
                        if rating > 0:
                            place["rating"] = rating
                        if review_count > 0:
                            place["review_count"] = review_count
                        return place
    except Exception:
        pass

    # 폴백: 장소를 특정하지 못했으므로 검색 바로가기 링크만 돌려준다(평점 없음).
    return {
        "url": f"https://map.kakao.com/link/search/{urllib.parse.quote(clean_name)}",
    }
