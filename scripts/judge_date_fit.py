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
CULTURE_CENTER = re.compile(r"(문화원|평생학습관|교육원|시민회관)(\(.*\))?$")  # 고성문화원(경남)처럼 괄호 꼬리가 붙은 행도 있다
COURSE_ONLY = re.compile(r"^(\[[^\]]*\]\s*)?([가-힣]{0,3}형\s*)?\d*\s*코스(\s*\d+\s*구간)?$")  # [하영올레] 1코스, 하천형코스
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u26FF]")  # 🥃 서울 지역 같은 목록 제목 줄. ➔(U+2794)는 경로 표기라 뺀다
SPORTS_FACILITY = re.compile(r"(체육공원|체육관|체육센터|공설운동장|배드민턴장|인라인스케이트장)$")
CAMPING = re.compile(r"캠핑|글램핑|카라반|야영")
CAMP_NOT_LODGING = re.compile(r"식당|다이닝|카페|레스토랑|고기")  # 북한산 글램핑식당, 베르테라 캠핑(디저트카페)
MALL = re.compile(r"백화점|더현대|스타필드|아울렛|아웃렛|롯데월드몰|타임스퀘어|코엑스몰|IFC몰|AK플라자|갤러리아")
NON_DATE_CATS = {"문화원", "스포츠시설", "도서관", "국공립도서관", "매표소", "공간대여", "주차장", "문화센터"}
BAR_CATS = {"호프,요리주점", "칵테일바", "일본식주점", "와인바", "술집", "실내포장마차", "바(BAR)", "맥주,호프", "포장마차"}
CAFE_CATS = {"카페", "커피전문점", "디저트카페", "제과,베이커리", "테마카페", "갤러리카페", "북카페", "전통찻집", "브런치카페"}
SIDO = {"서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천", "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종",
        "경기": "경기", "강원": "강원", "충청북": "충북", "충북": "충북", "충청남": "충남", "충남": "충남", "전라북": "전북", "전북": "전북",
        "전라남": "전남", "전남": "전남", "경상북": "경북", "경북": "경북", "경상남": "경남", "경남": "경남", "제주": "제주"}
ROAD_ADDR = re.compile(r"^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?![\d가-힣-])")  # 돈화문로11길 30, 11가길 3을 돈화문로11에서 끊지 않는다
# P-047 몰 입점 매장. 낱말 근거와 행별 카카오 판정은 docs/planning/mall-tenant-20261003.json
MALL_WORD = re.compile(r"백화점|더현대|스타필드|아울렛|아웃렛|롯데월드몰|롯데몰|타임스퀘어|코엑스몰|IFC몰|IFC부산|AK플라자|갤러리아|신세계|"
                       r"현대시티몰|아이파크몰|엔터식스|센트럴시티|파미에스테이션|디큐브|NC[가-힣]*점|NC백화점|뉴코아|커넥트현대|타임빌라스|"
                       r"복합쇼핑몰|그랑서울|SFC몰")
MALL_LANDMARK = re.compile(r"컨벤션|파크(?!몰)|아쿠아|별마당|도서관|스몹|뮤지엄|미술관|갤러리|전시|팝업|ALT\.1|아이스링크|스케이트|트램폴린|"
                           r"바운스|레이싱|카트|클라이밍|클라임|서핑|플레이|동물원|주렁주렁|레전드히어로즈|볼링|스파|찜질|CGV|메가박스|시네마|"
                           r"콘서트홀|전망대|서울스카이|공원|서점|아크앤북|교보|영풍|하늘정원|라이티움|CH 1985|문화센터|에비뉴엘 리빙관|마켓")
MALL_LANDMARK_CATS = {"아쿠아리움", "서점", "미술관", "전망대", "워터테마파크", "스케이트장"}
MALL_HOTEL = re.compile(r"호텔|메리어트|페어몬트|콘래드|시그니엘|웨스틴|하얏트|JW")
MALL_BRAND = re.compile(r"롯데|현대|신세계|갤러리아|NC|AK|대백|동아|세이브존|뉴코아|그랜드")
# 몰 이름을 이루는 낱말(몰 낱말, 그룹명, 관 이름, ~점, 지명). 지우고 남는 상호가 없으면 몰 자체다
MALL_SELF = re.compile(r"코엑스|스페이스원|마리오|롯데월드몰|롯데월드타워|롯데몰|롯데|현대|신세계|사이먼|프리미엄|아울렛|아웃렛|백화점|스타필드|"
                       r"롯데월드|쇼핑몰|더현대|빌리지|시티|타워|&|명품관|본관|별관|리빙관|에비뉴엘|글라스빌|타임빌라스|타임스퀘어|센트럴시티|"
                       r"아이파크몰|IFC몰|NC|갤러리아|커넥트현대|파미에스테이션|디큐브|\(.*?\)|\S+점(?=\s|$)|서울|부산|대구|대전|광주|인천|"
                       r"수원|하남|고양|안성|위례|부천|운정|군산|기흥|파주|김포|은평|건대|스타시티|본점|센텀|시흥|의왕|김해|송도|가산|동탄|"
                       r"용산|고척|명동|잠실|여의도|판교|목동|압구정|청담|강남|반포|순천|용인|기장|공항")
# 카카오로 몰 안 매장임을 확인한 36곳만 닫는다. 이름 규칙에 걸려도 확인하지 못한 행은 검토로 보낸다(사이클 38 리드 승인)
MALL_TENANT_VERIFIED = frozenset({
    249, 1750, 2051, 2558, 5155, 6513, 8008, 8530, 1788641038739, 1788789462195, 1788818358733, 1788971737054,
    1788980750753, 1789029388505, 1789096167977, 1789154480008, 1789190572892, 1789219237022, 1789266857586,
    1789415062814, 1789604136098, 1789820868963, 1790121587600, 1790164033747, 1790375337001, 1790393878716,
    1790463094036, 1790474302468, 1790489185704, 1790499422236, 1790618786208, 1790818470427, 1790858489169,
    1790887193036, 1790926387626, 1791012616792})
# 위 36곳의 도로명 주소. 닫힌 뒤에도 같은 주소의 입점 매장(SFC몰의 쇼코엘 등)이 주소 검토에 남게 한다
MALL_ROADS_CLOSED = frozenset({
    "경기 수원시 권선구 세화로 134", "경기 안양시 만안구 만안로 232", "경기 의왕시 바라산로 1", "경기 파주시 와석순환로515번길 70",
    "경기 하남시 미사대로 750", "경기 화성시 동탄구 동탄역로 160", "대전광역시 유성구 테크노중앙로 123", "서울 강남구 도산대로 442",
    "서울 강남구 압구정로 165", "서울 강서구 하늘길 38", "서울 금천구 디지털로10길 9", "서울 금천구 벚꽃로 266", "서울 서초구 사평대로 205",
    "서울 서초구 신반포로 176", "서울 송파구 올림픽로 300", "서울 양천구 목동동로 257", "서울 영등포구 여의대로 108", "서울 은평구 통일로 1050",
    "서울 종로구 종로 33", "서울 중구 세종대로 136", "서울 중구 을지로 30"})


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


def building_part(row):
    """도로명 번지 뒤의 건물·층 표기."""
    a, k = row.get("address") or "", road_key(row)
    return a[len(k):] if k and a.startswith(k) else a


def is_mall_road(row):
    return bool(road_key(row) and (MALL_WORD.search(row.get("name") or "") or MALL_WORD.search(building_part(row))))


def mall_tenant(row, ctx):
    """몰 입점 매장이면 걸린 근거('name'이나 'address'), 몰 자체·몰 안 목적지·호텔·몰 밖 상호면 None."""
    name = row.get("name") or ""
    by_name, by_bldg = bool(MALL_WORD.search(name)), bool(MALL_WORD.search(building_part(row)))
    if not (by_name or by_bldg or road_key(row) in ctx["mall_road"]):
        return None
    if re.search(r"(뒤|앞|옆|근처)\s", name) or (by_name and re.search(r"[가-힣]백화점", name) and not MALL_BRAND.search(name)):
        return None  # 롯데백화점 뒤 미식야장거리, 안주백화점
    rest = name
    for _ in range(3):
        rest = MALL_SELF.sub(" ", rest)
    if not re.sub(r"[\s\d·,\-]+", "", rest):
        return None  # 몰 자체
    if MALL_LANDMARK.search(name) or row.get("category") in MALL_LANDMARK_CATS:
        return None
    if MALL_HOTEL.search(f"{name} {row.get('address') or ''}"):
        return None
    if not by_name and not by_bldg and "타워" in (row.get("address") or ""):
        return None  # 롯데월드타워 식당은 몰이 아니다
    return "name" if by_name else "address"


def no_period_event(row):
    return (row.get("category") in EVENT_CATS and not (row.get("source") or {}).get("event")
            and bool(EVENT_WORD.search(row.get("name") or "")))


# (id, action, 설명, 판정 함수(row, ctx), patch). ctx는 전체 열린 행에서 미리 센 값이다.
RULES = [
    ("R4_기간없는_행사", "close", "축제/행사·페스티벌 카테고리이고 source.event가 없으며 이름에 행사어가 있다(web 제외). 43/43 기간 한정 행사",
     lambda r, c: no_period_event(r) and src_type(r) != "web", None),
    ("R9_tourapi_지방문화원", "close", "출처 tourapi이고 이름이 문화원·평생학습관·교육원·시민회관으로 끝난다(괄호 꼬리 허용). 121곳 전수가 해당 시설",
     lambda r, c: src_type(r) == "tourapi" and bool(CULTURE_CENTER.search((r.get("name") or "").strip())), None),
    ("R14_제목줄_코스번호", "close", "이름에 이모지가 있거나 이름이 코스 번호뿐이다. 6곳 전수에 장소 이름이 없다",
     lambda r, c: bool(EMOJI.search(r.get("name") or "") or COURSE_ONLY.match((r.get("name") or "").strip())), None),
    ("R6c_몰_입점매장", "close", "이름에 몰 낱말이 있고 몰 이름을 지워도 상호가 남는 입점 매장 가운데 카카오로 몰 안임을 확인한 36곳. 판정 36곳 정밀도 100%",
     lambda r, c: mall_tenant(r, c) == "name" and r["id"] in MALL_TENANT_VERIFIED, None),
    ("R13_캠핑_낮슬롯", "fix", "이름이나 카테고리에 캠핑·글램핑·카라반·야영이 있고 슬롯 day. 식당·카페는 뺀다. 표본 교정 2/2",
     lambda r, c: r.get("slot") == "day" and bool(CAMPING.search(r.get("name") or "") or CAMPING.search(r.get("category") or ""))
     and not CAMP_NOT_LODGING.search(f"{r.get('name') or ''} {r.get('category') or ''}"),
     {"slot": "stay"}),
    ("R4w_기간없는_행사_web", "review", "R4와 같은 조건의 web 행. 상설 장소가 섞여 있다(궁남지 등)",
     lambda r, c: no_period_event(r) and src_type(r) == "web", None),
    ("R2_출처지역_불일치", "review", "캐치테이블 검색어나 영상 제목의 시·도가 주소의 시·도와 다르다. 전수 판정 74%",
     lambda r, c: bool(source_sidos(r)) and sido_of_address(r) is not None and sido_of_address(r) not in source_sidos(r), None),
    ("R6_백화점_몰_입점", "review", "이름이나 주소에 백화점·더현대·스타필드·아울렛 등. 보충 58%, 별마당도서관 같은 명소가 섞임",
     lambda r, c: bool(MALL.search(r.get("name") or "") or MALL.search(r.get("address") or "")), None),
    ("R6c_몰_입점매장_미확인", "review", "R6c 조건의 이름 규칙 행 가운데 카카오로 확인하지 못한 행과 주소로만 몰에 걸린 행. 주소로만 걸린 23곳은 판정 14곳 중 7곳이 몰 밖",
     lambda r, c: mall_tenant(r, c) is not None and r["id"] not in MALL_TENANT_VERIFIED, None),
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
    ctx = {"road": Counter(k for k in map(road_key, rows) if k), "mall_road": MALL_ROADS_CLOSED | {road_key(r) for r in rows if is_mall_road(r)}}
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


def connect():
    """라이브 DB 주소와 헤더. OCI 호스트에서 COLLECTOR_DIR의 .env를 읽는다."""
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
    return base, {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def fetch_open_db():
    base, headers = connect()
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
