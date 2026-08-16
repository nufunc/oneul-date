import logging
import requests
import xml.etree.ElementTree as ET
from typing import List, Dict, Any

logger = logging.getLogger("oneul.crawler")

# 데이트/핫플/여행 주요 유튜브 채널 RSS 피드
YOUTUBE_CHANNELS = [
    {"name": "DatePlace", "id": "UC_x5XG1OV2P6uZZ5FSM9Ttw"},
    {"name": "SeoulHotspot", "id": "UCfPA3n7hR2vB4u6W2Z8c12w"},
]

def fetch_youtube_feed_entries(channel_id: str) -> List[Dict[str, str]]:
    """유튜브 공개 RSS 피드에서 최신 동영상 제목 및 설명 탐색"""
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    entries = []
    try:
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            root = ET.fromstring(res.content)
            # Atom 네임스페이스
            ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
            for entry in root.findall("atom:entry", ns):
                title = entry.find("atom:title", ns)
                link = entry.find("atom:link", ns)
                content = entry.find("media:group/media:description", ns)
                
                entries.append({
                    "title": title.text if title is not None else "",
                    "url": link.attrib.get("href", "") if link is not None else "",
                    "description": content.text if content is not None else "",
                })
    except Exception as e:
        logger.warning(f"Failed to fetch YouTube feed for {channel_id}: {e}")
    return entries

def discover_new_spot_candidates() -> List[Dict[str, Any]]:
    """핫플 후보 원문 텍스트 스트림 수집"""
    candidates = []
    for ch in YOUTUBE_CHANNELS:
        items = fetch_youtube_feed_entries(ch["id"])
        for it in items:
            raw_text = f"제목: {it['title']}\n설명: {it['description']}"
            candidates.append({
                "raw_text": raw_text,
                "source_url": it["url"],
                "source_note": f"YouTube: {ch['name']}",
            })
    return candidates
