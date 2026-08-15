import os
import re
import json
import glob

SOURCE_DIR = r"D:\git\obsidianVault\sources"
OUTPUT_PATH = r"D:\git\my-private-assistant\src\data\spots.json"

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

md_files = glob.glob(os.path.join(SOURCE_DIR, "*.md"))
print(f"Found {len(md_files)} markdown files in {SOURCE_DIR}")

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
        
        # Name cleanup
        name_clean = re.sub(r"^\d+[\.\)]\s*", "", header_line)
        name_clean = re.sub(r"^\*\*\d+[\.\)]\s*", "", name_clean)
        name_clean = name_clean.strip("#* ")
        if not name_clean:
            continue

        # Extract location
        loc_match = re.search(r"[\-\*]\s*\*\*위치[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not loc_match:
            loc_match = re.search(r"[\-\*]\s*위치[:\s]*([^\n]+)", sec)
        location_str = loc_match.group(1).strip().strip("*") if loc_match else ""

        # Extract category / subtheme / concept
        cat_match = re.search(r"[\-\*]\s*\*\*카테고리[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not cat_match:
            cat_match = re.search(r"[\-\*]\s*\*\*컨셉[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not cat_match:
            cat_match = re.search(r"[\-\*]\s*\*\*공간 컨셉[^\*]*\*\*[:\s]*([^\n]+)", sec)
        category_str = cat_match.group(1).strip().strip("*") if cat_match else ""

        # Extract price
        price_match = re.search(r"[\-\*]\s*\*\*가격대[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not price_match:
            price_match = re.search(r"[\-\*]\s*\*\*가격[^\*]*\*\*[:\s]*([^\n]+)", sec)
        price_str = price_match.group(1).strip().strip("*") if price_match else ""

        # Extract summary / key points
        mood_match = re.search(r"[\-\*]\s*\*\*공간 무드[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*유튜브[^\*]*\*\*[:\s]*([^\n]+)", sec)
        if not mood_match:
            mood_match = re.search(r"[\-\*]\s*\*\*특징[^\*]*\*\*[:\s]*([^\n]+)", sec)
        mood_str = mood_match.group(1).strip().strip("*") if mood_match else ""

        # Region category determination
        combined_text = f"{name_clean} {location_str} {filename}"
        region = "전국"
        if any(k in combined_text for k in ["서울", "강남", "성수", "한남", "용산", "연희", "마포", "서초", "송파", "종로", "중구", "문래", "을지로", "익선", "망원"]):
            region = "서울"
        elif any(k in combined_text for k in ["경기", "가평", "양평", "파주", "포천", "고양", "성남", "분당", "판교", "과천", "용인", "수원", "이천", "광주", "남양주", "의왕", "안성", "화성", "시흥", "김포"]):
            region = "경기"
        elif any(k in combined_text for k in ["인천", "송도", "강화", "영흥", "선재", "영종", "을왕리"]):
            region = "인천"
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

        # Theme category
        theme = "감성 스테이"
        if any(k in combined_text for k in ["풀빌라", "Poolvilla", "인피니티", "오션뷰", "해안", "바다"]):
            theme = "오션 & 인피니티 풀빌라"
        elif any(k in combined_text for k in ["료칸", "Onsen", "스파", "히노끼", "자쿠지", "Spa", "노천", "온천"]):
            theme = "프라이빗 료칸 & 스파"
        elif any(k in combined_text for k in ["글램핑", "Glamping", "캠핑", "Camping", "차박", "카라반", "불멍"]):
            theme = "럭셔리 글램핑 & 차박"
        elif any(k in combined_text for k in ["한옥", "Hanok", "고택", "다도", "Tea", "티룸", "사찰"]):
            theme = "전통 한옥 & 다도 롯지"
        elif any(k in combined_text for k in ["다이닝", "오마카세", "Dining", "Gourmet", "맛집", "노포", "미식", "셰프"]):
            theme = "시크릿 다이닝 & 미식"
        elif any(k in combined_text for k in ["카페", "온실", "Greenhouse", "데이트", "Viral", "미디어아트", "스피크이지"]):
            theme = "트렌디 카페 & 이색 데이트"
        elif any(k in combined_text for k in ["샬레", "Chalet", "트리하우스", "Treehouse", "오두막", "숲", "Forest"]):
            theme = "숲속 샬레 & 트리하우스"
        elif any(k in combined_text for k in ["카약", "요트", "Yacht", "Sunset", "액티비티", "SUP", "선셋"]):
            theme = "선셋 요트 & 워터 액티비티"

        spot = {
            "id": spot_id_counter,
            "name": name_clean,
            "filename": filename,
            "region": region,
            "theme": theme,
            "location": location_str if location_str else region,
            "category": category_str if category_str else theme,
            "price": price_str if price_str else "예약 시 확인",
            "mood": mood_str if mood_str else name_clean,
            "tags": tags,
            "full_text": sec[:600]
        }
        spots.append(spot)
        spot_id_counter += 1

print(f"Successfully extracted {len(spots)} spots across {len(md_files)} files.")

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(spots, f, ensure_ascii=False, indent=2)

print(f"Saved spots.json to {OUTPUT_PATH}")
