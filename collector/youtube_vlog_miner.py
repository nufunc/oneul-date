#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — YouTube Vlog & Travel Route Miner (유튜브 브이로그 역방향 장소 수집기)
유튜브 데이트/여행 영상 URL에서 영상 속 장소들을 자동으로 추출·검증하여 DB에 등록합니다.

v3.4 개선 사항
  A. 롱폼(설명란에 코스 목록이 실리는) 영상만 소싱 — 쇼츠/짧은 설명란 스킵
  B. 후보 품질 게이트 — 이모지/문장조각/조사어미/괄호잔여물 후보 제거
  C. 네이버 결과 카테고리 화이트리스트 + 상호명 비(非)스팟 패턴 차단
  D. region_hints 를 실제 행정구역 사전으로 검증 (예: "남자친구" 오탐 제거)
  E. 영상별 1줄 요약 로그 + 사이클 집계 로그, --dry-run 지원

v3.5 개선 사항
  F. 슬롯 오염 차단 — stay 는 '네이버 공식 카테고리'로만 판정(정규식 가드 도입),
     숙박 업종은 수집 단계에서 배제(다른 미너와 동일 정책)
  G. 지역 게이트 정상화 — 접미사 없는 시·군 지명("서산", "청주")도 힌트로 인정,
     거주지/출발지 수식 지명 제외, 기초 힌트 우선, 권역은 derive_region_area 재사용
  H. 상호명 유사도 게이트 강화 — 어절 경계 정렬 포함만 인정
     (구움당↮구움미, 경품↮경품왕국, 옥경이네↮옥경이네건생선)
  I. 소품샵·편집숍 업종 허용 + 체인 SPA/대형유통 브랜드 차단
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse
import argparse
import difflib

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import (search_naver, calculate_quality_score, load_env,
                             derive_region_area)
from category_filter import (
    is_date_spot_category,
    CATEGORY_WHITELIST,
    CATEGORY_WHITELIST_EXACT,
    CATEGORY_BLACKLIST,
    CHAIN_BRAND_BLACKLIST,
    CATEGORY_BLACKLIST_LODGING,
    NAME_BLACKLIST_PATTERNS,
)
try:
    from groq_helper import extract_spots_from_unstructured_text
except ImportError:
    extract_spots_from_unstructured_text = None

UA_DESKTOP = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

HEADERS = {
    "User-Agent": UA_DESKTOP,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    # 구글 동의(consent) 인터스티셜 우회 — 데이터센터 IP에서 watch HTML 스크래핑이 죽는 주원인
    "Cookie": "CONSENT=YES+1; SOCS=CAI",
}

# watch 페이지 스크래핑 전용 헤더 (동의 우회 + 데스크톱 위장)
WATCH_HEADERS = {
    "User-Agent": UA_DESKTOP,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Cookie": "CONSENT=YES+1; SOCS=CAI; PREF=hl=ko&gl=KR",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Dest": "document",
    "Upgrade-Insecure-Requests": "1",
}

# InnerTube(공개 웹 클라이언트) 폴백 설정 — 데이터센터 IP에서 훨씬 안정적
INNERTUBE_URL = ("https://www.youtube.com/youtubei/v1/player"
                 "?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false")
INNERTUBE_CLIENTS = [
    {
        "label": "innertube_android",
        "context": {"client": {
            "clientName": "ANDROID", "clientVersion": "19.09.37",
            "androidSdkVersion": 30, "hl": "ko", "gl": "KR",
        }},
        "headers": {
            "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "19.09.37",
        },
    },
    {
        "label": "innertube_embed",
        "context": {"client": {
            "clientName": "WEB_EMBEDDED_PLAYER", "clientVersion": "1.20250101.00.00",
            "hl": "ko", "gl": "KR",
        }},
        "headers": {
            "User-Agent": UA_DESKTOP,
            "X-YouTube-Client-Name": "56",
            "X-YouTube-Client-Version": "1.20250101.00.00",
            "Referer": "https://www.youtube.com/",
        },
    },
    {
        "label": "innertube_web",
        "context": {"client": {
            "clientName": "WEB", "clientVersion": "2.20250101.00.00",
            "hl": "ko", "gl": "KR",
        }},
        "headers": {
            "User-Agent": UA_DESKTOP,
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": "2.20250101.00.00",
        },
    },
    {
        "label": "innertube_mweb",
        "context": {"client": {
            "clientName": "MWEB", "clientVersion": "2.20250101.00.00",
            "hl": "ko", "gl": "KR",
        }},
        "headers": {
            "User-Agent": ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                           "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
            "X-YouTube-Client-Name": "2",
            "X-YouTube-Client-Version": "2.20250101.00.00",
        },
    },
]

# InnerTube next 엔드포인트 (설명란이 attributedDescription 으로 내려옴 — player 가 막혔을 때의 최후 폴백)
INNERTUBE_NEXT_URL = ("https://www.youtube.com/youtubei/v1/next"
                      "?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false")

# 처리 이력 (매 사이클 같은 영상 재처리 방지)
HISTORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".processed_videos.json")
HISTORY_MAX = 500

# 해외 여행 영상 (국내 데이트 스팟 파이프라인 대상 아님) — 제목에 걸리면 영상 자체 스킵
OVERSEAS_KEYWORDS = [
    "후쿠오카", "오사카", "도쿄", "동경", "교토", "삿포로", "오키나와", "나고야", "벳푸", "유후인",
    "요코하마", "고베", "나라", "하코네", "가마쿠라", "닛코", "센다이", "히로시마", "나가사키",
    "구마모토", "가고시마", "오이타", "미야자키", "홋카이도", "규슈", "시부야", "신주쿠", "하라주쿠",
    "아사쿠사", "우에노", "긴자", "오다이바", "도톤보리", "난바", "우메다", "신사이바시", "하카타",
    "텐진", "유니버설스튜디오", "디즈니씨", "디즈니랜드",
    "방콕", "치앙마이", "푸켓", "다낭", "나트랑", "호이안", "하노이", "호치민", "푸꾸옥",
    "세부", "보라카이", "마닐라", "발리", "쿠알라룸푸르", "코타키나발루", "싱가포르",
    "타이베이", "대만", "홍콩", "마카오", "상하이", "북경", "베이징", "칭다오",
    "파리", "런던", "로마", "바르셀로나", "프라하", "취리히", "스위스", "이탈리아", "스페인",
    "뉴욕", "la여행", "로스앤젤레스", "하와이", "괌", "사이판", "시드니", "멜버른",
    "두바이", "터키", "이스탄불", "몰디브", "칸쿤",
    "해외여행", "일본여행", "베트남여행", "태국여행", "유럽여행", "미국여행", "중국여행",
    "일본 여행", "해외 여행", "유럽 여행",
]

# ─────────────────────────────────────────────────────────────
# [A] 영상 소싱 설정
# ─────────────────────────────────────────────────────────────

# 설명란에 "코스 목록/타임라인/장소 정보"가 실릴 만한 롱폼을 노리는 검색 키워드
SEARCH_KEYWORDS = [
    "데이트 코스 타임라인 브이로그",
    "당일치기 코스 정리 브이로그",
    "데이트 코스 위치 정보 더보기",
    "서울 데이트 코스 추천 타임스탬프",
    "경기도 여행 코스 추천 타임라인",
    "커플 여행 브이로그 방문 장소 정리",
    "주말 나들이 코스 장소 목록 브이로그",
]

# 설명란이 이보다 짧으면 파싱할 코스 목록이 없다고 보고 스킵
MIN_DESCRIPTION_LEN = 100

# ─────────────────────────────────────────────────────────────
# [D] 행정구역 사전 (region_hints 오탐 제거용)
#     완전성보다 "오탐 제거"가 목적 — 사전에 없으면 힌트로 쓰지 않는다(필터가 느슨해질 뿐 안전).
# ─────────────────────────────────────────────────────────────

METRO_REGIONS = {
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
}

DISTRICT_NAMES = set("""
강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구
서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구
영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 연제구 수영구 사상구 기장군
수성구 달서구 달성군 군위군
미추홀구 연수구 남동구 부평구 계양구 서구 동구 강화군 옹진군
광산구 유성구 대덕구 울주군 세종시
수원시 성남시 고양시 용인시 부천시 안산시 안양시 남양주시 화성시 평택시 의정부시 시흥시
파주시 광명시 김포시 군포시 광주시 이천시 양주시 오산시 안성시 포천시 의왕시 하남시 여주시
동두천시 과천시 구리시 양평군 가평군 연천군
장안구 권선구 팔달구 영통구 수정구 중원구 분당구 덕양구 일산동구 일산서구 처인구 기흥구 수지구
만안구 동안구 상록구 단원구 소사구 오정구
춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군
화천군 양구군 인제군 고성군 양양군
청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군
상당구 서원구 흥덕구 청원구
천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군
예산군 태안군 동남구 서북구
전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군
부안군 완산구 덕진구
목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군
해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군
포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군
영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군
창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 남해군 하동군
산청군 함양군 거창군 합천군 의창구 성산구 마산합포구 마산회원구 진해구
제주시 서귀포시
""".split())

# 접미사(시/군/구)를 뗀 지명 (예: "논산", "경주") — 후보가 이것 단독이면 상호명이 아님
BARE_CITY_NAMES = {d[:-1] for d in DISTRICT_NAMES if len(d) >= 3}

# 접미사 없이 등장해도 지역 힌트로 인정할 시·군 지명 (예: "서산 당일치기", "청주 힐링코스").
# 브이로그 제목은 접미사를 거의 쓰지 않아, 접미사 필수 정규식이 정탐을 통째로 죽였다.
#  - 자치구(수영/연수/동안/미추홀 ...)의 접미사 뗀 형태는 일반명사와 겹쳐 제외한다.
#  - 시·군 중에서도 동음이의어(동해/화성/영광/예산/고령 ...)는 제외한다.
BARE_HINT_EXCLUDE = {
    "동해", "남해", "서해", "화성", "고성", "영광", "예산", "고령", "정선", "성주",
    "청도", "장수", "광명", "구리", "하남", "완주", "진안", "무주", "의성", "고창",
}
BARE_CITY_HINTS = {
    d[:-1] for d in DISTRICT_NAMES if len(d) >= 3 and d.endswith(("시", "군"))
} - BARE_HINT_EXCLUDE

# 여러 시도에 중복 존재해 지역 판별력이 없는 자치구명 — 힌트로 쓰지 않는다.
AMBIGUOUS_DISTRICTS = {"중구", "남구", "북구", "동구", "서구"}

# 지명 뒤에 이 말이 붙으면 '여행 대상 지역'이 아니라 화자의 거주지/출발지다.
# 예: "서울 직장인의 청주 나홀로 힐링 코스" → 대상은 청주, 서울은 힌트가 아니다.
RESIDENCE_MARKERS = (
    "근교", "직장인", "사는", "살고", "거주", "출신", "토박이", "주민", "촌놈",
    "출발", "떠나", "벗어나", "탈출", "사람",
)

# ─────────────────────────────────────────────────────────────
# [B] 후보 품질 게이트 설정
# ─────────────────────────────────────────────────────────────

# 상호명에 허용되는 문자 (한글/영문/숫자/공백/&/./-/'/,)
ALLOWED_NAME_CHARS = re.compile(r"^[가-힣a-zA-Z0-9\s&\.\-'’]+$")

# 이모지·장식기호 (제거 시도 대상)
DECOR_PATTERN = re.compile(
    "["
    "\U0001F000-\U0001FAFF"   # 이모지 전반
    "\U00002600-\U000027BF"   # 기타 심볼/딩벳
    "\U00002190-\U000021FF"   # 화살표
    "\U00002B00-\U00002BFF"
    "\U00003000-\U0000303F"   # CJK 구두점
    "\U0000FE00-\U0000FE0F"   # variation selector
    "\U0000200B-\U0000200D"   # zero-width / ZWJ
    "\U000024C2-\U000024FF"   # enclosed alphanumerics
    "\U00002000-\U0000206F"   # general punctuation (— · … 등)
    "\U000020D0-\U000020FF"
    "\U0001F1E6-\U0001F1FF"   # 국기(regional indicator)
    "♥♡★☆✔✅❤❥☞☜▶◀■□●○◆◇※〜"
    "]+"
)

# 한국어 조사·어미로 끝나는 문장 조각
SENTENCE_ENDINGS = (
    "인데용", "인데요", "인데", "는데", "은데", "예요", "에요", "해요", "어요", "아요", "네요",
    "지요", "이죠", "하죠", "래요", "대요", "구요", "고요", "세요", "셨어", "습니다", "합니다",
    "입니다", "했다", "이다", "였다", "된다", "한다", "까지", "부터", "에서", "에게", "으로",
    "하는", "가는", "오는", "있는", "없는", "같은", "하러", "가서", "와서", "하고", "이랑",
    "면서", "려고", "지만", "다면", "다가", "든지", "든가", "니까", "니까", "니까", "처럼", "보다", "마다",
    "못가", "못가는", "하기", "되는", "라고", "이나", "거나", "듯이", "조차", "밖에", "만큼",
)

# 문장부호가 섞여 있으면 상호명이 아님
SENTENCE_PUNCT = ("!", "?", "~", "…", "‼", "⁉", "ㅋ", "ㅎ", "ㅠ", "ㅜ")

# 무의미한 일반명사 (불용어)
STOPWORDS = [
    "intro", "outro", "인트로", "아웃트로", "요약", "맛집", "카페", "술집",
    "미리보기", "엔딩", "인사말", "오프닝", "클로징", "마무리",
    "오늘", "이번", "여행", "브이로그", "영상", "더보기", "인스타그램", "협찬",
    "광고", "구독", "좋아요", "정보", "위치", "타임라인", "timestamp", "쇼핑", "시작",
    "아이스", "가격", "메뉴", "주문", "예약", "주소", "영업시간", "전화",
    "데이트", "코스", "추천", "핫플", "숙소", "일정", "준비물", "경비", "총정리",
    "이동", "출발", "도착", "점심", "저녁", "아침", "야식", "간식", "휴식", "산책",
    "문의", "협업", "비즈니스", "메일", "이메일", "채널", "구독자", "댓글", "링크",
    # 여행 보통명사 — "파주 놀거리", "대전 가볼만한곳" 류의 검색어형 후보 차단용
    "국내", "놀거리", "볼거리", "먹거리", "즐길거리", "가볼만한곳", "가볼만한", "가볼만",
    "총정리", "당일치기", "나들이", "근교", "여행지", "관광지", "나홀로", "명소",
    "겨울", "여름", "봄나들이", "가을",
    # 이벤트/경품 보일러플레이트 — 설명란 하단 고정 문구에서 새어 나오는 후보
    "경품", "발표", "추첨", "응모", "당첨", "참여방법", "참여", "폼링크", "비밀링크",
    "행사기간", "이벤트", "신청", "공지", "안내", "혜택", "적립", "선착순", "기간",
]

# 상호명에 절대 쓰이지 않는 토큰 (하나라도 어절로 등장하면 문장 조각)
NON_SPOT_TOKENS = {
    "봄", "여름", "가을", "겨울", "날씨", "주말", "평일", "오늘", "어제", "내일", "이번",
    "혼자", "커플", "연인", "남자친구", "여자친구", "남친", "여친", "친구", "우리", "저희",
    "진짜", "완전", "최고", "역대급", "미친", "핵", "존맛", "인정", "무조건", "필수",
    "하루", "이틀", "당일", "1박2일", "무료", "가성비", "솔직", "내돈내산", "협찬", "광고",
    "더운", "추운", "따뜻한", "시원한", "예쁜", "이쁜", "힙한", "감성", "요즘", "새로",
    "실내", "야외", "근교", "시내", "전국", "국내", "여기", "거기", "저기", "이곳", "그곳",
    "최저가", "할인", "쿠폰", "증정", "특가", "구매", "판매", "링크", "이벤트", "기간",
}

# 상호명이 아니라 문장임을 드러내는 말미 명사
TAIL_NOUNS = {
    "곳", "것", "거", "데", "법", "팁", "편", "날", "때", "중", "후기", "정도", "이유",
    "방법", "느낌", "기분", "시간", "분위기", "추천", "정리", "모음", "리스트", "총정리",
    "코스", "일정", "계획", "준비", "이야기", "생각", "기록", "일상", "브이로그",
    "쇼핑", "구경", "투어", "나들이", "산책", "구성", "가격", "메뉴", "정보", "후기들",
}

# 도로명 주소 패턴
ADDR_PATTERN = re.compile(r'^[가-힣]+\s+[가-힣]+(?:시|군|구)\s+[가-힣]+(?:로|길|대로)')

# 행정구역 단독 토큰 (예: "행궁동", "마포구") — 상호명이 아니므로 후보에서 제외
ADMIN_ONLY_PATTERN = re.compile(r'^[가-힣]{1,5}(?:동|읍|면|리|시|군|구|도)$')


def extract_video_id(url: str) -> str | None:
    """유튜브 URL에서 videoId 추출"""
    m = re.search(r'(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None


def _decode_short_description(raw_desc: str) -> str:
    """HTML 내 JSON 문자열로 박혀 있는 shortDescription 디코딩"""
    try:
        return json.loads(f'"{raw_desc}"')
    except Exception:
        try:
            return raw_desc.encode('utf-8').decode('unicode_escape')
        except Exception:
            return raw_desc.replace('\\n', '\n')


def _parse_like_count(text: str) -> int:
    """좋아요 텍스트(예: '좋아요 1.5천개', '좋아요 820개', '1.2K')를 정수로 파싱"""
    if not text:
        return 0
    m_man = re.search(r'([\d,.]+)만', text)
    if m_man:
        try:
            return int(float(m_man.group(1).replace(',', '')) * 10000)
        except Exception:
            pass
    m_chun = re.search(r'([\d,.]+)천', text)
    if m_chun:
        try:
            return int(float(m_chun.group(1).replace(',', '')) * 1000)
        except Exception:
            pass
    m_k = re.search(r'([\d,.]+)[kK]', text)
    if m_k:
        try:
            return int(float(m_k.group(1).replace(',', '')) * 1000)
        except Exception:
            pass
    m_num = re.search(r'([\d,]+)', text)
    if m_num:
        try:
            return int(m_num.group(1).replace(',', ''))
        except Exception:
            pass
    return 0


def _fetch_watch_html(video_id: str, verbose: bool = False) -> dict:
    """watch 페이지 HTML 스크래핑 경로. {description, views, likes, title, status, length} 반환"""
    out = {"description": "", "views": 0, "likes": 0, "title": "", "status": 0, "length": 0, "error": ""}
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        req = urllib.request.Request(video_url, headers=WATCH_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            out["status"] = getattr(resp, "status", 200)
            html = resp.read().decode('utf-8', errors='ignore')
            out["length"] = len(html)

            desc_match = re.search(r'\"shortDescription\":\"(.*?)\",\"', html)
            if not desc_match:
                desc_match = re.search(r'\"shortDescription\":\"(.*?)\"', html)
            if desc_match:
                out["description"] = _decode_short_description(desc_match.group(1))

            view_match = re.search(r'\"viewCount\":\"(\d+)\"', html)
            if view_match:
                out["views"] = int(view_match.group(1))

            like_match = re.search(r'\"accessibilityData\":\{\"label\":\"좋아요 ([^\"]+)\"\}', html)
            if not like_match:
                like_match = re.search(r'\"defaultText\":\{\"accessibility\":\{\"accessibilityData\":\{\"label\":\"좋아요 ([^\"]+)\"\}\}', html)
            if like_match:
                out["likes"] = _parse_like_count(like_match.group(1))

            t_match = re.search(r'\"title\":\{\"simpleText\":\"(.*?)\"\}', html)
            if t_match:
                out["title"] = _decode_short_description(t_match.group(1))
    except Exception as e:
        out["error"] = str(e)[:80]
    return out


def _fetch_innertube(video_id: str, client: dict, verbose: bool = False) -> dict:
    """InnerTube player API 폴백 경로. videoDetails 기반 메타데이터 반환"""
    out = {"description": "", "views": 0, "likes": 0, "title": "", "author": "",
           "status": 0, "length": 0, "error": ""}
    payload = dict(client["context"])
    body = {"context": payload, "videoId": video_id,
            "contentCheckOk": True, "racyCheckOk": True}
    data_bytes = json.dumps(body, ensure_ascii=False).encode('utf-8')
    headers = {
        "Content-Type": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Origin": "https://www.youtube.com",
        "Referer": f"https://www.youtube.com/watch?v={video_id}",
        "Cookie": "CONSENT=YES+1; SOCS=CAI",
    }
    headers.update(client.get("headers", {}))
    try:
        req = urllib.request.Request(INNERTUBE_URL, data=data_bytes, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            out["status"] = getattr(resp, "status", 200)
            raw = resp.read().decode('utf-8', errors='ignore')
            out["length"] = len(raw)
            data = json.loads(raw)
            details = data.get("videoDetails") or {}
            out["description"] = details.get("shortDescription") or ""
            out["title"] = details.get("title") or ""
            out["author"] = details.get("author") or ""
            try:
                out["views"] = int(details.get("viewCount") or 0)
            except Exception:
                out["views"] = 0
            if not details:
                status = ((data.get("playabilityStatus") or {}).get("status")) or "NO_DETAILS"
                out["error"] = f"playabilityStatus={status}"
    except Exception as e:
        out["error"] = str(e)[:80]
    return out


def _find_key(node, key: str):
    """중첩 JSON 에서 특정 키의 첫 값을 찾아 반환"""
    if isinstance(node, dict):
        if key in node:
            return node[key]
        for v in node.values():
            found = _find_key(v, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _find_key(v, key)
            if found is not None:
                return found
    return None


def _fetch_innertube_next(video_id: str) -> dict:
    """InnerTube next 엔드포인트 폴백 — attributedDescription 에서 설명란 확보"""
    out = {"description": "", "views": 0, "likes": 0, "title": "", "status": 0, "length": 0, "error": ""}
    body = {
        "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00",
                               "hl": "ko", "gl": "KR"}},
        "videoId": video_id,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Origin": "https://www.youtube.com",
        "Referer": f"https://www.youtube.com/watch?v={video_id}",
        "Cookie": "CONSENT=YES+1; SOCS=CAI",
        "User-Agent": UA_DESKTOP,
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": "2.20250101.00.00",
    }
    try:
        req = urllib.request.Request(INNERTUBE_NEXT_URL,
                                     data=json.dumps(body, ensure_ascii=False).encode('utf-8'),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            out["status"] = getattr(resp, "status", 200)
            raw = resp.read().decode('utf-8', errors='ignore')
            out["length"] = len(raw)
            data = json.loads(raw)
        attr = _find_key(data, "attributedDescription")
        if isinstance(attr, dict):
            out["description"] = attr.get("content") or ""
        vc = _find_key(data, "viewCount")
        if isinstance(vc, dict):
            txt = json.dumps(vc, ensure_ascii=False)
            m = re.search(r'([\d,]{3,})회', txt)
            if m:
                try:
                    out["views"] = int(m.group(1).replace(",", ""))
                except Exception:
                    pass
        # 좋아요 수 추출 (segmentedLikeDislikeButtonViewModel / defaultText)
        btn = _find_key(data, "segmentedLikeDislikeButtonViewModel")
        if isinstance(btn, dict):
            btn_txt = json.dumps(btn, ensure_ascii=False)
            m_l = re.search(r'\"label\":\"좋아요 ([^\"]+)\"', btn_txt)
            if m_l:
                out["likes"] = _parse_like_count(m_l.group(1))
        t = _find_key(data, "videoPrimaryInfoRenderer")
        if isinstance(t, dict):
            title_obj = (t.get("title") or {}).get("runs") or []
            if title_obj:
                out["title"] = "".join(r.get("text", "") for r in title_obj)
        if not out["description"]:
            out["error"] = "attributedDescription 없음"
    except Exception as e:
        out["error"] = str(e)[:80]
    return out


def _fetch_pinned_comment_and_transcript(video_id: str) -> dict:
    """고정 댓글(Pinned Comment) 및 자막(Transcript) 텍스트 수집 (쇼츠/설명란 부재 영상 대응)"""
    res = {"pinned_comment": "", "transcript": ""}
    
    # 1. InnerTube next 엔드포인트에서 itemSectionRenderer / commentThreadRenderer 파싱
    body = {
        "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "ko", "gl": "KR"}},
        "videoId": video_id,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Origin": "https://www.youtube.com",
        "Referer": f"https://www.youtube.com/watch?v={video_id}",
        "Cookie": "CONSENT=YES+1; SOCS=CAI",
        "User-Agent": UA_DESKTOP,
    }
    try:
        req = urllib.request.Request(INNERTUBE_NEXT_URL, data=json.dumps(body).encode('utf-8'), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='ignore'))
            
            # 고정 댓글(pinned comment) 또는 상단 댓글 탐색
            comments = []
            def _find_comments(node):
                if isinstance(node, dict):
                    if "commentRenderer" in node:
                        cr = node["commentRenderer"]
                        ctext_runs = ((cr.get("contentText") or {}).get("runs")) or []
                        ctext = "".join(r.get("text", "") for r in ctext_runs).strip()
                        # 고정 뱃지(pinned) 확인
                        is_pinned = bool(cr.get("pinnedCommentBadge"))
                        if ctext:
                            comments.append((is_pinned, ctext))
                    for v in node.values():
                        _find_comments(v)
                elif isinstance(node, list):
                    for v in node:
                        _find_comments(v)
            
            _find_comments(data)
            if comments:
                # 고정 댓글 우선, 없으면 첫 번째 댓글
                sorted_c = sorted(comments, key=lambda x: x[0], reverse=True)
                res["pinned_comment"] = sorted_c[0][1]
    except Exception:
        pass

    try:
        req_p = urllib.request.Request(INNERTUBE_URL, data=json.dumps(player_body).encode('utf-8'), headers=headers, method="POST")
        with urllib.request.urlopen(req_p, timeout=8) as resp_p:
            pdata = json.loads(resp_p.read().decode('utf-8', errors='ignore'))
            captions = (((pdata.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks")) or []
            ko_track = next((c.get("baseUrl") for c in captions if c.get("languageCode") == "ko"), None)
            if not ko_track and captions:
                ko_track = captions[0].get("baseUrl")
            
            if ko_track:
                # 자막 XML/JSON 페칭
                req_t = urllib.request.Request(ko_track + "&fmt=json3", headers={"User-Agent": UA_DESKTOP})
                with urllib.request.urlopen(req_t, timeout=8) as resp_t:
                    t_json = json.loads(resp_t.read().decode('utf-8', errors='ignore'))
                    events = t_json.get("events") or []
                    transcript_lines = []
                    for ev in events:
                        segs = ev.get("segs") or []
                        line = "".join(s.get("utf8", "") for s in segs).strip()
                        if line:
                            transcript_lines.append(line)
                    res["transcript"] = " ".join(transcript_lines[:150])  # 앞 150줄 결합
    except Exception:
        pass

    return res


def get_youtube_video_info(video_id: str, verbose: bool = False) -> dict | None:
    """유튜브 영상 메타데이터 조회.
    경로: oEmbed(제목·채널) → watch HTML(설명·조회수) → InnerTube player API 폴백.
    어느 경로로 설명란을 확보했는지 desc_source 에 기록한다."""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    diag = []

    # 1. oEmbed 기본 메타데이터 (제목/채널명/썸네일)
    oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(video_url)}&format=json"
    title, author_name, thum_url = "", "", ""
    try:
        req = urllib.request.Request(oembed_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            title = data.get("title", "")
            author_name = data.get("author_name", "")
            thum_url = data.get("thumbnail_url", "")
        diag.append("oEmbed:OK")
    except Exception as e:
        diag.append(f"oEmbed:FAIL({str(e)[:40]})")

    description, views, likes, desc_source = "", 0, 0, "none"

    # 2. watch 페이지 HTML 스크래핑 (동의 쿠키 포함)
    if not os.getenv("YT_FORCE_INNERTUBE"):
        w = _fetch_watch_html(video_id, verbose=verbose)
        if w["description"]:
            description, desc_source = w["description"], "watch_html"
            views = w["views"]
            likes = w.get("likes", 0)
            diag.append(f"watchHTML:OK({w['length']:,}B, desc {len(description)}자, views {views:,})")
        else:
            diag.append(f"watchHTML:MISS(status={w['status']}, {w['length']:,}B"
                        f"{', ' + w['error'] if w['error'] else ''})")
            if w["views"]:
                views = w["views"]
            if w.get("likes"):
                likes = w["likes"]
    else:
        diag.append("watchHTML:SKIPPED(YT_FORCE_INNERTUBE)")

    # 3. InnerTube player API 폴백
    if not description:
        for client in INNERTUBE_CLIENTS:
            it = _fetch_innertube(video_id, client, verbose=verbose)
            if it["description"]:
                description, desc_source = it["description"], client["label"]
                views = it["views"] or views
                likes = it.get("likes", 0) or likes
                title = title or it["title"]
                author_name = author_name or it["author"]
                diag.append(f"{client['label']}:OK({it['length']:,}B, desc {len(description)}자, views {views:,})")
                break
            diag.append(f"{client['label']}:MISS(status={it['status']}, {it['length']:,}B"
                        f"{', ' + it['error'] if it['error'] else ''})")
            if it["views"] and not views:
                views = it["views"]
            if it.get("likes") and not likes:
                likes = it["likes"]
            if it["title"] and not title:
                title = it["title"]

    # 4. InnerTube next 엔드포인트 최후 폴백 (attributedDescription)
    if not description:
        nx = _fetch_innertube_next(video_id)
        if nx["description"]:
            description, desc_source = nx["description"], "innertube_next"
            views = views or nx["views"]
            title = title or nx["title"]
            diag.append(f"innertube_next:OK({nx['length']:,}B, desc {len(description)}자)")
        else:
            diag.append(f"innertube_next:MISS(status={nx['status']}, {nx['length']:,}B"
                        f"{', ' + nx['error'] if nx['error'] else ''})")
            views = views or nx["views"]
            title = title or nx["title"]

    if verbose:
        print(f"    🛰️ 메타 수집 경로: {' → '.join(diag)}")

    if not title and not description:
        return None

    return {
        "videoId": video_id,
        "url": video_url,
        "title": title,
        "author": author_name,
        "description": description,
        "views": views,
        "likes": likes,
        "thumbnail": thum_url,
        "desc_source": desc_source,
        "meta_diag": diag,
    }


def load_processed_history() -> list[str]:
    """이미 처리한 video_id 목록 로드 (최근 HISTORY_MAX 개)"""
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data = data.get("video_ids", [])
        return [str(v) for v in data][-HISTORY_MAX:]
    except Exception:
        return []


def save_processed_history(video_ids: list[str]) -> None:
    """처리 이력 저장 (FIFO, 최근 HISTORY_MAX 개만 유지)"""
    try:
        trimmed = video_ids[-HISTORY_MAX:]
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump({"video_ids": trimmed, "updated_at": int(time.time())},
                      f, ensure_ascii=False)
    except Exception as e:
        print(f"  ⚠️ 처리 이력 저장 실패: {e}")


# 일본어 가나 / 태국어 등 비(非)한국어 문자 — 해외 영상 판별 보조
# 해외/외국어 스크립트 (히라가나, 가타카나, 태국어, 아랍어, 키릴문자, 한자 등)
FOREIGN_SCRIPT_PATTERN = re.compile(r'[぀-ゟ゠-ヿ฀-๿\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fff]')
FOREIGN_DRAMA_KEYWORDS = [
    "drama", "yumi drama", "passion drama", "短剧", "电视剧", "总裁", "豪门",
    "替嫁", "逆袭", "multi sub", "eng sub", "indo sub", "full episode", "ep.0", "ep.1", "ep.2"
]

def is_overseas_video(title: str, description: str = "") -> str:
    """해외 여행/외국어/해외드라마 영상 여부 판별. 걸린 키워드를 반환(없으면 빈 문자열)"""
    t = title or ""
    blob = f"{t} {(description or '')[:300]}".lower()

    # 1. 명시적 해외 여행 키워드
    for kw in OVERSEAS_KEYWORDS:
        if kw.lower() in blob:
            return kw

    # 2. 해외 드라마/웹소설 키워드
    for dkw in FOREIGN_DRAMA_KEYWORDS:
        if dkw.lower() in blob:
            return f"해외드라마({dkw})"

    # 3. 한자/외국어 문자 포함 여부
    if FOREIGN_SCRIPT_PATTERN.search(t):
        return "외국어문자"

    # 4. 제목에 한글이 최소 2글자 이상 없으면 국내 데이트 영상이 아님
    hangul_chars = re.findall(r'[가-힣]', t)
    if len(hangul_chars) < 2:
        return "한글미포함"

    return ""


def is_shorts(url: str, title: str, description: str = "") -> bool:
    """쇼츠 영상 여부 판별"""
    if "/shorts/" in (url or ""):
        return True
    blob = f"{title or ''} {description or ''}".lower()
    return "#shorts" in blob or "#쇼츠" in blob or "#short " in blob


# ─────────────────────────────────────────────────────────────
# [B] 후보 품질 게이트
# ─────────────────────────────────────────────────────────────

def sanitize_candidate(text: str) -> str:
    """이모지·장식기호를 제거하고 공백을 정리한 후보 문자열 반환"""
    if not text:
        return ""
    clean = DECOR_PATTERN.sub(" ", text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    # 앞뒤 장식용 구두점 제거
    clean = clean.strip(" .,-·:;|/\\'\"’")
    return clean


def passes_spot_name_gate(raw: str) -> tuple[bool, str, str]:
    """상호명 형태인지 검사. (통과여부, 정제된이름, 탈락사유) 반환"""
    if not raw:
        return False, "", "빈문자열"

    original = raw.strip()

    # 1. 문장부호(감탄/의문/물결/자음체) 포함 → 문장 조각
    if any(p in original for p in SENTENCE_PUNCT):
        return False, "", "문장부호"

    # 2. 괄호 열림/닫힘 불일치 (괄호 잔여물)
    for op, cl in (("(", ")"), ("[", "]"), ("{", "}")):
        if original.count(op) != original.count(cl):
            return False, "", "괄호잔여물"

    # 3. 괄호 내용 제거 후 이모지/특수기호 제거 시도
    name = re.sub(r'[\(\[\{].*?[\)\]\}]', ' ', original)
    name = sanitize_candidate(name)
    if not name:
        return False, "", "기호만존재"

    # 4. 정제 후에도 허용 문자 외가 남으면 상호명 형태가 아님
    if not ALLOWED_NAME_CHARS.match(name):
        return False, "", "특수문자"

    # 5. 길이
    if len(name) < 2 or len(name) > 25:
        return False, "", "길이초과" if len(name) > 25 else "길이미달"

    # 6. 한글/영문이 하나도 없음
    if not re.search(r'[가-힣a-zA-Z]', name):
        return False, "", "문자없음"

    # 7. 어절 수 (상호명은 통상 1~3어절)
    tokens = name.split()
    if len(tokens) > 4:
        return False, "", "어절과다"

    # 8. 한국어 조사·어미로 끝나는 문장 조각
    if name.endswith(SENTENCE_ENDINGS):
        return False, "", "문장어미"
    if any(t.endswith(SENTENCE_ENDINGS) for t in tokens if len(t) >= 3):
        return False, "", "문장어미"

    # 9. 불용어 (완전 일치 / 모든 어절이 불용어 / 불용어+1자)
    low = name.lower()
    low_tokens = [t.lower() for t in tokens]
    if any(low == sw for sw in STOPWORDS):
        return False, "", "불용어"
    if all(any(t == sw or (t.startswith(sw) and len(t) - len(sw) <= 1) for sw in STOPWORDS)
           for t in low_tokens):
        return False, "", "불용어"

    # 10. 상호명에 쓰이지 않는 토큰 / 문장 말미 명사
    if any(t in NON_SPOT_TOKENS for t in tokens):
        return False, "", "비상호토큰"
    if tokens[-1] in TAIL_NOUNS:
        return False, "", "문장말미명사"

    # 11. 해외 지명이 섞인 후보 (국내 스팟 파이프라인 대상 아님)
    if any(ov in name for ov in OVERSEAS_KEYWORDS if len(ov) >= 2 and " " not in ov):
        return False, "", "해외지명"

    # 12. 도로명 주소 텍스트
    if ADDR_PATTERN.match(name):
        return False, "", "주소텍스트"

    # 13. 행정구역 단독 토큰 (예: "행궁동", "마포구", "논산", "서울") — 상호명이 아님
    if ADMIN_ONLY_PATTERN.match(name):
        return False, "", "행정구역단독"
    if name in METRO_REGIONS or name in DISTRICT_NAMES or name in BARE_CITY_NAMES:
        return False, "", "행정구역단독"

    # 13-b. '지명 + 일반어' 조합 (예: "파주 놀거리", "대전 가볼만한곳", "국내 여행").
    #        상호명이 아니라 검색어다. 이런 후보를 지도에 던지면 그 지역의
    #        아무 업체(파주엠모터스, 대전일보 ...)나 최상위로 걸려 오등록된다.
    def _is_place_token(tok: str) -> bool:
        return (tok in METRO_REGIONS or tok in DISTRICT_NAMES
                or tok in BARE_CITY_NAMES or bool(ADMIN_ONLY_PATTERN.match(tok)))

    def _is_stop_token(tok: str) -> bool:
        tl = tok.lower()
        return any(tl == sw or (tl.startswith(sw) and len(tl) - len(sw) <= 1)
                   for sw in STOPWORDS)

    if all(_is_place_token(t) or _is_stop_token(t) for t in tokens):
        return False, "", "지명+불용어"

    return True, name, ""


def _collect_description_candidates(description: str) -> list[str]:
    """설명란에서 타임스탬프/번호목록/아이콘 라인 기반 후보 원문 수집"""
    raw = []

    # 1. 타임스탬프 라인 (예: "01:23 선샤인스튜디오")
    for line in re.findall(r'(?:[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\s*[-~:•·]?\s*([^\n\r]+)', description):
        raw.append(line)

    # 2. 번호 리스트 (예: "1. 초막골생태공원", "3) 반월호수공원")
    for line in re.findall(r'(?:^|\n)\s*[0-9]{1,2}[\.\)\-]\s*([^\n\r:—]+)', description):
        raw.append(line)

    # 4. 아이콘/헤더 기반 (예: "📍 선샤인스튜디오")
    for spot in re.findall(r'(?:📍|📌|🏠|☕|🍽️|🏛️|🌳|🌿|🎪|▶|✔|·)\s*([^\n\r:—]+)', description):
        raw.append(spot)

    return raw


def _collect_title_candidates(title: str) -> list[str]:
    """제목 구분자 기반 후보 원문 수집 (폴백 전용)"""
    raw = []
    for part in re.split(r'[,|/·•\+]', title):
        clean = re.sub(
            r'당일치기|브이로그|여행지|여행|하루|코스|데이트|맛집|카페|핫플|추천|Vlog|가볼만한곳',
            '', part, flags=re.IGNORECASE
        ).strip()
        if clean:
            raw.append(clean)
    return raw


def extract_spot_candidates_verbose(title: str, description: str, video_id: str = "") -> dict:
    """후보 추출 + 게이트 통과 결과를 상세 반환.
    반환: {raw: int, passed: list[str], source: 'description'|'pinned_comment'|'groq_semantic_extractor'|'title'|'none', rejected: list[(원문, 사유)]}
    """
    def _gate(raw_list: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
        passed, rejected = [], []
        for r in raw_list:
            ok, name, reason = passes_spot_name_gate(r)
            if ok:
                if name not in passed:
                    passed.append(name)
            else:
                rejected.append((r.strip()[:30], reason))
        return passed, rejected

    # 1. 설명란 정형 리스트/타임스탬프 추출
    desc_raw = _collect_description_candidates(description or "")
    desc_passed, desc_rejected = _gate(desc_raw)
    if desc_passed:
        return {
            "raw": len(desc_raw),
            "passed": desc_passed,
            "source": "description",
            "rejected": desc_rejected,
        }

    # 2. 설명란 후보 부재/쇼츠 대응: 고정 댓글 및 자막 파싱 + Groq 지능형 추출
    if video_id:
        extra_data = _fetch_pinned_comment_and_transcript(video_id)
        pinned = extra_data.get("pinned_comment", "")
        transcript = extra_data.get("transcript", "")

        # 2-A. 고정 댓글 정형 목록 룰베이스 추출
        if pinned:
            pin_raw = _collect_description_candidates(pinned)
            pin_passed, pin_rejected = _gate(pin_raw)
            if pin_passed:
                return {
                    "raw": len(desc_raw) + len(pin_raw),
                    "passed": pin_passed,
                    "source": "pinned_comment",
                    "rejected": desc_rejected + pin_rejected,
                }

        # 2-B. Groq LLM 기반 비정형 텍스트 지능형 추출 (고정댓글, 자막, 설명란)
        combined_text = f"{pinned}\n{transcript}\n{description or ''}".strip()
        if extract_spots_from_unstructured_text and len(combined_text) >= 15:
            groq_spots = extract_spots_from_unstructured_text(combined_text, video_title=title)
            if groq_spots:
                groq_raw = [s.get("name") for s in groq_spots if s.get("name")]
                groq_passed, groq_rejected = _gate(groq_raw)
                if groq_passed:
                    return {
                        "raw": len(desc_raw) + len(groq_raw),
                        "passed": groq_passed,
                        "source": "groq_semantic_extractor",
                        "rejected": desc_rejected + groq_rejected,
                    }

    # 3. 설명란/댓글/자막/Groq 모두 실패 시 제목 파싱 폴백 (게이트 통과분만 채택)
    title_raw = _collect_title_candidates(title or "")
    title_passed, title_rejected = _gate(title_raw)
    return {
        "raw": len(desc_raw) + len(title_raw),
        "passed": title_passed,
        "source": "title" if title_passed else "none",
        "rejected": desc_rejected + title_rejected,
    }


def extract_spot_candidates(title: str, description: str) -> list[str]:
    """영상 제목과 설명란에서 유력 장소명 후보군 추출 (게이트 통과분만)"""
    return extract_spot_candidates_verbose(title, description)["passed"]


# ─────────────────────────────────────────────────────────────
# [D] region hints
# ─────────────────────────────────────────────────────────────

def extract_region_hints(text: str) -> list[str]:
    """텍스트에서 지역 힌트를 뽑되 실제 행정구역 사전으로 검증한다.

    v3.5 수정 — 접미사(시/군/구)가 붙은 형태만 잡던 정규식이 양방향 오류를 냈다.
      · 정탐 오탈락: "청주 나홀로 힐링" → 청주가 안 잡혀 진짜 청주 스팟이 거부됨
      · 오탐 통과:   "서산 당일치기"   → 힌트 0개 → 지역 게이트 자체가 무력화

    규칙
      1. 접미사형(청주시/상당구)과 접미사 없는 시·군형(청주/서산)을 모두 인정하되,
         사전(METRO_REGIONS | DISTRICT_NAMES | BARE_CITY_HINTS)으로 검증한다.
      2. 거주지/출발지 수식을 받는 지명은 여행 대상이 아니므로 제외한다.
         ("서울 근교", "서울 직장인의", "서울에서 출발")
      3. 기초자치단체 힌트가 하나라도 있으면 광역 힌트는 버린다.
         (['서울','청주'] 가 공존하면 any() 매칭이라 게이트가 느슨해진다)
      4. 여러 시도에 중복 존재하는 자치구명(중구/남구 ...)은 판별력이 없어 제외한다.
    """
    text = text or ""

    def _is_residence(token: str) -> bool:
        """해당 지명의 모든 등장이 거주지/출발지 수식을 받으면 True"""
        spots = [m.end() for m in re.finditer(re.escape(token), text)]
        if not spots:
            return False
        return all(
            any(mk in text[end:end + 8] for mk in RESIDENCE_MARKERS)
            for end in spots
        )

    metro_hints, local_hints = [], []
    # 한글 어절 덩어리의 앞부분에서 지명을 찾는다 ("서산에서", "청주힐링" 처럼
    # 조사·수식어가 붙어도 잡히도록 — 접미사 필수 정규식이 놓치던 부분)
    tokens = []
    for run in re.findall(r'[가-힣]+', text):
        for length in (5, 4, 3, 2):
            if len(run) < length:
                continue
            head = run[:length]
            if head in DISTRICT_NAMES or head in BARE_CITY_HINTS or head in METRO_REGIONS:
                tokens.append(head)
                break
    for token in tokens:
        if token in AMBIGUOUS_DISTRICTS:
            continue
        is_local = token in DISTRICT_NAMES or token in BARE_CITY_HINTS
        is_metro = token in METRO_REGIONS
        if not (is_local or is_metro):
            continue
        if _is_residence(token):
            continue
        bucket = local_hints if is_local else metro_hints
        if token not in bucket:
            bucket.append(token)

    # 기초 힌트 우선 — 광역은 기초가 없을 때만 쓴다
    return local_hints or metro_hints





# 지점/본점 접미 (상호명 비교 시 제거)
BRANCH_SUFFIX_RE = re.compile(r'(본점|직영점|지점|[0-9]{1,2}호점|점포)$')

# 후보 앞뒤에 흔히 붙는 업종 일반어 (핵심어 비교 시 제거)
GENERIC_NAME_AFFIX = ("카페", "cafe", "맛집", "식당", "레스토랑", "베이커리", "브런치")


def _norm_name(s: str) -> str:
    """비교용 정규화 — 공백/구두점 제거 + 소문자화"""
    return re.sub(r"[\s\.\-'’,&]", "", (s or "")).lower()


def _strip_generic(s: str) -> str:
    """핵심어 추출 — 앞뒤에 붙은 업종 일반어를 떼어낸다"""
    out = s
    for g in GENERIC_NAME_AFFIX:
        if out.startswith(g) and len(out) - len(g) >= 2:
            out = out[len(g):]
        if out.endswith(g) and len(out) - len(g) >= 2:
            out = out[:-len(g)]
    return out


def _token_aligned(inner: str, outer_tokens: list[str]) -> bool:
    """inner(공백제거)가 outer 의 앞 k어절 또는 뒤 k어절과 정확히 일치하는가.

    '어절 경계 포함'만 인정한다. 이 규칙이 아래 오등록을 전부 걸러낸다.
      경품 ⊂ 경품왕국 / 발표 ⊂ 편선생스피치발표 / 옥경이네 ⊂ 옥경이네건생선
    반면 정상 매칭은 살린다.
      블루보틀 ≡ '블루보틀 성수'[앞 1어절] / '구월의 유요' ≡ 책방 '구월의유요'[뒤 1어절]
    """
    for k in range(1, len(outer_tokens) + 1):
        if _norm_name("".join(outer_tokens[:k])) == inner:
            return True
        if _norm_name("".join(outer_tokens[-k:])) == inner:
            return True
    return False


def is_name_match(candidate: str, official_name: str) -> bool:
    """지도 검색 결과 상호명이 후보 키워드와 실제로 연관되는지 검증.

    v3.5 강화 — 기존 규칙은 '부분문자열이면 통과'라 지역 힌트가 없을 때
    아래 오등록을 그대로 통과시켰다.
      구움당 → 구움미(경기 군포) / 카페 오프 → 카페나드오프(경기 안산)
      옥경이네 → 옥경이네건생선(서울 중구) / 경품 → 경품왕국
    """
    cand_txt = (candidate or "").strip()
    name_txt = re.sub(r'<[^>]+>', '', official_name or "").strip()
    c = _norm_name(cand_txt)
    n = _norm_name(name_txt)
    if not c or not n:
        return False
    if c == n:
        return True

    # 지점 접미를 뗀 뒤 재비교 (성심당 ≡ 성심당본점)
    n_nb = _norm_name(BRANCH_SUFFIX_RE.sub("", name_txt))
    if c == n_nb:
        return True

    # 어절 경계에 정렬된 포함만 인정
    c_tokens = cand_txt.split()
    n_tokens = BRANCH_SUFFIX_RE.sub("", name_txt).split()
    if len(n_tokens) > 1 and _token_aligned(c, n_tokens):
        return True
    if len(c_tokens) > 1 and _token_aligned(n_nb, c_tokens):
        return True

    # 마지막으로 핵심어 유사도 — 길이 균형과 높은 유사도를 동시에 요구한다
    core_c = _strip_generic(c)
    core_n = _strip_generic(n_nb)
    if len(core_c) < 2 or len(core_n) < 2:
        return False
    if min(len(core_c), len(core_n)) / max(len(core_c), len(core_n)) < 0.7:
        return False
    return difflib.SequenceMatcher(None, core_c, core_n).ratio() >= 0.8


# ─────────────────────────────────────────────────────────────
# 슬롯/무드 판정
#   빌더(scripts/build_spots_json.py)와 동일한 정규식 가드를 사용한다.
#     '스테이(?!크)' : 스테이크·스테이크하우스·스테이션·힐스테이트 오매칭 방지
#     '바(?!다)'     : 바다·바베큐·바스크 오매칭 방지 (단독 '바'는 매칭하지 않는다)
#   stay 는 '네이버 공식 카테고리'로만 판정한다. 유튜브 원문(제목/설명/후보 문자열)에
#   '호텔'·'숙소' 가 스치기만 해도 stay 가 되던 오염 경로를 끊기 위함이다.
# ─────────────────────────────────────────────────────────────

SLOT_STAY_CAT_RE = re.compile(
    r"(숙박|숙소|펜션|호텔|모텔|여관|콘도|리조트|게스트하우스|호스텔|민박|글램핑|"
    r"야영|캠핑|카라반|풀\s*빌라|료칸|산장|스테이(?!크)|"
    r"\bhotel\b|\bresort\b|pension|glamping|hostel)",
    re.IGNORECASE,
)

# 카테고리는 숙박인데 상호명이 명백한 비(非)숙박 업종이면 stay 로 보지 않는다.
# (예: 카테고리 '한옥숙소' + 상호명 '전주한옥마을 도예공방' → stay 아님)
SLOT_STAY_VETO_RE = re.compile(
    r"(카페|커피|베이커리|제과|디저트|찻집|공방|공예|체험관|박물관|미술관|갤러리|전시|"
    r"식당|맛집|레스토랑|다이닝|횟집|고깃집|라운지|펍|주점|포차|공원|해수욕장|해변|"
    r"전망대|수목원|식물원|시장|서점|도서관|바$|\bbar\b|\bcafe\b)",
    re.IGNORECASE,
)

SLOT_NIGHT_RE = re.compile(
    r"((와인|칵테일|루프탑|재즈|몰트|위스키|하이볼|오뎅|스탠딩|스피크이지|라운지)\s*바(?!다)|"
    r"바\(bar\)|\bbar\b|\bpub\b|펍|호프|주점|술집|포차|포장마차|이자카야|"
    r"칵테일|위스키|막걸리|전통주|맥주|브루어리|야경|나이트)",
    re.IGNORECASE,
)

SLOT_EVENING_RE = re.compile(
    r"(음식점|한식|양식|일식|중식|분식|뷔페|레스토랑|다이닝|오마카세|이탈리|한정식|노포|"
    r"육류|고기|갈비|삼겹살|곱창|막창|닭요리|치킨|장어|국밥|칼국수|국수|돈까스|우동|"
    r"순대|떡볶이|샤브샤브|스테이크|파스타|피자|햄버거|해물|생선|해산물|전복|대게|"
    r"초밥|스시|횟집|먹자골목|맛집|식당)",
    re.IGNORECASE,
)


def detect_slot_and_mood(category: str, name: str = "", extra_text: str = "") -> tuple[str, list[str]]:
    """업종(카테고리) 및 상호명 기반 슬롯(day/evening/night/stay) 및 분위기(mood) 자동 분류.

    - slot 판정 근거: category + 지도 공식 상호명(name) 뿐이다.
      extra_text(유튜브 후보 문자열/제목 등)는 mood 에만 쓴다.
    - stay 는 category 가 숙박 업종일 때만, 그리고 상호명이 비숙박 업종을 말하지
      않을 때만 부여한다.
    """
    cat = category or ""
    nm = name or ""
    slot_text = f"{cat} {nm}"

    # 1. Slot
    if SLOT_STAY_CAT_RE.search(cat) and not SLOT_STAY_VETO_RE.search(nm):
        slot = "stay"
    elif SLOT_NIGHT_RE.search(slot_text):
        slot = "night"
    elif SLOT_EVENING_RE.search(slot_text):
        slot = "evening"
    else:
        slot = "day"  # 카페, 전시, 스튜디오, 베이커리, 공원 등

    # 2. Mood (유튜브 원문까지 포함해 폭넓게 본다 — 장식용 태그라 오염 위험이 낮다)
    text = f"{cat} {nm} {extra_text}".lower()
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


# ─────────────────────────────────────────────────────────────
# 마이닝 본체
# ─────────────────────────────────────────────────────────────

def _new_stats() -> dict:
    return {
        "candidates_raw": 0,
        "candidates_gated": 0,
        "no_search_result": 0,
        "region_mismatch": 0,
        "region_underivable": 0,
        "name_mismatch": 0,
        "category_rejected": 0,
        "duplicated": 0,
        "insert_failed": 0,
        "registered": 0,
        "spots": [],
    }


def mine_video_info(vinfo: dict, supabase_url: str, supabase_key: str,
                    dry_run: bool = False, verbose: bool = True) -> dict:
    """이미 조회된 영상 메타데이터로 역방향 마이닝 수행. 통계 dict 반환."""
    stats = _new_stats()

    ext = extract_spot_candidates_verbose(vinfo["title"], vinfo["description"], video_id=vinfo.get("videoId", ""))
    candidates = ext["passed"]
    stats["candidates_raw"] = ext["raw"]
    stats["candidates_gated"] = len(candidates)
    stats["candidate_source"] = ext["source"]
    stats["rejected"] = ext["rejected"]

    if verbose:
        print(f"  • 후보 원문 {ext['raw']}개 → 게이트 통과 {len(candidates)}개 (출처: {ext['source']})")
        if candidates:
            print(f"    ✅ 통과: {candidates}")
        if ext["rejected"]:
            preview = [f"{t}[{r}]" for t, r in ext["rejected"][:6]]
            print(f"    🚫 탈락: {preview}{' ...' if len(ext['rejected']) > 6 else ''}")

    if not candidates:
        return stats

    headers = {
        'apikey': supabase_key or "",
        'Authorization': f'Bearer {supabase_key or ""}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

    # 지역 힌트 (행정구역 사전 검증 완료). 제목 우선, 없으면 설명란 앞부분으로 폴백.
    region_hints = extract_region_hints(vinfo["title"])
    hint_src = "제목"
    if not region_hints:
        region_hints = extract_region_hints((vinfo.get("description") or "")[:600])
        hint_src = "설명란"
    # 검색 쿼리에는 가장 구체적인 힌트 1개만 붙인다 (여러 개를 붙이면 검색이 깨진다)
    region_hint = region_hints[0] if region_hints else ""
    if verbose:
        if region_hints:
            print(f"  • 지역 힌트({hint_src}): {region_hints} → 검색 결합어 '{region_hint}'")
        else:
            print(f"  • 지역 힌트 없음 — 상호명 유사도 게이트로만 검증합니다")

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
            stats["no_search_result"] += 1
            if verbose:
                print(f"    ⏩ '{cand}' — 지도 검색 결과 없음")
            continue

        # 검색 결과 중 영상 지역 힌트와 부합하는 최적 결과 선택
        top = search_res[0]
        if region_hints:
            matched_place = next(
                (p for p in search_res if any(rh in (p.get("roadAddress") or "") for rh in region_hints)),
                None
            )
            if matched_place:
                top = matched_place

        official_name = (top.get("name") or "").strip()
        # 네이버 응답의 상호명에 <b> 등 태그가 섞이는 경우 제거
        official_name = re.sub(r'<[^>]+>', '', official_name).strip()
        road_addr = top.get("roadAddress") or top.get("address") or ""
        thum_url = top.get("thumUrl") or vinfo.get("thumbnail") or ""
        category = top.get("category") or ""
        lat = float(top.get("y")) if top.get("y") else None
        lng = float(top.get("x")) if top.get("x") else None

        if not official_name or not road_addr:
            stats["no_search_result"] += 1
            continue

        # 지역 불일치 검증
        if region_hints and not any(rh in road_addr for rh in region_hints) \
                and not any(rh in official_name for rh in region_hints):
            stats["region_mismatch"] += 1
            if verbose:
                print(f"    ⏩ '{cand}' → {official_name} — 지역 불일치 ({road_addr[:20]})")
            continue

        # 후보 키워드와 무관한 업체가 반환된 경우 차단
        if not is_name_match(cand, official_name):
            stats["name_mismatch"] += 1
            if verbose:
                print(f"    🚫 '{cand}' → {official_name} — 상호명 불일치")
            continue

        # [C] 카테고리 화이트리스트 + 상호명 패턴 검증
        ok_cat, cat_reason = is_date_spot_category(category, official_name)
        if not ok_cat:
            stats["category_rejected"] += 1
            if verbose:
                print(f"    🚫 '{cand}' → {official_name} [{category or '카테고리없음'}] 거부: {cat_reason}")
            continue

        # 권역/기초자치단체는 supabase_worker.derive_region_area 를 재사용한다
        # (일반구 → 부모 시 정규화 + 8개 권역 체계. 판정 실패 시 등록하지 않는다)
        region, area_val = derive_region_area(road_addr)
        if not region:
            stats["region_underivable"] += 1
            if verbose:
                print(f"    ⏩ '{cand}' → {official_name} — 주소에서 권역 도출 실패 ({road_addr[:24]})")
            continue

        slot, moods = detect_slot_and_mood(category, official_name, extra_text=cand)

        # 중복 검사 (동일 상호명이 이미 있는지 확인 — 읽기 전용)
        if supabase_url and supabase_key:
            check_q = urllib.parse.quote(official_name)
            check_url = f"{supabase_url}/rest/v1/spots?name=eq.{check_q}&select=id"
            check_req = urllib.request.Request(check_url, headers=headers)
            try:
                with urllib.request.urlopen(check_req, timeout=5) as c_res:
                    existing = json.loads(c_res.read().decode('utf-8'))
                    if existing:
                        stats["duplicated"] += 1
                        if verbose:
                            print(f"    ⏩ [이미 존재하는 스팟 건너뜀] {official_name} (ID: {existing[0]['id']})")
                        continue
            except Exception:
                pass

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
                    "likes": vinfo.get("likes", 0),
                    "is_shorts": False
                }
            },
            # 조회수 5만 이상 또는 좋아요 2,500개 이상 시 실시간 초인기 핫플(hot_score=85) 판정
            "hot_score": (85.0 if (vinfo.get("views", 0) >= 50000 or vinfo.get("likes", 0) >= 2500) else 75.0) if (vinfo.get("views") or vinfo.get("likes")) else 60.0,
            "quality_score": 90
        }

        if dry_run:
            stats["registered"] += 1
            stats["spots"].append(official_name)
            print(f"    🧪 [DRY-RUN 등록 예정] {official_name} | {category} | {road_addr} | slot={slot} mood={moods}")
            continue

        # Supabase 신규 등록 (INSERT)
        insert_url = f"{supabase_url}/rest/v1/spots"
        insert_bytes = json.dumps(spot_payload, ensure_ascii=False).encode('utf-8')
        insert_req = urllib.request.Request(insert_url, data=insert_bytes, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(insert_req, timeout=5):
                stats["registered"] += 1
                stats["spots"].append(official_name)
                print(f"    ✨ [신규 스팟 등록 성공!] {official_name} ({road_addr}) [슬롯: {slot}]")
        except Exception as e:
            stats["insert_failed"] += 1
            print(f"    ❌ DB 등록 실패 ({official_name}): {e}")

    return stats


def mine_youtube_vlog(url: str, supabase_url: str, supabase_key: str, dry_run: bool = False) -> int:
    """유튜브 브이로그 URL 역방향 마이닝 실행. 신규 등록된 스팟 수를 반환."""
    video_id = extract_video_id(url)
    if not video_id:
        print(f"❌ 유효하지 않은 유튜브 URL입니다: {url}")
        return 0

    print(f"🎬 [1/3] 유튜브 영상 메타데이터 수집 중... (ID: {video_id})")
    vinfo = get_youtube_video_info(video_id, verbose=True)
    if not vinfo:
        print(f"❌ 영상 정보를 불러올 수 없습니다. (ID: {video_id})")
        return 0

    print(f"  • 영상 제목: {vinfo['title']}")
    print(f"  • 채널명: {vinfo['author']} (조회수: {vinfo['views']:,}회) / "
          f"설명란 {len(vinfo['description'])}자 [{vinfo.get('desc_source')}]")

    if not vinfo["description"]:
        print(f"  ℹ️ 설명란 부재 — 고정 댓글, 자막 및 Groq 지능형 추출 파이프라인으로 처리를 시도합니다.")

    print(f"\n🔍 [2/3] 영상 내 방문 장소 추출 및 지도 정밀 검증 중...{' [DRY-RUN]' if dry_run else ''}")
    stats = mine_video_info(vinfo, supabase_url, supabase_key, dry_run=dry_run)

    print(f"\n🎉 [3/3] 유튜브 역방향 마이닝 완료: 총 {stats['registered']}개 스팟 "
          f"{'등록 예정(dry-run)' if dry_run else '신규 등록 완료'}!")
    for s in stats["spots"]:
        print(f"  • {s}")
    _print_video_line(vinfo, stats)
    return stats["registered"]


def _print_video_line(vinfo: dict, stats: dict, skip_reason: str = "") -> None:
    """[E] 영상 1줄 요약 로그"""
    title = (vinfo.get("title") or "")[:30]
    desc_len = len(vinfo.get("description") or "")
    src = vinfo.get("desc_source") or "none"
    note = f" ({skip_reason})" if skip_reason else ""
    detail = []
    if stats.get("no_search_result"):
        detail.append(f"검색무결과{stats['no_search_result']}")
    if stats.get("region_mismatch"):
        detail.append(f"지역불일치{stats['region_mismatch']}")
    if stats.get("name_mismatch"):
        detail.append(f"상호명불일치{stats['name_mismatch']}")
    if stats.get("category_rejected"):
        detail.append(f"카테고리거부{stats['category_rejected']}")
    if stats.get("duplicated"):
        detail.append(f"중복{stats['duplicated']}")
    if detail and not note:
        note = f" ({', '.join(detail)})"
    print(f"📹 {title} | 설명 {desc_len}자[{src}] | 후보 {stats.get('candidates_raw', 0)}개 | "
          f"게이트통과 {stats.get('candidates_gated', 0)}개 | 등록 {stats.get('registered', 0)}건{note}")


def run_youtube_vlog_mining(supabase_url: str, supabase_key: str, limit: int = 5,
                            dry_run: bool = False) -> int:
    """유튜브에서 최신 데이트/여행 브이로그 영상을 검색하여 자율 역방향 수집 수행.
    limit 은 '실제로 마이닝한 영상 수' 기준. 등록된 신규 스팟 총 개수를 반환."""
    print(f"🎬 [YouTube Vlog 자율 마이너] 최신 데이트/여행 롱폼 영상 탐색 시작...{' [DRY-RUN]' if dry_run else ''}")

    history = load_processed_history()
    history_set = set(history)
    print(f"  • 처리 이력: {len(history)}개 (파일: {os.path.basename(HISTORY_PATH)})")

    # 설명란 미달/쇼츠/해외 스킵 및 이력 중복을 감안해 넉넉한 풀을 확보 (키워드당 상위 20개까지 탐색)
    pool_target = max(limit * 6, limit + 20)
    per_kw_cap = max(3, -(-pool_target // len(SEARCH_KEYWORDS)))
    per_kw_scan = 20  # 검색 결과 상위 N개까지 훑어 이력에 없는 것을 고른다

    found_ids = []
    seen_in_history = 0
    for kw in SEARCH_KEYWORDS:
        if len(found_ids) >= pool_target:
            break
        encoded = urllib.parse.quote(kw)
        search_url = f"https://www.youtube.com/results?search_query={encoded}&sp=EgIIAw%253D%253D"
        req = urllib.request.Request(search_url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                html = res.read().decode('utf-8', errors='ignore')
                raw_ids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
                if not raw_ids:
                    print(f"  ⚠️ 검색 결과에서 영상 ID 미검출 ('{kw}', 응답 {len(html):,}자)")
                    continue
                # 중복 제거하며 상위 per_kw_scan 개까지 스캔
                scanned, added, skipped_hist = [], 0, 0
                for vid in raw_ids:
                    if vid in scanned:
                        continue
                    scanned.append(vid)
                    if len(scanned) > per_kw_scan:
                        break
                    if vid in history_set:
                        skipped_hist += 1
                        continue
                    if vid in found_ids:
                        continue
                    found_ids.append(vid)
                    added += 1
                    if added >= per_kw_cap or len(found_ids) >= pool_target:
                        break
                seen_in_history += skipped_hist
                print(f"  • '{kw}' 검색: 스캔 {len(scanned)}개 → 신규 {added}개 확보 (이력 스킵 {skipped_hist}개)")
        except Exception as e:
            print(f"  ⚠️ 유튜브 검색 실패 ('{kw}'): {e}")

    if not found_ids:
        print(f"  ⚠️ 발견된 신규 영상 0개 — 검색 실패/차단이거나 상위 결과가 모두 처리 이력에 있습니다. "
              f"(이력 스킵 누적 {seen_in_history}개)")
        return 0

    print(f"  • 후보 영상 풀: {len(found_ids)}개 (이력 스킵 {seen_in_history}개 / 마이닝 목표: {limit}개)\n")

    agg = {
        "searched": len(found_ids),
        "history_skipped": seen_in_history,
        "info_failed": 0,
        "no_desc_skipped": 0,
        "overseas_skipped": 0,
        "shorts_skipped": 0,
        "short_desc_skipped": 0,
        "mined": 0,
        "zero_candidate": 0,
        "category_rejected": 0,
        "region_mismatch": 0,
        "region_underivable": 0,
        "name_mismatch": 0,
        "no_search_result": 0,
        "duplicated": 0,
        "insert_failed": 0,
        "registered": 0,
    }
    all_spots = []
    newly_processed = []

    for video_id in found_ids:
        if agg["mined"] >= limit:
            break

        vurl = f"https://www.youtube.com/watch?v={video_id}"
        try:
            vinfo = get_youtube_video_info(video_id, verbose=True)
        except Exception as e:
            print(f"  ❌ 영상 정보 조회 실패 ({vurl}): {e}")
            agg["info_failed"] += 1
            continue

        if not vinfo:
            print(f"📹 (정보 조회 실패) | {vurl}")
            agg["info_failed"] += 1
            continue

        desc_len = len(vinfo["description"] or "")

        # [A] 쇼츠 스킵
        if is_shorts(vurl, vinfo["title"], vinfo["description"]):
            agg["shorts_skipped"] += 1
            newly_processed.append(video_id)
            _print_video_line(vinfo, _new_stats(), skip_reason="스킵: 쇼츠")
            continue

        # 해외 여행 영상 스킵 (국내 데이트 스팟 파이프라인 대상 아님)
        oversea_kw = is_overseas_video(vinfo["title"], vinfo["description"])
        if oversea_kw:
            agg["overseas_skipped"] += 1
            newly_processed.append(video_id)
            _print_video_line(vinfo, _new_stats(), skip_reason=f"스킵: 해외({oversea_kw})")
            continue

        # 설명란 확보 실패 → 제목 폴백 금지, 영상 스킵 (이력에는 남기지 않음: 다음에 재시도)
        if desc_len == 0:
            agg["no_desc_skipped"] += 1
            _print_video_line(vinfo, _new_stats(), skip_reason="스킵: 설명란 확보 실패(전 경로)")
            continue

        # [A] 설명란 길이 미달 스킵
        if desc_len < MIN_DESCRIPTION_LEN:
            agg["short_desc_skipped"] += 1
            newly_processed.append(video_id)
            _print_video_line(vinfo, _new_stats(), skip_reason=f"스킵: 설명란 {desc_len}자 < {MIN_DESCRIPTION_LEN}자")
            continue

        print(f"\n─── 🎬 {vinfo['title'][:50]} | {vinfo['author']} | 조회 {vinfo['views']:,} | "
              f"설명 {desc_len}자 [{vinfo.get('desc_source')}]")
        try:
            stats = mine_video_info(vinfo, supabase_url, supabase_key, dry_run=dry_run)
        except Exception as e:
            print(f"  ❌ 영상 마이닝 실패 ({vurl}): {e}")
            agg["info_failed"] += 1
            continue

        agg["mined"] += 1
        newly_processed.append(video_id)
        if stats["candidates_gated"] == 0:
            agg["zero_candidate"] += 1
        agg["category_rejected"] += stats["category_rejected"]
        agg["region_mismatch"] += stats["region_mismatch"]
        agg["region_underivable"] += stats["region_underivable"]
        agg["name_mismatch"] += stats["name_mismatch"]
        agg["no_search_result"] += stats["no_search_result"]
        agg["duplicated"] += stats["duplicated"]
        agg["insert_failed"] += stats["insert_failed"]
        agg["registered"] += stats["registered"]
        all_spots.extend(stats["spots"])

        _print_video_line(vinfo, stats)

    # 처리 이력 저장 (dry-run 은 이력을 오염시키지 않음)
    if newly_processed and not dry_run:
        save_processed_history(history + [v for v in newly_processed if v not in history_set])

    # [E] 사이클 집계
    print(f"\n📊 [YouTube Vlog 사이클 집계]{' (DRY-RUN — DB/이력 미변경)' if dry_run else ''}")
    print(f"  • 검색 영상: {agg['searched']}개 (풀) / 이력 중복 스킵 {agg['history_skipped']}개")
    print(f"  • 쇼츠 스킵: {agg['shorts_skipped']}개")
    print(f"  • 해외 영상 스킵: {agg['overseas_skipped']}개")
    print(f"  • 설명란 확보 실패 스킵: {agg['no_desc_skipped']}개")
    print(f"  • 설명란 미달 스킵: {agg['short_desc_skipped']}개")
    print(f"  • 정보 조회 실패: {agg['info_failed']}개")
    print(f"  • 실제 마이닝: {agg['mined']}개")
    print(f"  • 후보 0건 영상: {agg['zero_candidate']}개")
    print(f"  • 지도 검색 무결과: {agg['no_search_result']}건")
    print(f"  • 지역 불일치 탈락: {agg['region_mismatch']}건")
    print(f"  • 권역 도출 실패 탈락: {agg['region_underivable']}건")
    print(f"  • 상호명 불일치 탈락: {agg['name_mismatch']}건")
    print(f"  • 카테고리 거부: {agg['category_rejected']}건")
    print(f"  • 중복 스킵: {agg['duplicated']}건")
    if agg["insert_failed"]:
        print(f"  • DB 등록 실패: {agg['insert_failed']}건")
    print(f"  ✅ 최종 등록{' 예정' if dry_run else ''}: {agg['registered']}건")
    for s in all_spots:
        print(f"     - {s}")

    return agg["registered"]


if __name__ == "__main__":
    env = load_env()
    default_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    default_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")

    parser = argparse.ArgumentParser(description="YouTube Vlog & Travel Reverse Miner")
    parser.add_argument("--url", help="YouTube Video URL (e.g. https://www.youtube.com/watch?v=...)")
    parser.add_argument("--auto", action="store_true", help="Auto-discover and mine recent YouTube vlogs")
    parser.add_argument("--limit", type=int, default=3, help="Max videos to actually mine")
    parser.add_argument("--dry-run", action="store_true", dest="dry_run",
                        help="Run the full pipeline without any DB INSERT (logs only)")
    parser.add_argument("--supabase_url", default=default_url, help="Supabase Project URL")
    parser.add_argument("--supabase_key", default=default_key, help="Supabase Service Key")
    args = parser.parse_args()

    if args.url:
        mine_youtube_vlog(args.url, args.supabase_url, args.supabase_key, dry_run=args.dry_run)
    elif args.auto:
        run_youtube_vlog_mining(args.supabase_url, args.supabase_key, limit=args.limit, dry_run=args.dry_run)
    else:
        parser.print_help()
