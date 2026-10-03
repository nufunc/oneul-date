#!/usr/bin/env python3
"""P-044 데이트 적합도 전수 판정: 열린 행 전체를 규칙으로 소프트 삭제, 교정, 검토 세 목록으로 나눈다. DB에 쓰지 않는다.

규칙은 RULES 목록에 둔다. 규칙을 더할 때는 이 목록에 한 줄을 더한다. action이 close인 규칙은 표본 정밀도가
95% 이상인 것만 둔다(사이클 36 표). 한 행이 여러 규칙에 걸리면 close > fix > review 순으로 한 목록에만 넣고
걸린 규칙 id를 모두 남긴다. fix 규칙은 patch(바꿀 필드)를 함께 둔다.

읽기는 라이브 DB(OCI 호스트에서 COLLECTOR_DIR의 .env, 127.0.0.1 중계 서버)나 --input의 JSON 행 목록이다.
OCI: COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 judge_date_fit.py --out date-fit-20261003.json
로컬: python3 scripts/judge_date_fit.py --input public/data/spots.json --out /tmp/date-fit.json
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime

EVENT_CATS = {"축제/행사", "페스티벌"}
EVENT_WORD = re.compile(r"축제|페스티벌|페스타|문화제|야행|잔치|마라톤|박람회|한마당|놀이마당|문화대전|페스트")
CULTURE_CENTER = re.compile(r"문화원(\(.*\))?$")  # 고성문화원(경남)처럼 괄호 꼬리가 붙은 행도 있다
SPORTS_FACILITY = re.compile(r"(체육공원|체육관|체육센터|공설운동장|배드민턴장|인라인스케이트장)$")
CAMPING = re.compile(r"캠핑|글램핑|카라반|야영")
MALL = re.compile(r"백화점|더현대|스타필드|아울렛|아웃렛|롯데월드몰|타임스퀘어|코엑스몰|IFC몰|AK플라자|갤러리아")
NON_DATE_CATS = {"문화원", "스포츠시설", "도서관", "국공립도서관", "매표소", "공간대여", "주차장", "문화센터"}
BAR_CATS = {"호프,요리주점", "칵테일바", "일본식주점", "와인바", "술집", "실내포장마차", "바(BAR)", "맥주,호프", "포장마차"}
CAFE_CATS = {"카페", "커피전문점", "디저트카페", "제과,베이커리", "테마카페", "갤러리카페", "북카페", "전통찻집", "브런치카페"}
SIDO = {"서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천", "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종",
        "경기": "경기", "강원": "강원", "충청북": "충북", "충북": "충북", "충청남": "충남", "충남": "충남", "전라북": "전북", "전북": "전북",
        "전라남": "전남", "전남": "전남", "경상북": "경북", "경북": "경북", "경상남": "경남", "경남": "경남", "제주": "제주"}
ROAD_ADDR = re.compile(r"^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?![\d가-힣-])")  # 돈화문로11길 30, 11가길 3을 돈화문로11에서 끊지 않는다


def src_type(row):
    return (row.get("source") or {}).get("type") if isinstance(row.get("source"), dict) else row.get("source")


def note(row):
    return ((row.get("source") or {}).get("note") or "") if isinstance(row.get("source"), dict) else ""


def sido_of_address(row):
    for text in ((row.get("address") or "").split(" ")[0], row.get("region") or ""):
        for k, v in SIDO.items():
            if text.startswith(k):
                return v
    return None


def source_sidos(row):
    """출처 메모의 검색어(캐치테이블)나 영상 제목(괄호 안)에 나온 시·도. 광주는 경기 광주와 겹쳐 뺀다."""
    t = src_type(row)
    text = note(row)
    if t == "catchtable_miner":
        text = text.split("query:", 1)[-1]
    elif t == "youtube_vlog":
        m = re.search(r"\((.*)", text)
        text = m.group(1) if m else ""
    else:
        return set()
    return {v for k, v in SIDO.items() if k != "광주" and re.search(rf"(^|[\s(]){k}", text)}


def road_key(row):
    m = ROAD_ADDR.match(re.sub(r"\s+", " ", (row.get("address") or "").strip()))
    return m.group(1) if m else None


def no_period_event(row):
    return (row.get("category") in EVENT_CATS and not (row.get("source") or {}).get("event")
            and bool(EVENT_WORD.search(row.get("name") or "")))


# (id, action, 설명, 판정 함수(row, ctx), patch). ctx는 전체 열린 행에서 미리 센 값이다.
RULES = [
    ("R4_기간없는_행사", "close", "축제/행사·페스티벌 카테고리이고 source.event가 없으며 이름에 행사어가 있다(web 제외). 43/43 기간 한정 행사",
     lambda r, c: no_period_event(r) and src_type(r) != "web", None),
    ("R9_tourapi_지방문화원", "close", "출처 tourapi이고 이름이 문화원으로 끝난다(괄호 꼬리 허용). 109곳 전수가 지방문화원",
     lambda r, c: src_type(r) == "tourapi" and bool(CULTURE_CENTER.search((r.get("name") or "").strip())), None),
    ("R13_캠핑_낮슬롯", "fix", "이름이나 카테고리에 캠핑·글램핑·카라반·야영이 있고 슬롯 day. 표본 교정 2/2",
     lambda r, c: r.get("slot") == "day" and bool(CAMPING.search(r.get("name") or "") or CAMPING.search(r.get("category") or "")),
     {"slot": "stay"}),
    ("R4w_기간없는_행사_web", "review", "R4와 같은 조건의 web 행. 상설 장소가 섞여 있다(궁남지 등)",
     lambda r, c: no_period_event(r) and src_type(r) == "web", None),
    ("R2_출처지역_불일치", "review", "캐치테이블 검색어나 영상 제목의 시·도가 주소의 시·도와 다르다. 전수 판정 74%",
     lambda r, c: bool(source_sidos(r)) and sido_of_address(r) is not None and sido_of_address(r) not in source_sidos(r), None),
    ("R6_백화점_몰_입점", "review", "이름이나 주소에 백화점·더현대·스타필드·아울렛 등. 보충 58%, 별마당도서관 같은 명소가 섞임",
     lambda r, c: bool(MALL.search(r.get("name") or "") or MALL.search(r.get("address") or "")), None),
    ("R3_같은주소_5행이상", "review", "도로명 주소(번지까지)가 같은 열린 행이 5곳 이상. 보충 25%",
     lambda r, c: road_key(r) is not None and c["road"][road_key(r)] >= 5, None),
    ("R8_시장", "review", "카테고리 시장. 보충 25%, 주관 판정", lambda r, c: r.get("category") == "시장", None),
    ("R10_tourapi_체육시설", "review", "출처 tourapi이고 이름이 체육공원·체육관·공설운동장 등으로 끝난다. 공원형이 섞임",
     lambda r, c: src_type(r) == "tourapi" and bool(SPORTS_FACILITY.search((r.get("name") or "").strip())), None),
    ("R1_비데이트_카테고리", "review", "카테고리가 문화원·스포츠시설·도서관·매표소·공간대여 등. 대부분 카테고리만 틀린 명소",
     lambda r, c: r.get("category") in NON_DATE_CATS, None),
    ("R5_설명형_이름", "review", "이름에 ·나 &가 있거나 4어절 이상. 대부분 이름 교정 후보",
     lambda r, c: "·" in (r.get("name") or "") or "&" in (r.get("name") or "") or len((r.get("name") or "").split()) >= 4, None),
    ("R11_술집_낮슬롯", "review", "주점류 카테고리인데 슬롯 day", lambda r, c: r.get("category") in BAR_CATS and r.get("slot") == "day", None),
    ("R12_카페_밤슬롯", "review", "카페류 카테고리인데 슬롯 night", lambda r, c: r.get("category") in CAFE_CATS and r.get("slot") == "night", None),
]
ACTION_ORDER = {"close": 0, "fix": 1, "review": 2}


def judge(rows):
    """열린 행 목록을 판정해 {'close': [...], 'fix': [...], 'review': [...]}를 돌려준다."""
    ctx = {"road": Counter(k for k in map(road_key, rows) if k)}
    out = {"close": [], "fix": [], "review": []}
    for row in rows:
        hits = [rule for rule in RULES if rule[3](row, ctx)]
        if not hits:
            continue
        hits.sort(key=lambda rule: ACTION_ORDER[rule[1]])
        action = hits[0][1]
        item = {"id": row["id"], "name": row.get("name"), "source": src_type(row), "category": row.get("category"),
                "slot": row.get("slot"), "address": row.get("address"), "rules": [rule[0] for rule in hits]}
        if action == "fix":
            item["patch"] = {k: v for rule in hits if rule[1] == "fix" for k, v in rule[4].items()}
        out[action].append(item)
    return out


def fetch_open_db():
    collector = os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector")
    env = {}
    with open(os.path.join(collector, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    # 수집기 .env는 컨테이너용 주소라 호스트에서는 127.0.0.1의 중계 서버로 간다
    base = env["SUPABASE_URL"].replace("host.docker.internal", "127.0.0.1").rstrip("/")
    key = env["SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows, last = [], 0
    while True:
        url = f"{base}/rest/v1/spots?select=*&is_closed=eq.false&order=id.asc&id=gt.{last}&limit=1000"
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as res:
            page = json.loads(res.read().decode("utf-8"))
        rows += page
        if len(page) < 1000:
            return rows
        last = page[-1]["id"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", help="행 목록 JSON(없으면 라이브 DB에서 열린 행을 읽는다)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    if args.input:
        rows = [r for r in json.load(open(args.input, encoding="utf-8")) if not r.get("is_closed")]
    else:
        rows = fetch_open_db()
    out = judge(rows)
    counts = Counter(rule for items in out.values() for item in items for rule in item["rules"])
    result = {
        "generated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "input": args.input or "live DB",
        "open_rows": len(rows),
        "rules": [{"id": r[0], "action": r[1], "desc": r[2], "hits": counts[r[0]]} for r in RULES],
        "counts": {k: len(v) for k, v in out.items()},
        **out,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"열린 행 {len(rows)} · 소프트 삭제 {len(out['close'])} · 교정 {len(out['fix'])} · 검토 {len(out['review'])}")
    for r in result["rules"]:
        print(f"  {r['id']} ({r['action']}): {r['hits']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
