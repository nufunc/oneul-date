#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 멀티 플랫폼 종합 스코어 엔진 (Multi-Platform Score Engine)
유튜브, 카카오맵, 인스타그램 등 멀티 채널 데이터를 결합하여
표준화된 social_links, metrics JSONB 및 hot_score (0~100)를 산출합니다.
"""

from datetime import datetime, timezone

def calculate_hot_score(youtube_data: dict | None, kakaomap_data: dict | None, is_verified: bool = False) -> tuple[float, dict, dict]:
    """
    플랫폼별 지표를 결합하여 (hot_score, social_links, metrics)를 반환합니다.
    """
    social_links = {}
    total_views = 0
    
    # 1. 유튜브 점수 (최대 45점)
    yt_score = 0.0
    if youtube_data and youtube_data.get("url"):
        social_links["youtube"] = youtube_data
        views = youtube_data.get("views", 0)
        total_views += views
        is_shorts = youtube_data.get("is_shorts", False)
        
        # 조회수 구간별 점수
        if views >= 100000:
            yt_score = 40.0
        elif views >= 50000:
            yt_score = 35.0
        elif views >= 10000:
            yt_score = 28.0
        elif views >= 3000:
            yt_score = 20.0
        else:
            yt_score = 15.0
            
        if is_shorts:
            yt_score = min(45.0, yt_score + 5.0) # 쇼츠 보너스
    else:
        yt_score = 15.0 # 기본값
        
    # 2. 카카오맵 평점 점수 (최대 35점)
    kakao_score = 0.0
    if kakaomap_data and kakaomap_data.get("url"):
        social_links["kakaomap"] = kakaomap_data
        rating = kakaomap_data.get("rating", 4.0)
        if rating >= 4.5:
            kakao_score = 35.0
        elif rating >= 4.2:
            kakao_score = 30.0
        elif rating >= 4.0:
            kakao_score = 25.0
        else:
            kakao_score = 20.0
    else:
        kakao_score = 25.0

    # 3. 에디터 검증 보너스 (최대 20점)
    verified_bonus = 20.0 if is_verified else 10.0
    
    # 총점 합산 (0 ~ 100)
    hot_score = round(min(100.0, yt_score + kakao_score + verified_bonus), 1)
    
    metrics = {
        "hot_score": hot_score,
        "trust_score": round(kakao_score * 2.5 + verified_bonus, 1),
        "total_video_views": total_views,
        "last_synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    return hot_score, social_links, metrics
