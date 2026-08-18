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
from supabase_worker import search_naver, calculate_quality_score, load_env

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

# ─────────────────────────────────────────────────────────────
# [C] 카테고리 화이트/블랙리스트
# ─────────────────────────────────────────────────────────────

# 데이트 스팟다운 업종 (부분 문자열 매칭, 2자 이상 키워드만)
CATEGORY_WHITELIST = [
    # 카페 / 디저트
    "카페", "커피", "베이커리", "제과", "빵집", "디저트", "빙수", "브런치", "티하우스", "찻집",
    "아이스크림", "도넛", "케이크", "roastery", "cafe",
    # 음식점
    "음식점", "한식", "양식", "일식", "중식", "분식", "아시아음식", "뷔페", "레스토랑", "다이닝",
    "이탈리", "프랑스", "스테이크", "파스타", "피자", "햄버거", "치킨", "고기", "육류", "해물",
    "해산물", "국수", "면요리", "덮밥", "돈까스", "초밥", "스시", "쌈밥", "칼국수", "곱창",
    "닭갈비", "삼겹살", "샤브샤브", "오마카세", "퓨전", "베트남", "태국", "인도", "멕시코",
    # 주점 / 바
    "주점", "술집", "와인", "칵테일", "이자카야", "포차", "호프", "펍", "요리주점", "바(bar)",
    "위스키", "맥주", "전통주", "막걸리",
    # 문화 / 전시
    "전시", "미술관", "갤러리", "박물관", "문화", "공연", "극장", "영화관", "서점", "책방",
    "도서관", "아트", "기념관", "과학관",
    # 자연 / 관광
    "공원", "관광", "명소", "유원지", "테마파크", "놀이", "정원", "수목원", "식물원", "해수욕장",
    "해변", "해안", "계곡", "전망대", "야경", "전망", "산책로", "둘레길", "휴양림", "생태",
    "호수", "폭포", "동굴", "섬", "항구", "등대", "고궁", "궁궐", "한옥마을", "사찰", "유적",
    "성곽", "다리", "저수지", "습지",
    # 체험 / 액티비티
    "체험", "공방", "원데이", "클래스", "도예", "방탈출", "보드게임", "볼링", "당구", "실내",
    "아쿠아리움", "동물원", "목장", "농장", "수족관", "케이블카", "루지", "레저", "스포츠",
    "사진관", "스튜디오", "포토", "플라워", "꽃집", "소품", "편집샵", "복합문화",
    # 휴식 / 숙박
    "숙박", "호텔", "리조트", "펜션", "게스트하우스", "풀빌라", "글램핑", "캠핑", "한옥",
    "스파", "온천", "찜질", "사우나", "워터파크",
    # 시장 / 거리
    "시장", "먹자골목", "거리", "쇼핑몰", "백화점",
]

# 정확 일치로만 허용하는 1~2자 카테고리 토큰 (부분 매칭 시 오탐이 큰 것들)
CATEGORY_WHITELIST_EXACT = {"바", "회", "산", "절", "탕", "떡", "면", "빵", "술", "숲", "성"}

# 데이트 스팟이 아닌 업종 (카테고리 또는 상호명에 포함 시 즉시 탈락)
CATEGORY_BLACKLIST = [
    # 기존
    "주유소", "세차", "편의점", "세븐일레븐", "cu ", "gs25", "이마트24",
    "아파트", "단지", "오피스텔", "빌라", "주공",
    "의류", "zara", "h&m", "유니클로", "병원", "약국", "치과", "안과", "의원", "한의원",
    "은행", "atm", "관공서", "경찰서", "소방서", "주민센터", "행정복지",
    "웨딩", "결혼", "장례", "부동산", "공인중개",
    # 신규 — 언론/방송
    "신문", "일보", "언론", "방송", "통신사", "출판", "뉴스",
    # 신규 — 제조/공업/산업
    "제조", "공업", "산업", "기계", "플랜트", "설비", "부품", "금형", "철강", "화학", "펌프",
    "공장", "제작소",
    # 신규 — 우편
    "우체국", "우편",
    # 신규 — 자동차
    "자동차", "모터스", "motors", "정비", "카센터", "타이어", "중고차", "렌터카", "카센타",
    "오토", "매매단지",
    # 신규 — 개발/건설
    "관광개발", "개발", "건설", "엔지니어링", "토목", "시공", "인테리어", "설계사무소",
    # 신규 — 교육
    "학원", "교습", "과외", "학교", "유치원", "어린이집", "대학교", "직업훈련",
    # 신규 — 단체
    "협회", "재단", "조합", "공사", "공단", "센터본부", "지사", "사무소", "법인",
    # 신규 — 물류
    "물류", "창고", "택배", "운수", "화물", "운송",
]

# 상호명 자체가 명백히 비(非)스팟인 패턴
NAME_BLACKLIST_PATTERNS = [
    re.compile(r'일보$'), re.compile(r'신문(사)?$'), re.compile(r'방송(국)?$'),
    re.compile(r'산업(\s*\(주\))?$'), re.compile(r'공업'), re.compile(r'중공업'),
    re.compile(r'모터스'), re.compile(r'우편취급국'), re.compile(r'우체국'),
    re.compile(r'개발\s*\(주\)'), re.compile(r'관광개발'), re.compile(r'^주식회사'),
    re.compile(r'주식회사$'), re.compile(r'^\(주\)'), re.compile(r'\(주\)$'),
    re.compile(r'^유한회사'), re.compile(r'^\(유\)'), re.compile(r'대리점$'),
    re.compile(r'정비소$'), re.compile(r'(주민센터|행정복지센터)$'), re.compile(r'파출소$'),
]

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
    "면서", "려고", "지만", "다면", "다가", "든지", "든가", "니까", "처럼", "보다", "마다",
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


def _fetch_watch_html(video_id: str, verbose: bool = False) -> dict:
    """watch 페이지 HTML 스크래핑 경로. {description, views, title, status, length} 반환"""
    out = {"description": "", "views": 0, "title": "", "status": 0, "length": 0, "error": ""}
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

            t_match = re.search(r'\"title\":\{\"simpleText\":\"(.*?)\"\}', html)
            if t_match:
                out["title"] = _decode_short_description(t_match.group(1))
    except Exception as e:
        out["error"] = str(e)[:80]
    return out


def _fetch_innertube(video_id: str, client: dict, verbose: bool = False) -> dict:
    """InnerTube player API 폴백 경로. videoDetails 기반 메타데이터 반환"""
    out = {"description": "", "views": 0, "title": "", "author": "",
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
    out = {"description": "", "views": 0, "title": "", "status": 0, "length": 0, "error": ""}
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

    description, views, desc_source = "", 0, "none"

    # 2. watch 페이지 HTML 스크래핑 (동의 쿠키 포함)
    if not os.getenv("YT_FORCE_INNERTUBE"):
        w = _fetch_watch_html(video_id, verbose=verbose)
        if w["description"]:
            description, desc_source = w["description"], "watch_html"
            views = w["views"]
            diag.append(f"watchHTML:OK({w['length']:,}B, desc {len(description)}자, views {views:,})")
        else:
            diag.append(f"watchHTML:MISS(status={w['status']}, {w['length']:,}B"
                        f"{', ' + w['error'] if w['error'] else ''})")
            if w["views"]:
                views = w["views"]
    else:
        diag.append("watchHTML:SKIPPED(YT_FORCE_INNERTUBE)")

    # 3. InnerTube player API 폴백
    if not description:
        for client in INNERTUBE_CLIENTS:
            it = _fetch_innertube(video_id, client, verbose=verbose)
            if it["description"]:
                description, desc_source = it["description"], client["label"]
                views = it["views"] or views
                title = title or it["title"]
                author_name = author_name or it["author"]
                diag.append(f"{client['label']}:OK({it['length']:,}B, desc {len(description)}자, views {views:,})")
                break
            diag.append(f"{client['label']}:MISS(status={it['status']}, {it['length']:,}B"
                        f"{', ' + it['error'] if it['error'] else ''})")
            if it["views"] and not views:
                views = it["views"]
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
FOREIGN_SCRIPT_PATTERN = re.compile(r'[぀-ゟ゠-ヿ฀-๿]')


def is_overseas_video(title: str, description: str = "") -> str:
    """해외 여행 영상 여부 판별. 걸린 키워드를 반환(없으면 빈 문자열)"""
    blob = f"{title or ''} {(description or '')[:300]}".lower()
    for kw in OVERSEAS_KEYWORDS:
        if kw.lower() in blob:
            return kw
    if FOREIGN_SCRIPT_PATTERN.search(title or ""):
        return "외국어문자"
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


def extract_spot_candidates_verbose(title: str, description: str) -> dict:
    """후보 추출 + 게이트 통과 결과를 상세 반환.
    반환: {raw: int, passed: list[str], source: 'description'|'title'|'none', rejected: list[(원문, 사유)]}
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

    desc_raw = _collect_description_candidates(description or "")
    desc_passed, desc_rejected = _gate(desc_raw)
    if desc_passed:
        return {
            "raw": len(desc_raw),
            "passed": desc_passed,
            "source": "description",
            "rejected": desc_rejected,
        }

    # 설명란 후보가 하나도 없을 때만 제목 파싱 폴백 (게이트 통과분만 채택)
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
    """텍스트에서 지역 힌트를 뽑되 실제 행정구역 사전으로 검증"""
    text = text or ""
    # "서울근교", "부산 근교" 처럼 광역 지명이 '근교'와 붙으면 그 광역은 힌트가 아니다
    near_metros = set(re.findall(r'(서울|부산|대구|인천|광주|대전|울산|경기|수도권)\s*근교', text))
    hints = []
    for m in re.findall(r'(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]{2,5}(?:시|군|구))', text or ""):
        token = m.strip()
        if token in near_metros:
            continue
        if token in METRO_REGIONS or token in DISTRICT_NAMES:
            if token not in hints:
                hints.append(token)
    return hints


# ─────────────────────────────────────────────────────────────
# [C] 카테고리 검증
# ─────────────────────────────────────────────────────────────

def is_date_spot_category(category: str, name: str) -> tuple[bool, str]:
    """네이버/카카오 카테고리와 상호명이 데이트 스팟다운지 검증.
    (통과여부, 탈락사유) 반환. 애매하면 보수적으로 거부한다."""
    cat = (category or "").strip()
    cat_low = cat.lower()
    name_low = (name or "").lower()

    # 1. 상호명 자체가 명백한 비(非)스팟 패턴
    for pat in NAME_BLACKLIST_PATTERNS:
        if pat.search(name or ""):
            return False, "상호명패턴"

    # 2. 블랙리스트 (카테고리 또는 상호명)
    for bl in CATEGORY_BLACKLIST:
        if bl in cat_low or bl in name_low:
            return False, f"블랙리스트({bl.strip()})"

    if not cat:
        return False, "카테고리없음"

    # 3. 화이트리스트
    tokens = [t.strip() for t in re.split(r'[>,/·|]', cat) if t.strip()]
    for t in tokens:
        t_low = t.lower()
        if t in CATEGORY_WHITELIST_EXACT:
            return True, ""
        for wl in CATEGORY_WHITELIST:
            if wl in t_low:
                return True, ""

    # 4. 화이트리스트에도 블랙리스트에도 없는 애매한 카테고리 → 등록하지 않음
    return False, f"화이트리스트외({cat[:14]})"


def is_name_match(candidate: str, official_name: str) -> bool:
    """지도 검색 결과 상호명이 후보 키워드와 실제로 연관되는지 검증.
    (네이버/카카오가 무관한 업체를 반환하는 오등록 차단)"""
    cand = re.sub(r'\s+', '', candidate or "")
    name = re.sub(r'\s+', '', official_name or "")
    if not cand or not name:
        return False
    if cand in name or name in cand:
        return True
    # 어절 단위 부분 일치 (2자 이상 토큰이 상대 상호명에 포함되면 인정)
    for tok in (candidate or "").split():
        if len(tok) >= 2 and tok in name:
            return True
    return difflib.SequenceMatcher(None, cand, name).ratio() >= 0.55


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
        slot = "day"  # 카페, 전시, 스튜디오, 베이커리, 공원 등

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
    """주소 텍스트에서 7대 권역(서울/경기/인천/강원/충청/호남/영남/제주) 판별"""
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


# ─────────────────────────────────────────────────────────────
# 마이닝 본체
# ─────────────────────────────────────────────────────────────

def _new_stats() -> dict:
    return {
        "candidates_raw": 0,
        "candidates_gated": 0,
        "no_search_result": 0,
        "region_mismatch": 0,
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

    ext = extract_spot_candidates_verbose(vinfo["title"], vinfo["description"])
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

    # 지역 힌트 (행정구역 사전 검증 완료)
    region_hints = extract_region_hints(vinfo["title"])
    region_hint = " ".join(region_hints) if region_hints else ""
    if verbose and region_hints:
        print(f"  • 지역 힌트: {region_hints}")

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

        region = detect_region_from_address(road_addr)
        slot, moods = detect_slot_and_mood(category, f"{cand} {official_name}")

        # 군/구 단위 지역 추출
        gu_match = re.search(r'([가-힣]+(?:시|군|구))', road_addr)
        area_val = gu_match.group(1) if gu_match else None

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
                    "is_shorts": False
                }
            },
            # 조회수를 확보하지 못했으면(파싱 실패) 임의로 높은 점수를 주지 않고 기본값으로 둔다
            "hot_score": (85.0 if vinfo["views"] >= 50000 else 75.0) if vinfo.get("views") else 60.0,
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
        print(f"⏩ 설명란 확보 실패 — 제목 폴백으로 쓰레기를 만들지 않기 위해 스킵합니다.")
        _print_video_line(vinfo, _new_stats(), skip_reason="스킵: 설명란 확보 실패")
        return 0

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
