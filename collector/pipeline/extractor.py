import re
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("oneul.extractor")

def clean_spot_name(header_line: str) -> str:
    """스폿 이름 표준 정제 (대괄호/영문 괄호/특수기호/선행 동네명 제거)"""
    name = header_line.strip()
    
    # 1. Markdown 헤딩 마크(#, ##, ###) 및 불릿(-, *, 1.) 제거
    name = re.sub(r'^[#\s\-\*\d\.]+', '', name).strip()
    
    # 2. 대괄호 [서울/성수], [강남] 등 지역/태그 접두사 제거
    name = re.sub(r'^\[[^\]]+\]\s*', '', name).strip()
    
    # 3. 따옴표 제거
    name = name.replace("'", "").replace('"', '').replace('‘', '').replace('’', '').replace('“', '').replace('”', '')
    
    # 4. 선행 동네명 분리 (예: "백현동 분당 티 라이브러리" -> "분당 티 라이브러리")
    name = re.sub(r'^(?:[가-힣]{2,4}[동|읍|면|리|로|길])\s+', '', name).strip()
    
    # 5. 호텔/기업 접두사 정돈
    name = re.sub(r'^(조선팰리스|파크\s*하얏트|그랜드\s*하얏트|페어몬트|시그니엘|안다즈)\s+서울(?:\s+[가-힣]+)?\s*[-–]\s*', r'\1 ', name).strip()
    
    # 6. 영문/지역 병기 괄호 제거 (예: "(Bundang Tea Library)", "(판교/분당 백현동)")
    name = re.sub(r'\s*\([A-Za-z0-9\s/&·\-\–,\.\'\"]+\)', '', name)
    name = re.sub(r'\s*\([가-힣\s/]+[동|구|시|군|역]\)', '', name)
    name = re.sub(r'\s*\([가-힣\s/]+(?:판교|분당|성수|한남|강남|홍대|서촌|북촌|을지로|해운대|송도|제주)[^)]*\)', '', name)
    name = re.sub(r'\s*\(Part\s*\d+\)', '', name, flags=re.IGNORECASE)
    
    # 7. 영문 브랜드명 한글화 매핑
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

    # 8. 연속 공백 정리
    name = re.sub(r'\s{2,}', ' ', name).strip()
    return name

def extract_spot_info_with_gemini(raw_text: str, api_key: str = "") -> Optional[Dict[str, Any]]:
    """Gemini API를 호출하여 비구조화된 텍스트/리뷰에서 표준 스폿 JSON 추출 (fallback은 규칙 기반)"""
    if not api_key:
        return None

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        prompt = f"""
다음 장소 설명 텍스트에서 데이트 코스 메타데이터를 JSON 형식으로 정확히 추출해줘.
필수 스키마:
- name: 순수 상호명(명사)
- slot: "day" (낮/카페/전시), "evening" (저녁/식사/다이닝), "night" (밤/바/야경/심야), "stay" (숙소/호텔) 중 택1
- region: "서울", "경기", "인천", "강원", "충청", "영남", "호남", "제주" 중 택1
- area: 구/시/군 단위 (예: "강남구", "성동구", "해운대구", "서귀포시" 등)
- mood: ["romantic", "healing", "luxury", "gourmet", "active", "view", "retro", "trendy"] 중 1~3개 선택
- location: 도로명 주소 또는 동네 포함 주소
- price: 1인당 예상 가격대 또는 "1만원대", "5만원대" 등
- summary: 매거진 감성의 1~2줄 핵심 추천 이유 (최대 100자)

텍스트:
\"\"\"{raw_text}\"\"\"

JSON 결과만 마크다운 코드블록 없이 출력해줘:
"""
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
        )
        
        text = response.text.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        data = json.loads(text)
        
        if "name" in data:
            data["name"] = clean_spot_name(data["name"])
            return data
    except Exception as e:
        logger.warning(f"Gemini extraction failed ({e}), falling back to regex parser.")

    return None
