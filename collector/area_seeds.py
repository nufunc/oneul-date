#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 전국 전역/소외지역 동적 시드 & 갭 분석 모듈 (area_seeds.py)

1) 유명 핫플(성수/한남 등)뿐만 아니라 서울 25개 전 자치구(가산, 독산, 구로, 노원, 수유 등)
   및 수도권/전국 300+개 주요 생활권/전철역 그리드를 포괄합니다.
2) Supabase DB의 등록 스팟 수를 분석하여 데이터가 부족한 '소외 지역(Coverage Gap)'을
   자동 감지하고 최우선 탐색 쿼리로 승격시킵니다.
"""

import os
import random
import urllib.request
import urllib.parse
import json
from datetime import datetime

# ─────────────────────────────────────────────────────────────
# [1] 전국 권역별 포괄적 지리/생활권/역세권 시드 DB
# ─────────────────────────────────────────────────────────────

# 서울 25개 자치구 전체 (핫플 + 주거지 + 오피스 상권 전수)
SEOUL_DISTRICTS = {
    "금천구": {
        "region": "서울", "area": "금천구",
        "sub_areas": ["가산디지털단지", "가산동", "독산동", "시흥동", "금천구청", "마리오아울렛", "현대아울렛가산", "안양천"],
        "default_vibes": ["trendy", "gourmet"]
    },
    "구로구": {
        "region": "서울", "area": "구로구",
        "sub_areas": ["구로디지털단지", "신도림", "구로동", "개봉동", "오류동", "천왕", "디큐브시티", "항동철길", "푸른수목원"],
        "default_vibes": ["trendy", "healing"]
    },
    "영등포구": {
        "region": "서울", "area": "영등포구",
        "sub_areas": ["문래동창작촌", "여의도", "더현대서울", "당산", "영등포구청", "신길", "양평동", "여의도한강공원", "선유도공원"],
        "default_vibes": ["retro", "trendy", "view"]
    },
    "양천구": {
        "region": "서울", "area": "양천구",
        "sub_areas": ["목동", "오목교", "신정동", "파리공원", "안양천", "목동로데오"],
        "default_vibes": ["healing", "gourmet"]
    },
    "강서구": {
        "region": "서울", "area": "강서구",
        "sub_areas": ["마곡", "발산", "화곡", "가양", "서울식물원", "우장산", "방화동", "공항동"],
        "default_vibes": ["trendy", "healing", "gourmet"]
    },
    "관악구": {
        "region": "서울", "area": "관악구",
        "sub_areas": ["샤로수길", "서울대입구", "낙성대", "신림", "봉천동", "도림천", "관악산"],
        "default_vibes": ["trendy", "romantic"]
    },
    "동작구": {
        "region": "서울", "area": "동작구",
        "sub_areas": ["사당", "이수", "노량진", "상도동", "흑석동", "보라매공원", "중앙대"],
        "default_vibes": ["trendy", "retro", "gourmet"]
    },
    "서초구": {
        "region": "서울", "area": "서초구",
        "sub_areas": ["강남역", "양재천", "서초동", "교대", "방배동카페골목", "반포한강공원", "고속터미널", "예술의전당", "잠원한강공원"],
        "default_vibes": ["luxury", "romantic", "view"]
    },
    "강남구": {
        "region": "서울", "area": "강남구",
        "sub_areas": ["신사가로수길", "압구정로데오", "도산공원", "청담동", "강남역", "역삼", "선릉", "삼성동코엑스", "대치동", "논현"],
        "default_vibes": ["luxury", "trendy", "gourmet"]
    },
    "송파구": {
        "region": "서울", "area": "송파구",
        "sub_areas": ["잠실", "송리단길", "석촌호수", "방이동먹자골목", "문정동", "올림픽공원", "가락시장"],
        "default_vibes": ["romantic", "trendy", "view"]
    },
    "강동구": {
        "region": "서울", "area": "강동구",
        "sub_areas": ["천호", "강동구청", "길동", "암사동", "고덕", "명일동", "일자산", "강풀만화거리"],
        "default_vibes": ["healing", "gourmet"]
    },
    "마포구": {
        "region": "서울", "area": "마포구",
        "sub_areas": ["연남동", "연희동", "망원동망리단길", "홍대", "합정", "상수", "공덕", "대흥동", "상암동", "하늘공원"],
        "default_vibes": ["romantic", "trendy", "healing"]
    },
    "용산구": {
        "region": "서울", "area": "용산구",
        "sub_areas": ["한남동", "이태원", "해방촌", "경리단길", "용리단길", "삼각지", "용산역", "효창공원", "노들섬", "남산"],
        "default_vibes": ["romantic", "luxury", "view", "trendy"]
    },
    "성동구": {
        "region": "서울", "area": "성동구",
        "sub_areas": ["성수동", "서울숲", "뚝섬", "옥수동", "금호동", "왕십리", "마장동", "응봉산"],
        "default_vibes": ["trendy", "romantic", "view"]
    },
    "광진구": {
        "region": "서울", "area": "광진구",
        "sub_areas": ["건대입구", "구의동", "군자동", "아차산", "뚝섬유원지", "어린이대공원", "자양동"],
        "default_vibes": ["trendy", "active", "healing"]
    },
    "동대문구": {
        "region": "서울", "area": "동대문구",
        "sub_areas": ["회기", "경희대", "외대앞", "청량리", "장한평", "답십리", "제기동"],
        "default_vibes": ["retro", "gourmet"]
    },
    "중랑구": {
        "region": "서울", "area": "중랑구",
        "sub_areas": ["상봉", "면목동", "중화동", "망우동", "중랑천장미공원", "용마폭포공원"],
        "default_vibes": ["healing", "retro"]
    },
    "성북구": {
        "region": "서울", "area": "성북구",
        "sub_areas": ["성북동", "한성대입구", "안암고대앞", "길음", "정릉", "월곡", "북악스카이웨이"],
        "default_vibes": ["healing", "retro", "view"]
    },
    "강북구": {
        "region": "서울", "area": "강북구",
        "sub_areas": ["수유", "미아사거리", "미아동", "우이동카페거리", "북한산", "북서울꿈의숲"],
        "default_vibes": ["healing", "view", "retro"]
    },
    "도봉구": {
        "region": "서울", "area": "도봉구",
        "sub_areas": ["쌍문동", "창동", "방학동", "도봉산", "도봉동", "서울창포원"],
        "default_vibes": ["healing", "retro"]
    },
    "노원구": {
        "region": "서울", "area": "노원구",
        "sub_areas": ["노원역", "공릉동공리단길", "화랑대철도공원", "중계동", "하계동", "상계동", "수락산"],
        "default_vibes": ["trendy", "healing", "retro"]
    },
    "은평구": {
        "region": "서울", "area": "은평구",
        "sub_areas": ["연신내", "불광", "응암", "은평한옥마을", "진관동", "녹번", "구파발", "북한산제빵소"],
        "default_vibes": ["healing", "retro", "view"]
    },
    "서대문구": {
        "region": "서울", "area": "서대문구",
        "sub_areas": ["신촌", "이대", "연희동", "홍제동", "남가좌동", "안산자락길", "홍제유연"],
        "default_vibes": ["romantic", "retro", "healing"]
    },
    "종로구": {
        "region": "서울", "area": "종로구",
        "sub_areas": ["서촌", "북촌", "삼청동", "익선동", "혜화대학로", "광화문", "종로3가", "부암동", "낙산공원", "동묘"],
        "default_vibes": ["healing", "retro", "romantic"]
    },
    "중구": {
        "region": "서울", "area": "중구",
        "sub_areas": ["을지로힙지로", "명동", "충무로", "신당동", "약수동", "동대문DDP", "남산골한옥마을", "정동길"],
        "default_vibes": ["retro", "trendy", "romantic"]
    }
}

# 경기/인천 주요 생활권/시군구
GYEONGGI_INCHEON_AREAS = [
    {"region": "경기", "area": "성남시", "sub_areas": ["판교", "백현동카페거리", "정자동카페거리", "분당야탑", "서현", "모란", "율동공원"], "default_vibes": ["trendy", "romantic"]},
    {"region": "경기", "area": "수원시", "sub_areas": ["수원행궁동", "광교앨리웨이", "광교호수공원", "인계동", "영통", "수원역", "화서역스타필드"], "default_vibes": ["romantic", "view"]},
    {"region": "경기", "area": "화성시", "sub_areas": ["동탄호수공원", "동탄센트럴파크", "동탄영천동", "제부도", "궁평항", "남양"], "default_vibes": ["view", "healing"]},
    {"region": "경기", "area": "고양시", "sub_areas": ["일산밤리단길", "일산호수공원", "라페스타", "웨스턴돔", "화정", "행주산성", "원흥삼송"], "default_vibes": ["romantic", "healing"]},
    {"region": "경기", "area": "부천시", "sub_areas": ["부천역", "신중동역", "상동호수공원", "부천옥길", "까치울카페거리"], "default_vibes": ["trendy", "gourmet"]},
    {"region": "경기", "area": "안양시", "sub_areas": ["평촌범계", "안양일번가", "동편마을카페거리", "삼막사", "안양예술공원"], "default_vibes": ["trendy", "healing"]},
    {"region": "경기", "area": "용인시", "sub_areas": ["보정동카페거리", "수지구청", "광교산", "고기리계곡카페", "에버랜드근처", "기흥호수공원"], "default_vibes": ["healing", "romantic"]},
    {"region": "경기", "area": "광명시", "sub_areas": ["철산역", "광명사거리", "광명동굴", "KTX광명역아브뉴프랑", "소하동"], "default_vibes": ["trendy", "active"]},
    {"region": "경기", "area": "시흥시", "sub_areas": ["배곧신도시생명공원", "오이도빨강등대", "은계호수공원", "물왕호수", "월곶"], "default_vibes": ["view", "romantic"]},
    {"region": "경기", "area": "김포시", "sub_areas": ["김포라베니체", "구래동", "장기동", "김포한강중앙공원", "대명항", "문수산"], "default_vibes": ["view", "romantic"]},
    {"region": "경기", "area": "파주시", "sub_areas": ["헤이리예술마을", "출판단지", "운정호수공원", "마장호수출렁다리", "야당역"], "default_vibes": ["healing", "view"]},
    {"region": "경기", "area": "하남시", "sub_areas": ["미사경정공원", "미사호수공원", "하남스타필드", "검단산"], "default_vibes": ["view", "romantic"]},
    {"region": "경기", "area": "남양주시", "sub_areas": ["팔당북한강뷰", "다산신도시", "별내카페거리", "물의정원", "화도"], "default_vibes": ["view", "healing"]},
    {"region": "경기", "area": "의정부시", "sub_areas": ["의정부역로데오", "민락2지구", "망월사역", "중랑천"], "default_vibes": ["gourmet", "trendy"]},
    {"region": "경기", "area": "평택시", "sub_areas": ["평택역", "고덕국제신도시", "소사벌카페거리", "평택호관광단지"], "default_vibes": ["trendy", "view"]},
    {"region": "경기", "area": "가평/양평", "sub_areas": ["가평청평북한강", "자라섬", "양평두물머리", "용문산", "서종면문호리"], "default_vibes": ["view", "healing"]},
    {"region": "인천", "area": "연수구", "sub_areas": ["송도센트럴파크", "트리플스트리트", "송도커낼워크", "청량산", "동춘동"], "default_vibes": ["view", "luxury"]},
    {"region": "인천", "area": "중구/영종", "sub_areas": ["영종도구읍뱃터", "을왕리해수욕장", "인천개항장거리", "차이나타운", "월미도", "신포동"], "default_vibes": ["view", "retro", "romantic"]},
    {"region": "인천", "area": "부평/남동", "sub_areas": ["부평평리단길", "구월동로데오", "소래포구", "인천대공원"], "default_vibes": ["trendy", "romantic"]}
]

# 지방 광역시 및 전국 주요 여행/생활권 (강원, 영남, 호남, 충청, 제주 전역)
OTHER_REGIONAL_AREAS = [
    # 강원
    {"region": "강원", "area": "강릉시", "sub_areas": ["강릉안목해변카페거리", "경포호수", "초당순두부마을", "교동택지", "주문진영진해변", "유천지구"], "default_vibes": ["view", "romantic", "gourmet"]},
    {"region": "강원", "area": "속초시", "sub_areas": ["속초영랑호", "청초호수공원", "칠성조선소", "속초해변대관람차", "동명항", "설악동"], "default_vibes": ["view", "healing", "retro"]},
    {"region": "강원", "area": "춘천시", "sub_areas": ["춘천구봉산전망대", "의암호스카이워크", "공지천조각공원", "효자동낭만골목", "소양강댐"], "default_vibes": ["view", "healing", "romantic"]},
    {"region": "강원", "area": "양양/고성", "sub_areas": ["양양서피비치", "인구해변", "하조대전망대", "고성아야진해변", "봉포해변", "송지호"], "default_vibes": ["trendy", "active", "view"]},
    {"region": "강원", "area": "원주/평창", "sub_areas": ["원주뮤지엄산", "출렁다리", "평창대관령양떼목장", "월정사전나무숲길"], "default_vibes": ["healing", "view", "luxury"]},

    # 영남 (부산/대구/울산/경북/경남)
    {"region": "영남", "area": "부산", "sub_areas": ["해운대달맞이길", "광안리민락수변공원", "전포동카페거리", "영도흰여울문화마을", "기장오시리아", "송도암남공원", "온천천카페거리", "남포동자갈치"], "default_vibes": ["view", "romantic", "trendy", "luxury"]},
    {"region": "영남", "area": "대구", "sub_areas": ["동성로교동", "앞산카페거리", "수성못유원지", "김광석다시그리기길", "봉산문화거리", "삼덕동감성골목", "팔공산카페거리"], "default_vibes": ["retro", "romantic", "view", "trendy"]},
    {"region": "영남", "area": "경주/포항", "sub_areas": ["경주황리단길", "보문관광단지", "교촌한옥마을", "포항스페이스워크", "영일대해수욕장", "구룡포일본인가옥거리", "호미곶"], "default_vibes": ["retro", "view", "romantic", "healing"]},
    {"region": "영남", "area": "울산/경남", "sub_areas": ["울산태화강국가정원", "일산지대왕암공원", "간절곶", "통영동피랑벽화마을", "거제바람의언덕", "남해독일마을", "남해다랭이마을", "진주성촉석루"], "default_vibes": ["view", "healing", "romantic"]},
    {"region": "영남", "area": "안동/문경", "sub_areas": ["안동월영교야경", "안동하회마을", "문경새재도립공원", "문경에코랄라"], "default_vibes": ["retro", "healing", "view"]},

    # 호남 (광주/전남/전북)
    {"region": "호남", "area": "전주/군산/익산", "sub_areas": ["전주한옥마을", "전주객리단길", "전주웨리단길", "덕진공원연화정", "군산월명동근대골목", "은파호수공원", "익산미륵사지", "익산아가페정원"], "default_vibes": ["retro", "romantic", "healing", "view"]},
    {"region": "호남", "area": "여수/순천/담양", "sub_areas": ["여수돌산밤바다", "이순신광장낭만포차", "웅천친수공원", "고소동천사벽화마을", "순천만국가정원", "와온해변노을", "담양죽녹원", "관방제림", "메타프로방스"], "default_vibes": ["romantic", "view", "healing"]},
    {"region": "호남", "area": "광주/목포", "sub_areas": ["광주동명동카페거리", "양림동펭귄마을", "첨단시리단길보이저", "무등산전망대", "목포평화광장바다분수", "목포해상케이블카", "근대역사관"], "default_vibes": ["trendy", "retro", "view", "romantic"]},
    {"region": "호남", "area": "보성/구례/화순", "sub_areas": ["보성대한다원녹차밭", "구례산수유마을", "섬진강대나무숲길", "화순적벽", "남산공원"], "default_vibes": ["healing", "view"]},

    # 충청 (대전/세종/충남/충북)
    {"region": "충청", "area": "대전/세종", "sub_areas": ["대전소제동관사촌", "갈마동갈리단길", "유성봉명동온천", "대청호오백리길", "세종금강보행교이응다리", "세종국립수목원", "세종호수공원"], "default_vibes": ["retro", "trendy", "view", "healing"]},
    {"region": "충청", "area": "천안/공주/부여/보령", "sub_areas": ["천안불당동카페거리", "신부동문화거리", "성성호수공원", "공주제민천원도심", "공산성야경", "부여궁남지포룡정", "보령대천해수욕장", "태안안면도꽃지해변", "파도리해식동굴"], "default_vibes": ["trendy", "retro", "view", "romantic"]},
    {"region": "충청", "area": "청주/단양/제천", "sub_areas": ["청주수암골전망대", "율량동감성술집", "문의문화재단지", "단양남한강패러글라이딩", "만천하스카이워크", "제천청풍호케이블카", "의림지수변공원"], "default_vibes": ["view", "active", "healing", "romantic"]},

    # 제주
    {"region": "제주", "area": "제주/서귀포", "sub_areas": ["애월한담해변산책로", "한림협재금능해변", "구좌세화월정리", "조천함덕서우봉", "성산일출봉광치기", "서귀포중문관광단지", "안덕사계해변산방산", "표선해수욕장", "쇠소깍"], "default_vibes": ["view", "healing", "romantic", "luxury"]}
]

# ─────────────────────────────────────────────────────────────
# [2] 데이트 의도(Intent) 템플릿 키워드 조합 (낮/저녁/밤 3스팟 슬롯 밸런싱)
# ─────────────────────────────────────────────────────────────

SLOT_INTENT_TEMPLATES = {
    "day": [
        ("스페셜티 로스터리 핸드드립 카페", ["trendy", "gourmet", "healing"]),
        ("숲속 대형 베이커리 정원 카페", ["healing", "view", "gourmet"]),
        ("오션뷰 테라스 루프탑 베이커리", ["view", "romantic", "healing"]),
        ("한옥 감성 티하우스 전통 찻집", ["healing", "retro", "romantic"]),
        ("호수뷰 리버뷰 브런치 카페", ["view", "healing", "romantic"]),
        ("복합문화공간 갤러리 전시 카페", ["trendy", "healing", "retro"]),
        ("이색 데이트 감성 공방 원데이클래스", ["trendy", "active"]),
        ("수목원 산책로 근처 힐링 카페", ["healing", "view"]),
        ("루지 케이블카 짚라인 액티비티 체험", ["active", "view"]),
        ("드로잉카페 미술체험 베이킹 쿠킹 클래스", ["healing", "trendy"]),
        ("아쿠아리움 동물원 수족관 이색 데이트", ["romantic", "healing"]),
        ("한국관광 100선 뷰 맛집 카페", ["view", "healing", "romantic"]),
    ],
    "evening": [
        ("소개팅 분위기 좋은 감성 레스토랑", ["romantic", "gourmet"]),
        ("기념일 코스요리 파인다이닝 와인바", ["romantic", "luxury", "gourmet"]),
        ("분위기 좋은 테라스 스테이크 하우스", ["romantic", "view", "gourmet"]),
        ("블루리본 서베이 2026 추천 맛집", ["romantic", "gourmet", "luxury"]),
        ("미쉐린 가이드 빕구르망 다이닝", ["luxury", "gourmet", "romantic"]),
        ("바다 앞 테라스 감성 비스트로", ["view", "romantic", "trendy"]),
        ("숨은 골목 로컬 찐맛집 데이트", ["gourmet", "retro"]),
        ("화덕피자 파스타 감성 이탈리안", ["romantic", "gourmet"]),
        ("정갈한 솥밥 한정식 미식 데이트", ["healing", "gourmet"]),
        ("백년가게 전통 로컬 맛집", ["retro", "gourmet", "healing"]),
    ],
    "night": [
        ("조용한 감성 내추럴와인 칵테일바", ["romantic", "trendy"]),
        ("오션뷰 노을 뷰 감성 다이닝 펍", ["view", "romantic", "trendy"]),
        ("야경 드라이브 코스 뷰 맛집 펍", ["view", "romantic"]),
        ("분위기 좋은 심야 이자카야 술집", ["romantic", "trendy", "retro"]),
        ("루프탑 야경 와인바 라운지", ["luxury", "view", "romantic"]),
        ("골목 숨은 LP바 감성 펍", ["retro", "trendy"]),
        ("낭만 포차 야시장 먹거리 데이트", ["retro", "romantic"]),
        ("야경 뷰 테라스 바 칵테일", ["view", "romantic", "luxury"]),
    ]
}

# 기존 호환성 전체 풀
INTENT_TEMPLATES = (
    SLOT_INTENT_TEMPLATES["day"] + 
    SLOT_INTENT_TEMPLATES["evening"] + 
    SLOT_INTENT_TEMPLATES["night"]
)

# ─────────────────────────────────────────────────────────────
# [3] DB 커버리지 갭 분석 (Coverage Gap Detector)
# ─────────────────────────────────────────────────────────────

def get_coverage_gap_areas(supabase_url: str, supabase_service_key: str, limit: int = 12) -> list[dict]:
    """
    Supabase DB의 spots 테이블을 쿼리하여
    전국 8개 권역(서울/경기/인천/강원/충청/영남/호남/제주) 중 등록된 스팟 수가 가장 적은 소외 지역(Cold Area)을 추출합니다.
    """
    all_areas_pool = list(SEOUL_DISTRICTS.values()) + GYEONGGI_INCHEON_AREAS + OTHER_REGIONAL_AREAS

    if not supabase_url or not supabase_service_key:
        return random.sample(all_areas_pool, min(limit, len(all_areas_pool)))

    counts = {f"{item['region']}_{item['area']}": 0 for item in all_areas_pool}

    # 전체 활성 스팟의 region, area 조회
    url = f"{supabase_url.rstrip('/')}/rest/v1/spots?select=region,area,address&is_closed=eq.false&limit=5000"
    headers = {
        "apikey": supabase_service_key,
        "Authorization": f"Bearer {supabase_service_key}",
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                rows = json.loads(res.read().decode('utf-8'))
                for r in rows:
                    reg = r.get("region") or ""
                    area = r.get("area") or ""
                    addr = r.get("address") or ""
                    for item in all_areas_pool:
                        i_reg = item["region"]
                        i_area = item["area"]
                        key = f"{i_reg}_{i_area}"
                        if i_reg == reg and (i_area in area or i_area in addr or any(sub in addr for sub in item.get("sub_areas", []))):
                            counts[key] = counts.get(key, 0) + 1
                            break
    except Exception:
        pass

    # 등록 수가 적은 순서대로 정렬
    sorted_items = sorted(counts.items(), key=lambda x: x[1])
    
    result = []
    seen_keys = set()
    for key_id, count in sorted_items:
        for item in all_areas_pool:
            if f"{item['region']}_{item['area']}" == key_id and key_id not in seen_keys:
                seen_keys.add(key_id)
                res_item = dict(item)
                res_item["current_count"] = count
                result.append(res_item)
                break
        if len(result) >= limit:
            break

    return result

# ─────────────────────────────────────────────────────────────
# [4] 동적 쿼리 생성기 (Dynamic Query Generator)
# ─────────────────────────────────────────────────────────────

def _pick_balanced_intent() -> tuple[str, list[str]]:
    """낮(40%), 저녁(35%), 밤(25%) 균형 슬롯 템플릿 선택"""
    r = random.random()
    if r < 0.40:
        return random.choice(SLOT_INTENT_TEMPLATES["day"])
    elif r < 0.75:
        return random.choice(SLOT_INTENT_TEMPLATES["evening"])
    else:
        return random.choice(SLOT_INTENT_TEMPLATES["night"])

def generate_dynamic_queries(
    target_region: str = None,
    count: int = 30,
    gap_districts: list[dict] = None
) -> list[tuple[str, str, str, list[str]]]:
    """
    (검색어, region, area, vibes) 튜플 리스트를 동적으로 합성 생성합니다.
    - gap_districts가 주어지면 해당 소외 지역(예: 금천구 가산, 구로 등)에 가중치를 두어 쿼리를 생성합니다.
    - 낮/저녁/밤 3스팟 풀코스 완성을 위해 슬롯 밸런싱(4:3.5:2.5)을 자동 적용합니다.
    """
    queries = []
    
    # 1. 갭 지역(소외 지역) 쿼리 50% 할당
    if gap_districts:
        gap_target_count = min(count // 2, len(gap_districts) * 3)
        for _ in range(gap_target_count):
            district_info = random.choice(gap_districts)
            reg = district_info["region"]
            area = district_info["area"]
            sub = random.choice(district_info["sub_areas"])
            intent_phrase, intent_vibes = _pick_balanced_intent()
            
            query = f"{reg} {sub} {intent_phrase}"
            combined_vibes = list(set(district_info.get("default_vibes", []) + intent_vibes))[:3]
            queries.append((query, reg, area, combined_vibes))

    # 2. 나머지 슬롯은 전국/수도권 골고루 순회
    all_sources = []
    if target_region == "서울" or target_region is None:
        all_sources.extend(list(SEOUL_DISTRICTS.values()))
    if target_region in ["경기", "인천"] or target_region is None:
        all_sources.extend(GYEONGGI_INCHEON_AREAS)
    if target_region not in ["서울", "경기", "인천"] or target_region is None:
        all_sources.extend(OTHER_REGIONAL_AREAS)

    while len(queries) < count:
        source = random.choice(all_sources)
        reg = source["region"]
        area = source["area"]
        sub = random.choice(source["sub_areas"])
        intent_phrase, intent_vibes = _pick_balanced_intent()
        
        query = f"{reg} {sub} {intent_phrase}"
        combined_vibes = list(set(source.get("default_vibes", []) + intent_vibes))[:3]
        queries.append((query, reg, area, combined_vibes))

    random.shuffle(queries)
    return queries

if __name__ == "__main__":
    print("🧪 [Area Seeds & Dynamic Query Test]")
    sample_gaps = [SEOUL_DISTRICTS["금천구"], SEOUL_DISTRICTS["구로구"], SEOUL_DISTRICTS["도봉구"]]
    dynamic_qs = generate_dynamic_queries(count=6, gap_districts=sample_gaps)
    for idx, (q, reg, area, vibes) in enumerate(dynamic_qs, 1):
        print(f"{idx:02d}. [{reg} | {area}] '{q}' -> vibes: {vibes}")
