#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — YouTube Vlog & Travel Route Miner (유튜브 브이로그 역방향 장소 수집기)
유튜브 데이트/여행 영상 URL에서 영상 속 장소들을 자동으로 추출·검증하여 DB에 등록합니다.
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import search_naver, calculate_quality_score, load_env

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

def extract_video_id(url: str) -> str | None:
    """유튜브 URL에서 videoId 추출"""
    m = re.search(r'(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None

def get_youtube_video_info(video_id: str) -> dict | None:
    """유튜브 영상의 기본 메타데이터(제목, 채널명, 설명란 등) 조회"""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    # 1. oEmbed 기본 메타데이터
    oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(video_url)}&format=json"
    title, author_name, thum_url = "", "", ""
    try:
        req = urllib.request.Request(oembed_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            title = data.get("title", "")
            author_name = data.get("author_name", "")
            thum_url = data.get("thumbnail_url", "")
    except Exception:
        pass

    # 2. HTML 스크래핑으로 상세 설명란 및 조회수 파싱
    description = ""
    views = 0
    try:
        req = urllib.request.Request(video_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
            # 설명란 추출
            desc_match = re.search(r'\"shortDescription\":\"(.*?)\"', html)
            if desc_match:
                raw_desc = desc_match.group(1)
                try:
                    description = json.loads(f'"{raw_desc}"')
                except Exception:
                    try:
                        description = raw_desc.encode('utf-8').decode('unicode_escape')
                    except Exception:
                        description = raw_desc.replace('\\n', '\n')
            
            # 조회수 추출
            view_match = re.search(r'\"viewCount\":\"(\d+)\"', html)
            if view_match:
                views = int(view_match.group(1))
    except Exception:
        pass

    if not title and not description:
        return None

    return {
        "videoId": video_id,
        "url": video_url,
        "title": title,
        "author": author_name,
        "description": description,
        "views": views,
        "thumbnail": thum_url
    }

def extract_spot_candidates(title: str, description: str) -> list[str]:
    """영상 제목과 설명란에서 유력 장소명 후보군 추출"""
    candidates = []
    
    # 1. 타임스탬프 라인 파싱 (예: "01:23 선샤인스튜디오", "04:50 반야사", "00:21 월화원")
    timestamp_lines = re.findall(r'(?:[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\s*[-~:•·]?\s*([^\n\r]+)', description)
    for line in timestamp_lines:
        clean = re.sub(r'[\(\[\{].*?[\)\]\}]', '', line).strip()
        clean = re.sub(r'^[0-9\.\-\s]+', '', clean).strip()
        if clean and len(clean) >= 2 and len(clean) <= 25:
            candidates.append(clean)

    # 2. 번호 리스트 파싱 (예: "1. 초막골생태공원", "2. 수리사", "3) 반월호수공원")
    numbered_lines = re.findall(r'(?:[0-9]{1,2}[\.\)\-]\s*)([^\n\r:—\-]+)', description)
    for line in numbered_lines:
        clean = re.sub(r'[\(\[\{].*?[\)\]\}]', '', line).strip()
        if clean and len(clean) >= 2 and len(clean) <= 25:
            candidates.append(clean)

    # 3. 쉼표/구분자 기반 제목 파싱 (예: "논산맛집,선샤인스튜디오,곱창칼국수,동굴법당,딸기떡")
    title_parts = re.split(r'[,|/·•\-\+]', title)
    for part in title_parts:
        clean = re.sub(r'[🌾🔥✨💎☕🍕🍜#˙ᵕ˙🎈â˜”ðŸ“]', '', part).strip()
        clean = re.sub(r'당일치기|브이로그|여행지|여행|하루|코스|데이트|맛집|카페|핫플|추천|Vlog|가볼만한곳|이런|마포는|처음이죠|몰라서|못가는|곳', '', clean, flags=re.IGNORECASE).strip()
        if clean and len(clean) >= 2 and len(clean) <= 20:
            candidates.append(clean)

    # 4. 설명란 내 아이콘/헤더 기반 장소명 패턴 (예: "📍 선샤인스튜디오", "🏠 월화원", "☕ 범골커피")
    labeled_spots = re.findall(r'(?:📍|📌|🏠|☕|🍽️|🏛️|🌳|🌿|🎪)\s*([^\n\r:—\-]+)', description)
    for spot in labeled_spots:
        clean = re.sub(r'[\(\[\{].*?[\)\]\}]', '', spot).strip()
        if clean and len(clean) >= 2 and len(clean) <= 25:
            candidates.append(clean)

    # 중복 제거 및 무의미한 일반명사(불용어) 필터링
    unique_candidates = []
    stopwords = [
        "intro", "outro", "인트로", "아웃트로", "요약", "맛집", "카페", "술집",
        "미리보기", "엔딩", "인사말", "오프닝", "클로징", "마무리",
        "오늘", "이번", "여행", "브이로그", "영상", "더보기", "인스타그램", "협찬",
        "광고", "구독", "좋아요", "정보", "위치", "타임라인", "timestamp", "쇼핑", "시작",
        "아이스", "가격", "메뉴", "주문", "예약", "주소", "영업시간", "전화",
    ]
    # 도로명 주소 패턴 (예: "서울 마포구 증산로 32")
    addr_pattern = re.compile(r'^[가-힣]+\s+[가-힣]+(?:시|군|구)\s+[가-힣]+(?:로|길|대로)')
    for c in candidates:
        c_clean = c.strip()
        if any(c_clean.lower() == sw or c_clean.lower().startswith(sw) for sw in stopwords):
            continue
        if len(c_clean) < 2 or len(c_clean) > 25:
            continue
        # 도로명 주소 텍스트 제외
        if addr_pattern.match(c_clean):
            continue
        # 순수 숫자·특수문자만 있는 후보 제외
        if not re.search(r'[가-힣a-zA-Z]', c_clean):
            continue
        if c_clean not in unique_candidates:
            unique_candidates.append(c_clean)

    return unique_candidates

def detect_slot_and_mood(category: str, summary: str) -> tuple[str, list[str]]:
    """업종 및 설명 기반 슬롯(day/evening/night/stay) 및 분위기(mood) 자동 분류"""
    text = f"{category} {summary}".lower()
    
    # 1. Slot
    if any(k in text for k in ["호텔", "리조트", "펜션", "풀빌라", "글램핑", "스테이", "숙소"]):
        slot = "stay"
    elif any(k in text for k in ["바", "펍", "와인", "이자카야", "야경", "포차", "주점", "칵테일"]):
        slot = "night"
    elif any(k in text for k in ["식당", "맛집", "다이닝", "오마카세", "고기", "파스타", "스시", "레스토랑", "갈비"]):
        slot = "evening"
    else:
        slot = "day" # 카페, 전시, 스튜디오, 베이커리, 공원 등
        
    # 2. Mood
    moods = []
    if any(k in text for k in ["감성", "로맨틱", "분위기", "데이트", "와인", "뷰", "선셋"]):
        moods.append("romantic")
    if any(k in text for k in ["힐링", "숲", "자연", "호수", "산책", "정원", "한옥"]):
        moods.append("healing")
    if any(k in text for k in ["맛집", "미식", "파스타", "고기", "셰프", "디저트"]):
        moods.append("gourmet")
    if any(k in text for k in ["트렌디", "핫플", "포토존", "스튜디오", "신상"]):
        moods.append("trendy")
    if any(k in text for k in ["레트로", "전통", "시장", "빈티지"]):
        moods.append("retro")
        
    if not moods:
        moods = ["romantic", "gourmet"] if slot == "evening" else ["healing", "trendy"]
        
    return slot, moods[:3]

def detect_region_from_address(address: str) -> str:
    """주소 텍스트에서 7대 권역(SEOUL/GYEONGGI/INCHEON/GANGWON/CHUNGCHEONG/HONAM/YEONGNAM/JEJU) 판별"""
    addr = address or ""
    if "서울" in addr: return "서울"
    if "인천" in addr: return "인천"
    if "경기" in addr: return "경기"
    if any(k in addr for k in ["강원", "강릉", "속초", "춘천", "양양", "평창"]): return "강원"
    if any(k in addr for k in ["충남", "충북", "대전", "세종", "논산", "천안", "공주", "단양", "태안"]): return "충청"
    if any(k in addr for k in ["전남", "전북", "광주", "여수", "순천", "전주", "목포", "담양"]): return "호남"
    if any(k in addr for k in ["부산", "대구", "울산", "경남", "경북", "경주", "포항", "거제", "통영"]): return "영남"
    if "제주" in addr: return "제주"
    return "서울"

def mine_youtube_vlog(url: str, supabase_url: str, supabase_key: str) -> int:
    """유튜브 브이로그 URL 역방향 마이닝 실행. 신규 등록된 스팟 수를 반환."""
    video_id = extract_video_id(url)
    if not video_id:
        print(f"❌ 유효하지 않은 유튜브 URL입니다: {url}")
        return 0

    print(f"🎬 [1/3] 유튜브 영상 메타데이터 수집 중... (ID: {video_id})")
    vinfo = get_youtube_video_info(video_id)
    if not vinfo:
        print(f"❌ 영상 정보를 불러올 수 없습니다. (ID: {video_id})")
        return 0

    print(f"  • 영상 제목: {vinfo['title']}")
    print(f"  • 채널명: {vinfo['author']} (조회수: {vinfo['views']:,}회)")

    # 장소 후보 추출
    print(f"\n🔍 [2/3] 영상 내 방문 장소 추출 및 지도 정밀 검증 중...")
    candidates = extract_spot_candidates(vinfo["title"], vinfo["description"])
    print(f"  • 추출된 키워드 후보: {candidates}")

    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

    # 영상 제목/설명란에서 광역/시군구 힌트 추출 (예: '논산', '경주', '제주' 등)
    region_hints = re.findall(r'(서울|인천|경기|강원|충남|충북|전남|전북|경남|경북|제주|[가-힣]{2,4}(?:시|군|구))', vinfo["title"])
    region_hint = " ".join(region_hints) if region_hints else ""

    discovered_spots = []
    for cand in candidates:
        if len(cand) < 2:
            continue

        # 네이버/카카오 정밀 로컬 검색 (지역 힌트 결합 우선)
        search_res = []
        if region_hint:
            search_res = search_naver(f"{region_hint} {cand}")
        if not search_res:
            search_res = search_naver(cand)
        if not search_res:
            continue
        
        # 검색 결과 중 영상 지역 힌트와 부합하는 최적 결과 선택
        top = search_res[0]
        if region_hint:
            matched_place = next((p for p in search_res if any(rh in (p.get("roadAddress") or "") for rh in region_hints)), None)
            if matched_place:
                top = matched_place

        official_name = top.get("name", "").strip()
        road_addr = top.get("roadAddress") or top.get("address") or ""
        thum_url = top.get("thumUrl") or vinfo.get("thumbnail") or ""
        category = top.get("category") or "명소"
        lat = float(top.get("y")) if top.get("y") else None
        lng = float(top.get("x")) if top.get("x") else None

        if not official_name or not road_addr:
            continue

        # 지역 불일치 검증: 영상의 명시적 시/군/구가 있는데 완전히 다른 타 시/도인 경우 제외
        if region_hints and not any(rh in road_addr for rh in region_hints) and not any(rh in official_name for rh in region_hints):
            continue

        region = detect_region_from_address(road_addr)
        slot, moods = detect_slot_and_mood(category, f"{cand} {official_name}")

        # 업종 블랙리스트: 데이트 스팟이 아닌 업종 제외
        cat_lower = (category or "").lower()
        name_lower = official_name.lower()
        blacklist_cats = [
            "주유소", "세차", "편의점", "세븐일레븐", "cu ", "gs25", "이마트24",
            "아파트", "단지", "오피스텔", "빌라", "주공",
            "의류", "zara", "h&m", "유니클로", "병원", "약국", "치과", "안과",
            "은행", "atm", "우체국", "관공서", "경찰서", "소방서",
            "웨딩", "결혼", "장례", "부동산", "공인중개",
        ]
        if any(bl in cat_lower or bl in name_lower for bl in blacklist_cats):
            continue

        # 군/구 단위 지역 추출
        gu_match = re.search(r'([가-힣]+(?:시|군|구))', road_addr)
        area_val = gu_match.group(1) if gu_match else None

        # 고유 ID 생성 (Timestamp ms)
        spot_id = int(time.time() * 1000)
        time.sleep(0.01)

        spot_payload = {
            "id": spot_id,
            "name": official_name,
            "slot": slot,
            "region": region,
            "area": area_val,
            "address": road_addr,
            "location": f"{region} {area_val or ''}".strip(),
            "category": category,
            "mood": moods,
            "price": "1~2만원대" if slot == "day" else "3~4만원대",
            "summary": f"{vinfo['author']} 유튜브 추천! {official_name} 데이트 코스",
            "image_url": thum_url,
            "lat": lat,
            "lng": lng,
            "verified": True,
            "source": {
                "type": "youtube_vlog",
                "url": vinfo["url"],
                "note": f"{vinfo['author']} 유튜브 ({vinfo['title'][:40]})"
            },
            "social_links": {
                "youtube": {
                    "url": vinfo["url"],
                    "title": vinfo["title"],
                    "views": vinfo["views"],
                    "is_shorts": False
                }
            },
            "hot_score": 85.0 if vinfo["views"] >= 50000 else 75.0,
            "quality_score": 90
        }

        # 중복 검사 (동일 상호명 및 주소가 이미 있는지 확인)
        check_q = urllib.parse.quote(official_name)
        check_url = f"{supabase_url}/rest/v1/spots?name=eq.{check_q}&select=id"
        check_req = urllib.request.Request(check_url, headers=headers)
        try:
            with urllib.request.urlopen(check_req, timeout=5) as c_res:
                existing = json.loads(c_res.read().decode('utf-8'))
                if existing:
                    print(f"  ⏩ [이미 존재하는 스팟 건너뜀] {official_name} (ID: {existing[0]['id']})")
                    continue
        except Exception:
            pass

        # Supabase 신규 등록 (INSERT)
        insert_url = f"{supabase_url}/rest/v1/spots"
        insert_bytes = json.dumps(spot_payload, ensure_ascii=False).encode('utf-8')
        insert_req = urllib.request.Request(insert_url, data=insert_bytes, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(insert_req, timeout=5) as ins_res:
                discovered_spots.append(official_name)
                print(f"  ✨ [신규 스팟 등록 성공!] {official_name} ({road_addr}) [슬롯: {slot}]")
        except Exception as e:
            print(f"  ❌ DB 등록 실패 ({official_name}): {e}")

    print(f"\n🎉 [3/3] 유튜브 역방향 마이닝 완료: 총 {len(discovered_spots)}개 스팟 신규 등록 완료!")
    for s in discovered_spots:
        print(f"  • {s}")
    return len(discovered_spots)

def run_youtube_vlog_mining(supabase_url: str, supabase_key: str, limit: int = 5) -> int:
    """유튜브에서 최신 데이트/여행 브이로그 영상을 검색하여 자율 역방향 수집 수행.
    등록된 신규 스팟 총 개수를 반환."""
    search_keywords = [
        "데이트 브이로그 코스",
        "당일치기 여행 코스 브이로그",
        "주말 데이트 핫플 브이로그",
        "감성 카페 맛집 데이트 브이로그"
    ]

    print(f"🎬 [YouTube Vlog 자율 마이너] 최신 데이트/여행 영상 탐색 시작...")
    found_urls = []
    # 첫 키워드가 limit을 독식하지 않도록 키워드당 상한 배분
    per_kw_cap = max(1, -(-limit // len(search_keywords)))

    for kw in search_keywords:
        if len(found_urls) >= limit:
            break
        encoded = urllib.parse.quote(kw)
        search_url = f"https://www.youtube.com/results?search_query={encoded}"
        req = urllib.request.Request(search_url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                html = res.read().decode('utf-8', errors='ignore')
                video_ids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
                if not video_ids:
                    # 데이터센터 IP에서 컨센트/차단 페이지가 내려오는 경우 진단용
                    print(f"  ⚠️ 검색 결과에서 영상 ID 미검출 ('{kw}', 응답 {len(html):,}자)")
                    continue
                added = 0
                for vid in video_ids:
                    url = f"https://www.youtube.com/watch?v={vid}"
                    if url not in found_urls:
                        found_urls.append(url)
                        added += 1
                    if added >= per_kw_cap or len(found_urls) >= limit:
                        break
                print(f"  • '{kw}' 검색: 영상 {added}개 확보")
        except Exception as e:
            print(f"  ⚠️ 유튜브 검색 실패 ('{kw}'): {e}")

    if not found_urls:
        print(f"  ⚠️ 발견된 영상 0개 — 유튜브 검색이 모두 실패했거나 차단된 상태입니다.")
        return 0

    print(f"  • 발견된 최신 여행 브이로그 영상: {len(found_urls)}개")
    total_registered = 0
    for vurl in found_urls:
        try:
            total_registered += mine_youtube_vlog(vurl, supabase_url, supabase_key)
        except Exception as e:
            print(f"  ❌ 영상 마이닝 실패 ({vurl}): {e}")
    return total_registered

if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    parser = argparse.ArgumentParser(description="YouTube Vlog & Travel Reverse Miner")
    parser.add_argument("--url", help="YouTube Video URL (e.g. https://www.youtube.com/watch?v=...)")
    parser.add_argument("--auto", action="store_true", help="Auto-discover and mine recent YouTube vlogs")
    parser.add_argument("--limit", type=int, default=3, help="Max videos to auto-mine")
    parser.add_argument("--supabase_url", default=default_url, help="Supabase Project URL")
    parser.add_argument("--supabase_key", default=default_key, help="Supabase Service Key")
    args = parser.parse_args()

    if args.url:
        mine_youtube_vlog(args.url, args.supabase_url, args.supabase_key)
    elif args.auto:
        run_youtube_vlog_mining(args.supabase_url, args.supabase_key, limit=args.limit)
    else:
        parser.print_help()

