#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — YouTube 핫클립 & 쇼츠 마이너 (YouTube Miner)
장소명과 지역 키워드로 유튜브 쇼츠/리뷰 영상을 탐색하고 조회수와 영상 메타데이터를 수집합니다.
"""

import urllib.request
import urllib.parse
import re
import json
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

def parse_view_count(view_text: str) -> int:
    """조회수 텍스트(예: '조회수 15만회', '1.2M views', '3.5천회', '45,120회')를 정수로 변환"""
    if not view_text:
        return 0
    clean = view_text.replace(",", "").strip()
    
    # 15만회, 1.5만회
    m_man = re.search(r'([\d.]+)\s*만', clean)
    if m_man:
        return int(float(m_man.group(1)) * 10000)
    
    # 3.5천회
    m_cheon = re.search(r'([\d.]+)\s*천', clean)
    if m_cheon:
        return int(float(m_cheon.group(1)) * 1000)
    
    # 1.2M
    m_m = re.search(r'([\d.]+)\s*M', clean, re.IGNORECASE)
    if m_m:
        return int(float(m_m.group(1)) * 1000000)

    # 15K
    m_k = re.search(r'([\d.]+)\s*K', clean, re.IGNORECASE)
    if m_k:
        return int(float(m_k.group(1)) * 1000)

    # 숫자만
    m_num = re.search(r'\d+', clean)
    if m_num:
        return int(m_num.group(0))
    
    return 0

def search_youtube_hotclip(spot_name: str, region_or_area: str = "") -> dict | None:
    """
    장소명으로 유튜브 검색을 수행하여 가장 관련성 높은 쇼츠 또는 최신 핫영상을 추출합니다.
    """
    clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', spot_name).strip()
    query = f"{region_or_area} {clean_name} 데이트" if region_or_area else f"{clean_name} 핫플 데이트"
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.youtube.com/results?search_query={encoded_query}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=4.0) as res:
            html = res.read().decode('utf-8', errors='ignore')
            
            # ytInitialData JSON 추출
            match = re.search(r'var ytInitialData = ({.*?});</script>', html)
            if not match:
                match = re.search(r'window\["ytInitialData"\] = ({.*?});', html)
            
            if not match:
                return None
            
            data = json.loads(match.group(1))
            
            # 영상 렌더러 탐색
            contents = []
            try:
                sections = data["contents"]["twoColumnSearchResultsRenderer"]["primaryContents"]["sectionListRenderer"]["contents"]
                for sec in sections:
                    item_section = sec.get("itemSectionRenderer", {})
                    for item in item_section.get("contents", []):
                        if "videoRenderer" in item:
                            contents.append(item["videoRenderer"])
                        elif "reelItemRenderer" in item: # 쇼츠 렌더러
                            contents.append(item["reelItemRenderer"])
            except Exception:
                pass
            
            if not contents:
                return None
            
            # 상위 3개 영상 중 핫클립 선정
            for video in contents[:3]:
                video_id = video.get("videoId")
                if not video_id:
                    continue
                
                title = ""
                if "headline" in video: # Shorts
                    title = video["headline"].get("simpleText", "")
                elif "title" in video:
                    runs = video["title"].get("runs", [])
                    title = "".join(r.get("text", "") for r in runs)
                
                # 장소명이 제목에 포함되거나 데이트/핫플 관련 영상인지 검증
                if not any(k.lower() in title.lower() for k in [clean_name[:3], "데이트", "핫플", "맛집", "카페", "코스"]):
                    continue
                
                view_str = ""
                if "viewCountText" in video:
                    view_str = video["viewCountText"].get("simpleText", "")
                    if not view_str and "runs" in video["viewCountText"]:
                        view_str = "".join(r.get("text", "") for r in video["viewCountText"]["runs"])
                
                views = parse_view_count(view_str)
                is_shorts = "reelItemRenderer" in video or "shorts" in title.lower()
                
                video_url = f"https://www.youtube.com/shorts/{video_id}" if is_shorts else f"https://www.youtube.com/watch?v={video_id}"
                
                return {
                    "url": video_url,
                    "title": title[:60],
                    "views": views,
                    "is_shorts": is_shorts,
                }
    except Exception:
        pass
    
    return None
