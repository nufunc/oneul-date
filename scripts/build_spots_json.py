import os
import re
import json
import glob

SOURCE_DIR = r"D:\git\obsidianVault\sources"
OUTPUT_PATH = r"D:\git\my-private-assistant\src\data\spots.json"

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

md_files = glob.glob(os.path.join(SOURCE_DIR, "*.md"))
print(f"Found {len(md_files)} markdown files in {SOURCE_DIR}")

# ---------------------------------------------------------------------------
# Slot heuristics (schema v2). Checked in priority order: stay > night >
# evening > day. First match wins. Two passes:
#   pass 1: section text + spot name (most specific signal)
#   pass 2: filename + frontmatter tags (fallback only, to avoid a file-level
#           theme like "Glamping_Omakase" overriding per-spot signals)
# ---------------------------------------------------------------------------
SLOT_PATTERNS = [
    ("stay", [
        r"독채", r"풀\s*빌라", r"펜션", r"스테이(?!크)",  # 스테이크(steak) 오매칭 방지
        r"료칸", r"글램핑", r"카라반", r"차박", r"호텔", r"리조트",
        r"숙소", r"숙박", r"민박", r"호스텔", r"게스트하우스",
        r"트리\s*하우스", r"오두막", r"샬레", r"통나무집",
        r"pool\s*villa", r"\bstay\b", r"\bhotel\b", r"\bresort\b",
        r"glamping", r"treehouse", r"\bcabin\b", r"chalet", r"pension",
        r"\bryokan\b", r"한옥\s*(스테이|숙소)?체험", r"호캉스",
        r"고택", r"종택", r"산장", r"롯지", r"\blodge\b", r"별장",
        r"객실", r"체크인", r"입실", r"\d\s*박\s", r"조식",
    ]),
    ("night", [
        # '바'는 단어 경계 주의: '바다' 오매칭 금지 → 구체 합성어만 매칭
        r"(와인|칵테일|루프탑|재즈|몰트|위스키|하이볼|스탠딩|스피크이지|시크릿)\s*바(?!다)",
        r"루프탑\s*(바|라운지|펍)", r"\bbar\b", r"\bpub\b", r"펍\b",
        r"야경", r"스피크이지", r"speakeasy", r"심야", r"포차",
        r"이자카야", r"위스키", r"칵테일", r"재즈", r"나이트",
        r"믹솔로지", r"바텐더", r"라운지\s*바",
    ]),
    ("evening", [
        r"다이닝", r"오마카세", r"맛집", r"식당", r"레스토랑", r"노포",
        r"미식", r"셰프", r"코스\s*요리", r"스시", r"초밥", r"한정식",
        r"고깃집", r"브루어리", r"스테이크", r"비스트로", r"파인\s*다이닝",
        r"dining", r"gourmet", r"omakase", r"\bsushi\b", r"restaurant",
        r"\bbbq\b", r"화로구이", r"솥밥", r"장어",
    ]),
    ("day", [
        r"카페", r"전시", r"미술관", r"박물관", r"갤러리", r"산책", r"온실",
        r"서점", r"베이커리", r"브런치", r"액티비티", r"카약", r"요트",
        r"\bSUP\b", r"패들", r"수목원", r"정원", r"테마파크", r"스파",
        r"온천", r"찜질", r"사우나", r"피크닉", r"드라이브", r"공방",
        r"원데이\s*클래스", r"승마", r"트레킹", r"둘레길",
        r"\bcafe\b", r"gallery", r"bakery", r"brunch", r"museum",
        r"yacht", r"kayak", r"picnic", r"\bspa\b",
    ]),
]

SLOT_COMPILED = [
    (slot, [re.compile(p, re.IGNORECASE) for p in pats])
    for slot, pats in SLOT_PATTERNS
]


def detect_slot(text):
    for slot, pats in SLOT_COMPILED:
        for p in pats:
            if p.search(text):
                return slot
    return None


# ---------------------------------------------------------------------------
# Mood heuristics (multiple allowed). Uses name + section text + tags.
# Filename is intentionally excluded: the source series is branded
# "Premium_*" which would falsely tag nearly every spot as luxury.
# ---------------------------------------------------------------------------
MOOD_PATTERNS = {
    "romantic": [
        r"로맨틱", r"데이트", r"일몰", r"선셋", r"sunset", r"와인",
        r"기념일", r"감성", r"romantic", r"프러포즈", r"커플",
    ],
    "healing": [
        r"힐링", r"자연", r"숲", r"쉼", r"조용", r"피톤치드", r"명상",
        r"peaceful", r"healing", r"웰니스", r"wellness",
    ],
    "luxury": [
        r"럭셔리", r"하이엔드", r"프리미엄", r"5성", r"스위트", r"인피니티",
        r"luxury", r"호캉스", r"\bvip\b",
    ],
    "gourmet": [
        r"미식", r"오마카세", r"다이닝", r"맛집", r"노포", r"셰프",
        r"gourmet", r"\bfood\b", r"파인다이닝",
    ],
    "active": [
        r"카약", r"요트", r"서핑", r"\bSUP\b", r"패러글라이딩", r"클라이밍",
        r"원데이\s*클래스", r"공방", r"도자기", r"체험", r"액티비티",
        # '스키'는 위스키/휘스키 오매칭 방지 (스키장·스키 슬로프만 매칭)
        r"자전거", r"승마", r"짚라인", r"(?<![위휘])스키", r"루지",
    ],
    "view": [
        r"오션\s*뷰", r"리버\s*뷰", r"시티\s*뷰", r"뷰\s*맛집", r"파노라마",
        r"전망", r"일출", r"일몰", r"야경", r"스카이", r"옥상", r"루프탑",
        r"통창", r"창밖",
    ],
    "retro": [
        # '다도해'(군도) 오매칭 방지, '전통의'(오랜/유서 깊은) 오매칭 방지
        r"한옥", r"고택", r"노포", r"레트로", r"빈티지", r"전통(?!의)",
        r"다도(?!해)", r"사찰", r"골목", r"근대", r"적산\s*가옥", r"경양식",
    ],
    "trendy": [
        r"핫플", r"인스타", r"미디어\s*아트", r"팝업", r"신상", r"오픈런",
        r"웨이팅", r"바이럴", r"\bviral\b", r"힙한", r"힙지로",
    ],
}

# detect_moods 판정 순서 (기존 4종 + 신규 4종)
MOOD_ORDER = (
    "romantic", "healing", "luxury", "gourmet",
    "active", "view", "retro", "trendy",
)

MOOD_COMPILED = {
    mood: [re.compile(p, re.IGNORECASE) for p in pats]
    for mood, pats in MOOD_PATTERNS.items()
}

# frontmatter 태그(mood/luxury 등) 직접 매핑
TAG_MOOD_MAP = {
    "mood/romantic": "romantic",
    "mood/healing": "healing",
    "mood/luxury": "luxury",
    "mood/gourmet": "gourmet",
    "mood/active": "active",
    "mood/view": "view",
    "mood/retro": "retro",
    "mood/trendy": "trendy",
}


def detect_moods(text, tags):
    moods = []
    for tag in tags:
        mapped = TAG_MOOD_MAP.get(tag.strip().lower())
        if mapped and mapped not in moods:
            moods.append(mapped)
    for mood in MOOD_ORDER:
        if mood in moods:
            continue
        if any(p.search(text) for p in MOOD_COMPILED[mood]):
            moods.append(mood)
    return moods


# ---------------------------------------------------------------------------
# Explicit fields (live-validation feedback). When a spot section contains
# `- **슬롯**:`, `- **분위기**:` or `- **출처**:` lines, those values take
# priority over the heuristics above. Regexes match within a single line only
# (no newline leakage), same style as the 위치/가격 extractors.
# ---------------------------------------------------------------------------
EXPLICIT_SLOT_MAP = {
    "낮": "day",
    "저녁": "evening",
    "밤": "night",
    "숙박": "stay",
}

EXPLICIT_MOOD_MAP = {
    "로맨틱": "romantic",
    "힐링": "healing",
    "럭셔리": "luxury",
    "미식": "gourmet",
    "액티비티": "active",
    "뷰": "view",
    "전망": "view",
    "레트로": "retro",
    "전통": "retro",
    "핫플": "trendy",
    "트렌디": "trendy",
}

EXPLICIT_SLOT_RE = re.compile(r"[\-\*]\s*\*\*슬롯\*\*[: \t]*([^\n]+)")
EXPLICIT_MOOD_RE = re.compile(r"[\-\*]\s*\*\*분위기\*\*[: \t]*([^\n]+)")
EXPLICIT_SOURCE_RE = re.compile(r"[\-\*]\s*\*\*출처\*\*[: \t]*([^\n]+)")
URL_RE = re.compile(r"https?://[^\s)\]>]+")


def source_type_for_url(url):
    return "youtube" if url and "youtube" in url.lower() else "web"


def extract_explicit_slot(sec):
    m = EXPLICIT_SLOT_RE.search(sec)
    if not m:
        return None
    value = m.group(1).strip().strip("*: ").strip()
    for ko, slot in EXPLICIT_SLOT_MAP.items():
        if ko in value:
            return slot
    return None


def extract_explicit_moods(sec):
    m = EXPLICIT_MOOD_RE.search(sec)
    if not m:
        return None
    value = m.group(1).strip().strip("*: ").strip()
    moods = []
    for token in re.split(r"[,/·]", value):
        mapped = EXPLICIT_MOOD_MAP.get(token.strip())
        if mapped and mapped not in moods:
            moods.append(mapped)
    return moods if moods else None


def extract_explicit_source_url(sec):
    m = EXPLICIT_SOURCE_RE.search(sec)
    if not m:
        return None
    url_match = URL_RE.search(m.group(1))
    return url_match.group(0).rstrip(".,;") if url_match else None


# ---------------------------------------------------------------------------
# Area extraction (시·군·구 단위 세부 지역, for proximity-based auto courses).
# Priority:
#   1. Regex `([가-힣]{1,6}(시|군|구))` over location (then name), validated
#      against the official 기초자치단체 whitelist so that broad names
#      (서울특별시, 경기도, ...) and false suffixes (전시, 입구, ...) never
#      leak through. Suffix-trimming recovers "경기고양시" -> "고양시".
#   2. 일반시 산하 일반구 is normalized to its parent 시 (분당구 -> 성남시),
#      per the "시 over 구 for non-metro cities" rule. Text order already
#      prefers 시 when both appear ("수원시 팔달구" -> 수원시).
#   3. Fallback: frequent-neighborhood dictionary (성수동 -> 성동구, ...),
#      longest key first, location then name.
#   4. Otherwise area = null.
# ---------------------------------------------------------------------------
SGG_RE = re.compile(r"([가-힣]{1,6}(?:시|군|구))")

# 기초자치단체 whitelist (자치시·군·구 + 제주 행정시 + 세종).
VALID_AREAS = set("""
종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구
은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구
서초구 강남구 송파구 강동구
서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 연제구
수영구 사상구 기장군
수성구 달서구 달성군 군위군
미추홀구 연수구 남동구 부평구 계양구 강화군 옹진군
광산구 유성구 대덕구 울주군 세종시
수원시 성남시 의정부시 안양시 부천시 광명시 평택시 동두천시 안산시 고양시
과천시 구리시 남양주시 오산시 시흥시 군포시 의왕시 하남시 용인시 파주시
이천시 안성시 김포시 화성시 광주시 양주시 포천시 여주시 연천군 가평군 양평군
춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군
정선군 철원군 화천군 양구군 인제군 고성군 양양군
청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군
천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군
청양군 홍성군 예산군 태안군
전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군
순창군 고창군 부안군
목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군
장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군
포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군
청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군
창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군
남해군 하동군 산청군 함양군 거창군 합천군
제주시 서귀포시
""".split())

# 일반시 산하 일반구 -> 부모 시 (시가 구보다 우선).
GU_TO_CITY = {
    "장안구": "수원시", "권선구": "수원시", "팔달구": "수원시", "영통구": "수원시",
    "수정구": "성남시", "중원구": "성남시", "분당구": "성남시",
    "만안구": "안양시", "동안구": "안양시",
    "상록구": "안산시", "단원구": "안산시",
    "덕양구": "고양시", "일산동구": "고양시", "일산서구": "고양시",
    "처인구": "용인시", "기흥구": "용인시", "수지구": "용인시",
    "상당구": "청주시", "서원구": "청주시", "흥덕구": "청주시", "청원구": "청주시",
    "동남구": "천안시", "서북구": "천안시",
    "완산구": "전주시", "덕진구": "전주시",
    "의창구": "창원시", "성산구": "창원시", "진해구": "창원시",
    "마산합포구": "창원시", "마산회원구": "창원시",
}
VALID_AREAS.update(GU_TO_CITY)

# 주요 지명 -> 기초자치단체 폴백 사전 (데이터 샘플링 기반 고빈도 지명).
NEIGHBORHOOD_AREA = {
    # 서울
    "성수동": "성동구", "성수": "성동구", "서울숲": "성동구", "왕십리": "성동구",
    "한남동": "용산구", "한남": "용산구", "이태원": "용산구", "해방촌": "용산구",
    "이촌동": "용산구", "경리단": "용산구",
    "홍대": "마포구", "연남": "마포구", "망원": "마포구", "합정": "마포구",
    "상수동": "마포구",
    "강남역": "강남구", "역삼": "강남구", "청담": "강남구", "압구정": "강남구",
    "신사동": "강남구", "가로수길": "강남구", "삼성동": "강남구", "도산공원": "강남구",
    "을지로": "중구", "명동": "중구", "충무로": "중구", "힙지로": "중구",
    "익선동": "종로구", "북촌": "종로구", "삼청": "종로구", "서촌": "종로구",
    "부암동": "종로구", "광화문": "종로구", "혜화": "종로구", "대학로": "종로구",
    "낙원동": "종로구", "인사동": "종로구",
    "여의도": "영등포구", "문래": "영등포구", "성북동": "성북구", "잠실": "송파구",
    # 경기/인천
    "판교": "성남시", "분당": "성남시", "정자동": "성남시",
    "광교": "수원시", "행궁동": "수원시", "일산": "고양시", "밤리단길": "고양시",
    "송도": "연수구", "영종도": "중구", "을왕리": "중구", "월미도": "중구",
    "개항장": "중구", "영흥도": "옹진군", "선재도": "안산시", "헤이리": "파주시",
    # 강원/충청/영호남
    "경주": "경주시", "강릉": "강릉시", "속초": "속초시", "양양": "양양군",
    "춘천": "춘천시", "전주": "전주시", "여수": "여수시", "통영": "통영시",
    "거제": "거제시", "남해": "남해군", "담양": "담양군", "순천": "순천시",
    # 부산
    "해운대": "해운대구", "광안리": "수영구", "서면": "부산진구", "기장": "기장군",
    "전포": "부산진구", "영도": "영도구", "남포동": "중구", "청사포": "해운대구",
    # 제주
    "애월": "제주시", "한림": "제주시", "협재": "제주시", "구좌": "제주시",
    "조천": "제주시", "함덕": "제주시", "우도": "제주시",
    "중문": "서귀포시", "성산": "서귀포시", "표선": "서귀포시", "안덕": "서귀포시",
}
NEIGHBORHOOD_KEYS = sorted(NEIGHBORHOOD_AREA, key=len, reverse=True)


def _valid_area_from_token(token):
    """Return the whitelisted 기초자치단체 for a regex token, trimming greedy
    leading characters ("경기고양시" -> "고양시"). None if no valid suffix."""
    for i in range(len(token)):
        cand = token[i:]
        if cand in VALID_AREAS:
            return GU_TO_CITY.get(cand, cand)
    return None


def extract_area(location, name):
    for text in (location, name):
        if not text:
            continue
        for m in SGG_RE.finditer(text):
            area = _valid_area_from_token(m.group(1))
            if area:
                return area
    for text in (location, name):
        if not text:
            continue
        for key in NEIGHBORHOOD_KEYS:
            if key in text:
                return NEIGHBORHOOD_AREA[key]
    return None


spots = []
spot_id_counter = 1

for filepath in md_files:
    filename = os.path.basename(filepath)
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Extract frontmatter tags & title
    tags = []
    fm_match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if fm_match:
        fm_text = fm_match.group(1)
        tag_match = re.search(r"tags:\s*(\[[^\]]+\]|(?:\n\s*-\s*[^\n]+)+)", fm_text)
        if tag_match:
            raw_tags = tag_match.group(1)
            if raw_tags.startswith("["):
                tags = [t.strip().strip("'\"") for t in raw_tags[1:-1].split(",") if t.strip()]
            else:
                tags = [t.strip()[1:].strip() for t in raw_tags.split("\n") if t.strip().startswith("-")]

    # Normalize split regex: handles ### 1., ## 1., ### [지역], ### 01., etc.
    # We look for lines starting with ## or ### followed by numbers or brackets or bold titles
    sections = re.split(r"\n#{2,4}\s+(?=\d+[\.\)]|\[|\*\*|\d{2}\.)", content)

    # If standard split doesn't find many sections, fallback to ###
    if len(sections) <= 1:
        sections = re.split(r"\n#{2,4}\s+", content)

    for sec in sections[1:]:
        lines = sec.strip().split("\n")
        if not lines:
            continue
        header_line = lines[0].strip()

        # Skip sub-theme headers like "[Sub-Theme 1] ..." or "테마 요약" or "📌 DB 개요"
        if any(skip_word in header_line for skip_word in ["Sub-Theme", "개요", "선정 기준", "비교 요약", "핵심 가이드", "총괄 요약", "목차", "안내"]):
            continue
        # Skip guide/tip/summary sections that are not actual spots
        if re.search(r"체크리스트|가이드|꿀팁|공략|요약|결론|총정리|활용법|팁(\s|$|\()", header_line):
            continue

        # Name cleanup
        name_clean = re.sub(r"^\d+[\.\)]\s*", "", header_line)
        name_clean = re.sub(r"^\*\*\d+[\.\)]\s*", "", name_clean)
        name_clean = name_clean.strip("#* ")
        if not name_clean:
            continue

        # Extract location
        loc_match = re.search(r"[\-\*]\s*\*\*위치[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not loc_match:
            loc_match = re.search(r"[\-\*]\s*위치[: 	]*([^\n]+)", sec)
        location_str = loc_match.group(1).strip().strip("*: ").strip() if loc_match else ""

        # Extract price (value must start with a real character, so that a
        # bare header line like "- **가격대 & 예약 팁**:" is skipped and the
        # nested "- **가격대**: 값" line matches instead)
        price_match = re.search(r"[\-\*]\s*\*\*가격대[^\*]*\*\*[: 	]*([^\s:*][^\n]*)", sec)
        if not price_match:
            price_match = re.search(r"[\-\*]\s*\*\*가격[^\*]*\*\*[: 	]*([^\s:*][^\n]*)", sec)
        price_str = price_match.group(1).strip().strip("*: ").strip() if price_match else ""

        # Extract summary / key points
        # 특징을 분위기보다 먼저 검사 — 명시 '분위기' 필드(mood 분류용)가 있는 문서에서
        # summary가 분위기 토큰 나열("로맨틱, 힐링")로 채워지는 것 방지
        mood_match = re.search(r"[\-\*]\s*\*\*공간 무드[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*특징[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*분위기[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*유튜브[^\*]*\*\*[: 	]*([^\n]+)", sec)
        mood_str = mood_match.group(1).strip().strip("*: ").strip() if mood_match else ""

        # Region category determination
        combined_text = f"{name_clean} {location_str} {filename}"
        # "서울 상암 기준 35분" 같은 거리 표기가 서울로 오분류되는 것 방지
        combined_text = re.sub(r"서울[가-힣\s·/]*기준", "", combined_text)
        region = "전국"
        if any(k in combined_text for k in ["인천", "송도", "강화", "영흥", "선재", "영종", "을왕리"]):
            region = "인천"
        elif any(k in combined_text for k in ["서울", "강남", "성수", "한남", "용산", "연희", "마포", "서초", "송파", "종로", "중구", "문래", "을지로", "익선", "망원"]):
            region = "서울"
        elif any(k in combined_text for k in ["경기", "가평", "양평", "파주", "포천", "고양", "성남", "분당", "판교", "과천", "용인", "수원", "이천", "광주", "남양주", "의왕", "안성", "화성", "시흥", "김포", "여주", "의정부", "동두천", "구리", "하남", "부천", "안양", "군포", "오산", "평택", "광명"]):
            region = "경기"
        elif any(k in combined_text for k in ["강원", "강릉", "양양", "속초", "동해", "삼척", "춘천", "홍천", "평창", "정선", "영월", "고성", "원주", "태백"]):
            region = "강원"
        elif any(k in combined_text for k in ["충남", "충북", "보령", "서천", "서산", "태안", "공주", "충주", "단양", "청주", "천안", "아산", "제천", "영동", "보은"]):
            region = "충청"
        elif any(k in combined_text for k in ["경북", "경남", "부산", "대구", "울산", "포항", "경주", "청도", "거제", "통영", "남해", "사천", "밀양", "하동", "산청", "청송", "영덕", "문경", "안동"]):
            region = "영남"
        elif any(k in combined_text for k in ["전북", "전남", "광주", "여수", "순천", "담양", "완주", "남원", "곡성", "구례", "전주", "군산", "고창", "신안", "진도"]):
            region = "호남"
        elif any(k in combined_text for k in ["제주", "서귀포", "애월", "구좌", "한림", "안덕", "대정", "한경", "조천", "성산"]):
            region = "제주"

        # --- Slot detection (v2) --------------------------------------------
        # Explicit `- **슬롯**:` field wins over heuristics.
        slot = extract_explicit_slot(sec)
        if slot is None:
            # Pass 1: per-spot signal (name + section body)
            spot_text = f"{name_clean}\n{sec}"
            slot = detect_slot(spot_text)
            # Pass 2 (fallback): file-level signal (filename + frontmatter tags)
            if slot is None:
                file_text = f"{filename} {' '.join(tags)}"
                slot = detect_slot(file_text)

        # --- Mood detection (v2) --------------------------------------------
        # Explicit `- **분위기**:` field (mapped keywords) replaces heuristics.
        moods = extract_explicit_moods(sec)
        if moods is None:
            mood_text = f"{name_clean}\n{sec}"
            moods = detect_moods(mood_text, tags)

        # --- Source (explicit `- **출처**:` URL) ------------------------------
        source_url = extract_explicit_source_url(sec)

        # --- Area (시·군·구) --------------------------------------------------
        area = extract_area(location_str, name_clean)

        spot = {
            "id": spot_id_counter,
            "name": name_clean,
            "slot": slot,
            "region": region,
            "area": area,
            "mood": moods,
            "location": location_str if location_str else region,
            "price": price_str if price_str else None,
            "summary": (mood_str if mood_str else name_clean)[:200],
            "source": {
                "type": source_type_for_url(source_url),
                "url": source_url,
                "note": filename,
            },
            "verified": False,
        }
        spots.append(spot)
        spot_id_counter += 1

print(f"Successfully extracted {len(spots)} spots across {len(md_files)} files.")

# ---------------------------------------------------------------------------
# Overrides (scripts/overrides.json, keyed by exact spot name). Applied after
# extraction: `exclude: true` removes the spot; other keys patch fields.
# `sourceUrl` goes into source.url (and refreshes source.type from the URL).
# Names present in overrides.json but not matched are reported loudly so a
# parser re-run that renames spots cannot silently orphan an override.
# ---------------------------------------------------------------------------
OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "overrides.json")

OVERRIDE_FIELDS = ("verified", "price", "location", "region", "summary", "slot", "mood", "area")

if os.path.exists(OVERRIDES_PATH):
    with open(OVERRIDES_PATH, 'r', encoding='utf-8') as f:
        overrides = json.load(f)

    matched_names = set()
    excluded_count = 0
    kept = []
    for spot in spots:
        ov = overrides.get(spot["name"])
        if ov is None:
            kept.append(spot)
            continue
        matched_names.add(spot["name"])
        if ov.get("exclude"):
            excluded_count += 1
            continue
        for field in OVERRIDE_FIELDS:
            if field in ov:
                spot[field] = ov[field]
        # Override changed location but not area: re-derive area from new text.
        if "location" in ov and "area" not in ov:
            spot["area"] = extract_area(spot["location"], spot["name"])
        if "sourceUrl" in ov:
            spot["source"]["url"] = ov["sourceUrl"]
            spot["source"]["type"] = source_type_for_url(ov["sourceUrl"])
        kept.append(spot)
    spots = kept

    unmatched = [name for name in overrides if name not in matched_names]
    print("\n--- Overrides ---")
    print(f"Loaded {len(overrides)} overrides from {OVERRIDES_PATH}")
    print(f"Matched: {len(matched_names)} / Excluded: {excluded_count}")
    if unmatched:
        print(f"WARNING: {len(unmatched)} override name(s) did not match any spot:")
        for name in unmatched:
            print(f"  - {name}")
else:
    print(f"No overrides file at {OVERRIDES_PATH} (skipped).")

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(spots, f, ensure_ascii=False, indent=2)

print(f"Saved spots.json to {OUTPUT_PATH}")

# ---------------------------------------------------------------------------
# Validation summary
# ---------------------------------------------------------------------------
from collections import Counter

slot_dist = Counter(s["slot"] for s in spots)
mood_dist = Counter(m for s in spots for m in s["mood"])
region_dist = Counter(s["region"] for s in spots)
null_ratio = slot_dist[None] / len(spots) * 100 if spots else 0

area_dist = Counter(s["area"] for s in spots if s["area"])
area_null = sum(1 for s in spots if not s["area"])
area_coverage = (len(spots) - area_null) / len(spots) * 100 if spots else 0

print("\n--- Validation ---")
print(f"Total spots: {len(spots)}")
print(f"Slot distribution: {dict(slot_dist.most_common())}")
print(f"  slot=null ratio: {null_ratio:.1f}%")
print(f"Mood distribution: {dict(mood_dist.most_common())}")
print(f"Region distribution: {dict(region_dist.most_common())}")
print(f"Area coverage: {area_coverage:.1f}% ({len(spots) - area_null}/{len(spots)}, null: {area_null})")
print(f"Top 20 areas: {dict(area_dist.most_common(20))}")
