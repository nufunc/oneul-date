#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 광역 지역 묶음 더미 스팟 자동 비활성화(소프트 삭제) 스크립트 (clean_dummy_spots.py)
=============================================================================
초기 프로토타입 시절 등록된 '서촌 / 북촌 / 삼청 / 안국 / 익선', '대전 / 충청', '광주 / 전라' 등
단일 실존 매장이 아닌 광역 묶음/지자체명 더미 데이터를 Supabase DB에서 전수 감지하여
is_closed = true로 비활성화 처리합니다.
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def _load_env_credentials():
    search_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    ]
    for env_path in search_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VITE_SUPABASE_URL=") or line.startswith("SUPABASE_URL="):
                            os.environ["SUPABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("SUPABASE_SERVICE_KEY=") or line.startswith("SUPABASE_KEY=") or line.startswith("VITE_SUPABASE_ANON_KEY="):
                            os.environ["SUPABASE_SERVICE_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass

def is_broad_region_dummy(name: str) -> bool:
    """단일 매장이 아닌 광역/골목 묶음, 코스 라벨, 방송/채널명 더미 데이터인지 판별"""
    if not name:
        return True
    n = name.strip()

    # 1. 방송/유튜브 채널명 블랙리스트 (단독 매장이 아님)
    media_channels = [
        "또간집", "풍자", "먹을텐데", "성시경", "줄서는식당", "줄 서는 식당", 
        "맛있는녀석들", "맛있는 녀석들", "놀라운토요일", "놀라운 토요일", 
        "수요미식회", "생생정보통", "생방송투데이", "골목식당", "백종원",
        "생활의달인", "전현무계획", "식객 허영만", "허영만", "최자로드",
        "유튜브", "브이로그", "vlog", "shorts", "쇼츠"
    ]
    if any(ch in n for ch in media_channels):
        return True

    # 2. 코스명, 거리명 묶음, 비매장 가이드 라벨
    course_and_guide_patterns = [
        "서촌 순라길", "서촌순라길", "순라길 서촌", "북촌 서촌", "익선동 서순라길",
        "부암동 ↔ 서촌", "드론 비행", "촬영 수칙", "로컬 데이트존", "거리 산책",
        "코스 모음", "추천 리스트", "데이트 코스", "감성 핫플 모음", "너무착한데?"
    ]
    if any(pat in n for pat in course_and_guide_patterns):
        return True

    # 3. 슬래시(/)가 2개 이상 들어간 다중 지역 나열 (예: 서촌 / 북촌 / 삼청 / 안국 / 익선)
    if n.count("/") >= 2:
        return True

    # 4. 광역 권역 묶음 라벨
    broad_patterns = [
        r"^(서울|경기|인천|강원|충청|호남|영남|제주|대전|광주|대구|부산|울산)\s*[\/&]\s*(충청|전라|경상|울산|경남|경북|전남|전북|강원)",
        r".*&.*&.*권$",
        r"^(충북|충남|전북|전남|경북|경남|강원도?)\s+[가-힣]+(시|군|구)$",  # 예: '충북 단양군', '충남 공주시', '강원 삼척시'
    ]
    for pat in broad_patterns:
        if re.search(pat, n):
            return True

    # 5. 명확한 광역 더미 키워드 일치
    exact_dummies = [
        "서촌 / 북촌 / 삼청 / 안국 / 익선",
        "대전 / 충청",
        "광주 / 전라",
        "부산 & 울산 & 경남권",
        "대구 & 경북권",
        "광주 & 전라권",
        "대전 & 충청권",
        "수도권 & 서울근교",
    ]
    if any(n == d or n.startswith(d) for d in exact_dummies):
        return True

    return False

def sanitize_spot_name(name: str) -> str:
    """상호명 뒤에 마구잡이로 붙은 SEO 홍보 키워드 및 주소 텍스트 자동 정제"""
    if not name:
        return ""
    clean = name.strip()
    
    # 괄호 제거
    clean = re.sub(r'\(.*?\)|\[.*?\]|（.*?）|【.*?】', '', clean).strip()

    # 상호명 뒤에 붙은 SEO 키워드 연속 나열 다이어트
    descriptor_regex = r'\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점|요트|보트|샴페인|라운지|바베큐|바베큐장|테라스|그릴|다이닝|루프탑|루프탑가든|디너|런치|오마카세|코스요리|패키지|렌탈|이용권|피크닉|캠크닉|캠핑|글램핑|스파|사우나|감성|칵테일|와인|위스키|주점|호프|데이트|핫플|분위기좋은|분위기|추천|맛집|셀프사진관|놀거리|커피디저트).*$'
    clean = re.sub(descriptor_regex, '', clean, flags=re.IGNORECASE).strip()

    # 상호명 뒤에 붙은 지역/주소 꼬리표 다이어트 (예: '장프리고 서울 중구 광희동' -> '장프리고')
    clean = re.sub(r'\s+(서울|경기|인천|강원|충북|충남|전북|전남|경북|경남|제주|부산|대구|광주|대전|울산)\s+[가-힣0-9\s]+(?:구|동|읍|면|로|길)$', '', clean).strip()
    clean = re.sub(r'\s+—\s+.*$', '', clean).strip()

    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean if len(clean) >= 2 else name

def clean_dummy_spots():
    """전체 DB를 페이지네이션으로 전수 스캔하여 더미 스팟 비활성화"""
    _load_env_credentials()
    supabase_url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

    if not supabase_url or not service_key:
        print("⚠️ Supabase 접속 정보가 없습니다.")
        return

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🔍 Supabase 전체 spots 테이블 전수 페이지네이션 스캔 시작...")
    page_size = 1000
    offset = 0
    all_spots = []

    # 1000개씩 전체 테이블 페이지네이션 조회
    while True:
        url = f"{supabase_url}/rest/v1/spots?select=id,name,category,region,area,is_closed&is_closed=eq.false&order=id.asc&offset={offset}&limit={page_size}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as res:
                batch = json.loads(res.read().decode('utf-8'))
                if not batch:
                    break
                all_spots.extend(batch)
                print(f"  📥 {len(all_spots)}개 스팟 로드 완료...")
                if len(batch) < page_size:
                    break
                offset += page_size
        except Exception as e:
            print(f"❌ DB 조회 중 오류: {e}")
            break

    print(f"\n📊 총 {len(all_spots)}개 활성 스팟 조회 완료. 더미/오염 스팟 검출 및 정제 시작...")

    dummy_spots = [s for s in all_spots if is_broad_region_dummy(s.get("name", ""))]
    print(f"🚨 총 {len(dummy_spots)}개의 더미 스팟 발견!\n")

    for s in dummy_spots:
        s_id = s.get("id")
        name = s.get("name", "")
        print(f"  [ID {s_id}] '{name}' -> is_closed=true 처리 중...", end=" ")

        patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
        payload = json.dumps({"is_closed": True}).encode('utf-8')
        try:
            p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
            with urllib.request.urlopen(p_req, timeout=5) as p_res:
                if p_res.status in (200, 204):
                    print("✅ 완료")
                else:
                    print(f"⚠️ 실패 ({p_res.status})")
        except Exception as ex:
            print(f"❌ 오류 ({ex})")
        time.sleep(0.05)

    # 1. 상호명 SEO 오염 정제
    cleaned_count = 0
    valid_spots = [s for s in all_spots if not is_broad_region_dummy(s.get("name", ""))]
    for s in valid_spots:
        s_id = s.get("id")
        orig_name = s.get("name", "")
        clean_name = sanitize_spot_name(orig_name)
        if clean_name != orig_name and len(clean_name) >= 2:
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            payload = json.dumps({"name": clean_name}).encode('utf-8')
            try:
                p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
                with urllib.request.urlopen(p_req, timeout=5) as p_res:
                    if p_res.status in (200, 204):
                        print(f"  ✨ [ID {s_id}] 상호명 정제: '{orig_name}' -> '{clean_name}'")
                        cleaned_count += 1
            except Exception:
                pass
            time.sleep(0.05)

    # 2. 오래되거나 신뢰도 낮은 유튜브 링크 자동 정화
    stale_yt_count = 0
    stale_keywords = [
        "2018", "2019", "2020", "2021", "2022", "2023",
        "3년 전", "4년 전", "5년 전", "6년 전", "7년 전", "8년 전", "9년 전", "10년 전",
        "ytn", "kbs", "sbs", "mbc", "jtbc", "연합뉴스", "뉴스", "news", "사건", "사고", "체포", "경찰", "화재", "논란", "날씨", "속보", "단독"
    ]
    for s in valid_spots:
        s_id = s.get("id")
        social = s.get("social_links") or {}
        if not isinstance(social, dict) or not social.get("youtube"):
            continue
        yt = social.get("youtube") or {}
        views = int(yt.get("views") or 0)
        title = (yt.get("title") or "").lower()
        pub = str(yt.get("published_at") or "").lower()
        
        is_low_views = views < 10000
        is_stale = any(kw in title or kw in pub for kw in stale_keywords)
        if is_low_views or is_stale:
            new_social = {k: v for k, v in social.items() if k != "youtube"}
            patch_url = f"{supabase_url}/rest/v1/spots?id=eq.{s_id}"
            payload = json.dumps({"social_links": new_social}).encode('utf-8')
            try:
                p_req = urllib.request.Request(patch_url, data=payload, headers=headers, method='PATCH')
                with urllib.request.urlopen(p_req, timeout=5) as p_res:
                    if p_res.status in (200, 204):
                        stale_yt_count += 1
            except Exception:
                pass
            time.sleep(0.05)

    print(f"\n🎉 [정리 완료] {len(dummy_spots)}개 더미 비활성화, {cleaned_count}개 상호명 정제, {stale_yt_count}개 오래된 유튜브 링크 정화 완료!")

if __name__ == "__main__":
    clean_dummy_spots()
