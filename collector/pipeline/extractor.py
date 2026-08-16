import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger("oneul.extractor")

# ---------------------------------------------------------------------------
# Slot 휴리스틱 규칙
# ---------------------------------------------------------------------------
SLOT_PATTERNS = [
    ("stay", [
        r"독채", r"풀\s*빌라", r"펜션", r"스테이(?!크)",
        r"료칸", r"글램핑", r"카라반", r"차박", r"호텔", r"리조트",
        r"숙소", r"숙박", r"민박", r"호스텔", r"게스트하우스",
        r"트리\s*하우스", r"오두막", r"샬레", r"통나무집",
        r"pool\s*villa", r"\bstay\b", r"\bhotel\b", r"\bresort\b",
        r"glamping", r"treehouse", r"\bcabin\b", r"chalet", r"pension",
        r"\bryokan\b", r"한옥\s*(스테이|숙소)?체험", r"호캉스",
    ]),
    ("night", [
        r"(와인|칵테일|루프탑|재즈|몰트|위스키|하이볼|스탠딩|스피크이지|시크릿)\s*바(?!다)",
        r"루프탑\s*(바|라운지|펍)", r"\bbar\b", r"\bpub\b", r"펍\b",
        r"야경", r"스피크이지", r"speakeasy", r"심야", r"포차",
        r"이자카야", r"위스키", r"칵테일", r"재즈", r"나이트",
        r"믹솔로지", r"바텐더", r"라운지\s*바", r"청음바", r"북바",
    ]),
    ("evening", [
        r"다이닝", r"오마카세", r"맛집", r"식당", r"레스토랑", r"노포",
        r"미식", r"셰프", r"코스\s*요리", r"스시", r"초밥", r"한정식",
        r"고깃집", r"브루어리", r"스테이크", r"비스트로", r"파인\s*다이닝",
        r"dining", r"gourmet", r"omakase", r"\bsushi\b", r"restaurant",
        r"\bbbq\b", r"화로구이", r"솥밥", r"장어", r"야키토리", r"쿠시카츠",
    ]),
    ("day", [
        r"카페", r"전시", r"미술관", r"박물관", r"갤러리", r"산책", r"온실",
        r"서점", r"베이커리", r"브런치", r"액티비티", r"카약", r"요트",
        r"수목원", r"정원", r"테마파크", r"스파", r"피크닉", r"드라이브",
        r"공방", r"원데이\s*클래스", r"승마", r"트레킹", r"티룸", r"쇼룸",
        r"\bcafe\b", r"gallery", r"bakery", r"brunch", r"museum", r"\bspa\b",
    ]),
]

SLOT_COMPILED = [
    (slot, [re.compile(p, re.IGNORECASE) for p in pats])
    for slot, pats in SLOT_PATTERNS
]

def detect_slot(text: str) -> str:
    for slot, pats in SLOT_COMPILED:
        for p in pats:
            if p.search(text):
                return slot
    return "day" # 기본값

# ---------------------------------------------------------------------------
# Mood 휴리스틱 규칙
# ---------------------------------------------------------------------------
MOOD_PATTERNS = {
    "romantic": [r"로맨틱", r"데이트", r"일몰", r"선셋", r"sunset", r"와인", r"기념일", r"감성", r"프러포즈", r"커플"],
    "healing": [r"힐링", r"자연", r"숲", r"쉼", r"조용", r"피톤치드", r"명상", r"웰니스", r"wellness"],
    "luxury": [r"럭셔리", r"하이엔드", r"프리미엄", r"5성", r"스위트", r"인피니티", r"호캉스", r"\bvip\b"],
    "gourmet": [r"미식", r"오마카세", r"다이닝", r"맛집", r"노포", r"셰프", r"파인다이닝", r"야키토리", r"솥밥"],
    "active": [r"카약", r"요트", r"서핑", r"원데이\s*클래스", r"공방", r"도자기", r"체험", r"액티비티", r"승마"],
    "view": [r"오션\s*뷰", r"리버\s*뷰", r"시티\s*뷰", r"뷰\s*맛집", r"파노라마", r"전망", r"야경", r"루프탑", r"통창"],
    "retro": [r"한옥", r"고택", r"노포", r"레트로", r"빈티지", r"전통", r"다도", r"사찰", r"골목"],
    "trendy": [r"핫플", r"인스타", r"미디어\s*아트", r"팝업", r"신상", r"오픈런", r"웨이팅", r"바이럴", r"힙한"],
}

MOOD_COMPILED = {
    mood: [re.compile(p, re.IGNORECASE) for p in pats]
    for mood, pats in MOOD_PATTERNS.items()
}

def detect_moods(text: str) -> List[str]:
    matched = []
    for mood, pats in MOOD_COMPILED.items():
        if any(p.search(text) for p in pats):
            matched.append(mood)
    if not matched:
        matched.append("romantic")
    return matched[:3]

# ---------------------------------------------------------------------------
# 행정구역(area/region) 추출
# ---------------------------------------------------------------------------
REGION_KEYWORDS = {
    "서울": ["서울", "강남", "강동", "강북", "강서", "관악", "광진", "구로", "금천", "노원", "도봉", "동대문", "동작", "마포", "서대문", "서초", "성동", "성북", "송파", "양천", "영등포", "용산", "은평", "종로", "중구", "중랑", "성수", "한남", "홍대", "을지로", "익선", "연남", "삼청", "압구정", "신사", "청담", "문래"],
    "경기": ["경기", "가평", "고양", "과천", "광명", "광주", "구리", "군포", "김포", "남양주", "동두천", "부천", "성남", "분당", "판교", "수원", "시흥", "안산", "안성", "안양", "양주", "양평", "여주", "연천", "오산", "용인", "의왕", "의정부", "이천", "파주", "평택", "포천", "하남", "화성"],
    "인천": ["인천", "강화", "계양", "미추홀", "남동", "동구", "부평", "서구", "연수", "송도", "영종", "중구", "옹진", "을왕리"],
    "강원": ["강원", "강릉", "고성", "동해", "삼척", "속초", "양구", "양양", "영월", "원주", "인제", "정선", "철원", "춘천", "태백", "평창", "홍천", "화천", "횡성"],
    "충청": ["충청", "충북", "충남", "대전", "세종", "청주", "충주", "제천", "천안", "공주", "보령", "아산", "서산", "논산", "당진", "부여", "서천", "청양", "홍성", "예산", "태안"],
    "영남": ["영남", "경북", "경남", "부산", "대구", "울산", "포항", "경주", "김천", "안동", "구미", "영주", "영천", "상주", "문경", "경산", "창원", "진주", "통영", "사천", "김해", "밀양", "거제", "양산"],
    "호남": ["호남", "전북", "전남", "광주", "전주", "군산", "익산", "정읍", "남원", "김제", "목포", "여수", "순천", "나주", "광양", "담양", "곡성", "구례", "보성", "화순", "장흥", "강진", "해남", "영암", "무안", "함평", "영광", "장성", "완도", "진도", "신안"],
    "제주": ["제주", "서귀포", "애월", "한림", "성산", "구좌", "조천", "한경", "대정", "안덕", "표선", "남원"],
}

def extract_region_and_area(text: str) -> tuple[str, Optional[str]]:
    # 시/군/구 추출
    area_match = re.search(r'([가-힣]+(?:구|시|군))\b', text)
    area = area_match.group(1) if area_match else None
    
    # 광역 권역 추출
    for reg, kws in REGION_KEYWORDS.items():
        if any(kw in text for kw in kws):
            return reg, area
            
    return "서울", area

# ---------------------------------------------------------------------------
# 상호명 정제
# ---------------------------------------------------------------------------
def clean_spot_name(header_line: str) -> str:
    name = header_line.strip()
    name = re.sub(r'^[#\s\-\*\d\.]+', '', name).strip()
    name = re.sub(r'^\[[^\]]+\]\s*', '', name).strip()
    name = name.replace("'", "").replace('"', '').replace('‘', '').replace('’', '').replace('“', '').replace('”', '')
    name = re.sub(r'^(?:[가-힣]{2,4}[동|읍|면|리|로|길])\s+', '', name).strip()
    name = re.sub(r'^(조선팰리스|파크\s*하얏트|그랜드\s*하얏트|페어몬트|시그니엘|안다즈)\s+서울(?:\s+[가-힣]+)?\s*[-–]\s*', r'\1 ', name).strip()
    name = re.sub(r'\s*\([A-Za-z0-9\s/&·\-\–,\.\'\"]+\)', '', name)
    name = re.sub(r'\s*\([가-힣\s/]+[동|구|시|군|역]\)', '', name)
    name = re.sub(r'\s*\([가-힣\s/]+(?:판교|분당|성수|한남|강남|홍대|서촌|북촌|을지로|해운대|송도|제주)[^)]*\)', '', name)
    name = re.sub(r'\s*\(Part\s*\d+\)', '', name, flags=re.IGNORECASE)
    
    brand_map = {
        "Aquafield": "아쿠아필드",
        "Termeden": "테르메덴",
        "Simmons Terrace": "시몬스테라스",
        "Jungsik": "정식당",
        "Eatanic Garden": "이타닉 가든",
    }
    for eng, kor in brand_map.items():
        if name.startswith(eng):
            name = name.replace(eng, kor)
            break

    name = re.sub(r'\s{2,}', ' ', name).strip()
    return name

# ---------------------------------------------------------------------------
# 100% 로컬 규칙 기반 메타데이터 추출기 (Gemini API 키 불필요)
# ---------------------------------------------------------------------------
def extract_spot_info_heuristic(raw_text: str) -> Optional[Dict[str, Any]]:
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    if not lines:
        return None

    # 1. 상호명 후보 추출 (첫 줄 또는 '1. 상호명', '### 상호명' 등)
    first_line = lines[0]
    first_line = re.sub(r'^제목:\s*', '', first_line)
    
    # 텍스트 내에서 특정 상호명 패턴 탐색
    name_candidate = first_line
    for l in lines:
        if l.startswith("### ") or l.startswith("## ") or re.match(r'^\d+\.\s+', l):
            name_candidate = l
            break

    clean_name = clean_spot_name(name_candidate)
    # 제목형 수식어(예: "성수동 데이트 코스 BEST 5")는 장소명이 아니므로 1차 분리
    if any(stop in clean_name for stop in ["BEST", "모음", "추천", "브이로그", "총정리", "데이트 코스", "가볼만한곳"]):
        # 텍스트 내부에서 따옴표나 작은 헤딩으로 된 장소명 탐색
        sub_names = re.findall(r'[\'\"「]([가-힣A-Za-z0-9\s]{2,20})[\'\"」]', raw_text)
        if sub_names:
            clean_name = clean_spot_name(sub_names[0])
        else:
            return None

    if len(clean_name) < 2 or len(clean_name) > 35:
        return None

    full_text = f"{clean_name} {raw_text}"
    slot = detect_slot(full_text)
    mood = detect_moods(full_text)
    region, area = extract_region_and_area(full_text)
    
    # 위치 문자열 정제
    location = f"{region} {area}" if area else region
    
    # 1줄 매거진 추천 요약 생성 (첫 2문장 또는 80자 이내)
    summary = lines[1] if len(lines) > 1 else clean_name
    summary = re.sub(r'^(설명|특징|내용):\s*', '', summary)
    summary = summary[:100].strip()

    return {
        "name": clean_name,
        "slot": slot,
        "region": region,
        "area": area,
        "mood": mood,
        "location": location,
        "price": None,
        "summary": summary if summary else f"{region} {clean_name}",
    }

def extract_spot_info(raw_text: str, api_key: str = "") -> Optional[Dict[str, Any]]:
    """Gemini API 키가 있으면 LLM 사용, 없으면 100% 로컬 휴리스틱 파서 동작"""
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            prompt = f"다음 텍스트에서 데이트 장소 JSON(name, slot, region, area, mood, location, price, summary)을 추출해줘:\n{raw_text}"
            res = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
            text = res.text.strip().replace("```json", "").replace("```", "")
            data = json.loads(text)
            if "name" in data:
                data["name"] = clean_spot_name(data["name"])
                return data
        except Exception:
            pass

    # API 키가 없거나 실패 시 100% 로컬 규칙 파서 실행
    return extract_spot_info_heuristic(raw_text)
