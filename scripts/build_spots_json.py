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
}

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
}


def detect_moods(text, tags):
    moods = []
    for tag in tags:
        mapped = TAG_MOOD_MAP.get(tag.strip().lower())
        if mapped and mapped not in moods:
            moods.append(mapped)
    for mood in ("romantic", "healing", "luxury", "gourmet"):
        if mood in moods:
            continue
        if any(p.search(text) for p in MOOD_COMPILED[mood]):
            moods.append(mood)
    return moods


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
        mood_match = re.search(r"[\-\*]\s*\*\*공간 무드[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*분위기[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*유튜브[^\*]*\*\*[: 	]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*특징[^\*]*\*\*[: 	]*([^\n]+)", sec)
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
        elif any(k in combined_text for k in ["경기", "가평", "양평", "파주", "포천", "고양", "성남", "분당", "판교", "과천", "용인", "수원", "이천", "광주", "남양주", "의왕", "안성", "화성", "시흥", "김포"]):
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
        # Pass 1: per-spot signal (name + section body)
        spot_text = f"{name_clean}\n{sec}"
        slot = detect_slot(spot_text)
        # Pass 2 (fallback): file-level signal (filename + frontmatter tags)
        if slot is None:
            file_text = f"{filename} {' '.join(tags)}"
            slot = detect_slot(file_text)

        # --- Mood detection (v2) --------------------------------------------
        mood_text = f"{name_clean}\n{sec}"
        moods = detect_moods(mood_text, tags)

        spot = {
            "id": spot_id_counter,
            "name": name_clean,
            "slot": slot,
            "region": region,
            "mood": moods,
            "location": location_str if location_str else region,
            "price": price_str if price_str else None,
            "summary": (mood_str if mood_str else name_clean)[:200],
            "source": {"type": "web", "url": None, "note": filename},
            "verified": False,
        }
        spots.append(spot)
        spot_id_counter += 1

print(f"Successfully extracted {len(spots)} spots across {len(md_files)} files.")

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

print("\n--- Validation ---")
print(f"Total spots: {len(spots)}")
print(f"Slot distribution: {dict(slot_dist.most_common())}")
print(f"  slot=null ratio: {null_ratio:.1f}%")
print(f"Mood distribution: {dict(mood_dist.most_common())}")
print(f"Region distribution: {dict(region_dist.most_common())}")
