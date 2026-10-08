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
import math
import os
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
from youtube_vlog_miner import METRO_REGIONS, extract_region_hints  # noqa: E402
from heal_and_verify_spots import clean_spot_name, is_place_name_only, strip_address_tail  # noqa: E402

EVENT_CATS = {"축제/행사", "페스티벌"}
EVENT_WORD = re.compile(r"축제|페스티벌|페스타|문화제|야행|잔치|마라톤|박람회|한마당|놀이마당|문화대전|페스트")
CULTURE_CENTER = re.compile(r"(문화원|평생학습관|교육원|시민회관)(\(.*\))?$")  # 고성문화원(경남)처럼 괄호 꼬리가 붙은 행도 있다
COURSE_ONLY = re.compile(r"^(\[[^\]]*\]\s*)?([가-힣]{0,3}형\s*)?\d*\s*코스(\s*\d+\s*구간)?$")  # [하영올레] 1코스, 하천형코스
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u26FF]")  # 🥃 서울 지역 같은 목록 제목 줄. ➔(U+2794)는 경로 표기라 뺀다
SPORTS_FACILITY = re.compile(r"(체육공원|체육관|체육센터|공설운동장|배드민턴장|인라인스케이트장)$")
# P-057: 수집기 tourapi 관문과 같은 이름 규칙(collector/miners/tourapi_miner.py).
# P-063: 열린 행 251곳 판정(docs/planning/golf-fishing-relic-20261004.json)으로 닫기로 올리고 애매한 행만 검토에 남긴다
GOLF = re.compile(r"(?<!미니)골프|컨트리\s*클럽|(CC|GC|C\.C)(?![A-Za-z])", re.IGNORECASE)
FISHING = re.compile(r"낚시|피싱|좌대")
MONUMENT = re.compile(r"(비|비석|비각|묘|고인돌|당간지주|귀부 및 이수|각서석|남근석|정려각|효각|열녀문|홍살문|당산|부도|석장승|석등|"
                      r"충혼탑|기념탑)(\s*\(.*\))?$")
MONUMENT_KEEP = re.compile(r"^(종묘|문묘|동묘)$|나비$|갈비$|도깨비$|바람개비$")
# P-067 단독 유교 시설. 카카오 장소 패널 수치는 DB 행에 없어 패널을 확인한 165곳을 id 목록으로 닫고 나머지는 검토로 보낸다
CONFUCIAN = re.compile(r"(서원|향교|서당|영당|재실|종택|사당|묘각)(\s*\(.*\))?$")
CONFUCIAN_NOT = re.compile(r"의사당(\s*\(.*\))?$")  # 국회의사당
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r21_confucian_close_ids.json"), encoding="utf-8") as _f:
    R21_VERIFIED = frozenset(int(k) for k in json.load(_f)["rows"])
# P-071 도매 시설·전문 상가. 카카오 패널과 네이버 수치로 판정한 25곳을 id 목록으로 닫고, 이름 조건만 맞는 나머지(경계 3곳과 찾아가는 도매시장)는 검토로 보낸다
WHOLESALE = re.compile(r"도매시장|농산물|농수산물|청과|축산물|화훼|집하장|유통단지|도매상가|상가(\s*\(.*\))?$")
WHOLESALE_NOT = re.compile(r"지하도상가|고미술|악기|전자|세운")
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r24_wholesale_close_ids.json"), encoding="utf-8") as _f:
    R24_VERIFIED = frozenset(int(k) for k in json.load(_f)["rows"])
GOLF_RELIC_KEEP = frozenset({1790667560577, 1790456834079, 1790307190897})  # 리베라CC, 서산수골프앤리조트, 경주 김유신묘
FISHING_KEEP = re.compile(r"실내|바다낚시터|좌대|캠핑")  # 실내낚시터는 데이트, 관리형 바다낚시터·좌대·캠핑장은 애매
CAMPING = re.compile(r"캠핑|글램핑|카라반|야영")
LEISURE_CAMP = re.compile(r"캠프|펜션")  # P-057: tourapi 레포츠/체험 유형만. 캠프그리브스(관광지), 소금강행복펜션마트(쇼핑)는 다른 유형
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
# P-048 동네 식당. 네이버 리뷰 수와 사람 판정은 docs/planning/neighborhood-restaurant-20261003.json
DINER_WORD = re.compile(r"밥집|백반|기사식당|김밥|국밥|해장국|순대국|감자탕|도시락|분식")
DINER_CATS = {"분식", "국밥", "순대", "해장국", "도시락", "김밥", "기사식당", "백반"}
# 규칙 조건(밀도 20 미만, 네이버 방문자 리뷰 500 미만·블로그 3,000 미만)에 걸린 40곳에서 사람이 남긴 2곳(경모네젓갈백반, 달콤언니)을 뺀 38곳
DINER_VERIFIED = frozenset({
    1788633487519, 1788640891090, 1788770926445, 1788820160901, 1789087394161, 1789167095870, 1789206855782,
    1789309007164, 1789500794466, 1789604190343, 1789613219376, 1789675658198, 1789699375367, 1789775546470,
    1789797243933, 1789828135555, 1789885634448, 1789983155559, 1790031216411, 1790060020333, 1790121644060,
    1790163826601, 1790366260323, 1790481379597, 1790486545422, 1790486545943, 1790487092939, 1790489171300,
    1790491270644, 1790499399998, 1790502068725, 1790543264271, 1790552284788, 1790617417106, 1790716549046,
    1790727280198, 1790727282649, 1791020195793})
DINER_MEASURED_MAX_ID = 1791020195793  # 네이버로 잰 열린 행의 마지막 id. 이보다 뒤에 들어온 행은 측정값이 없다
# P-050 출처 지역 오매칭. 행별 카카오 판정은 docs/planning/region-mismatch-20261003.json
# 카카오로 출처 장소가 아님을 확인한 9곳. 기계 조건 정밀도가 95%에 못 미쳐(최고 93%) id 목록으로 닫는다
REGION_MISMATCH_VERIFIED = frozenset({
    1788820160544, 1789974245787, 1790499400846, 1790716559054, 1790734822167, 1790758673091, 1791020195793,
    1791020198770, 1791020201766})
# P-068 일상 식당 저밀도 저리뷰. 사람 판정 35곳(동네 식당 24, 애매 11)과 근거는 docs/planning/p068-everyday-diner-20261008.json
R22_SOURCES = frozenset({"blog_mining", "catchtable_miner", "auto_discovery", "community_miner"})  # web과 영상 출처는 뺀다
R22_CATS = frozenset({"한식", "국수", "칼국수", "중식", "중국요리", "돈까스,우동", "곰탕", "설렁탕", "찌개,전골", "불고기,두루치기", "쌈밥",
                      "닭요리", "냉면", "두부전문점", "매운탕,해물탕", "순대", "치킨", "오리"})
R22_RADIUS_M, R22_MAX_NEIGHBORS, R22_MAX_KAKAO_REVIEWS = 500, 9, 30
HINT_COMPOUND = re.compile(r"성수기|세종마을|안양천|안산자락길|민락2지구|송도암남")  # 힌트 사전이 앞부분을 지명으로 읽는 낱말
INCHEON_REORG = {"중구": "제물포구", "동구": "제물포구"}  # 2026 인천 개편 뒤 주소를 힌트 사전이 모른다
# P-055 공공시설. 행별 카카오 판정과 남김·보류 목록은 docs/planning/public-facility-20261004.json
# 사람이 판정하고 카카오로 확인한 동네 공공도서관 70곳과 체육·주민·교육·복지 시설 28곳. 이름 규칙은 정밀도 90.7%라 id 목록으로 닫는다
PUBLIC_FACILITY_VERIFIED = frozenset({
    8065, 1788818277484, 1788818277759, 1788818281939, 1788818282996, 1788818283248, 1788818283394, 1788908657087,
    1788908657366, 1788908657382, 1788908659295, 1788908659716, 1788908660952, 1788908664608, 1788908665059,
    1788908666193, 1788939167956, 1788939168622, 1788953620017, 1788953620086, 1788953627459, 1788953627983,
    1788953628555, 1789031308928, 1789031309541, 1789031309908, 1789031309923, 1789199398244, 1789491695384,
    1789613288987, 1789640906369, 1790034580643, 1790209621658, 1790243904406, 1790243904410, 1790243909830,
    1790243909837, 1790261918245, 1790261923645, 1790261924713, 1790261924717, 1790261926286, 1790261926301,
    1790292416217, 1790307185170, 1790307192931, 1790311908500, 1790311908527, 1790326399283, 1790326399320,
    1790326399324, 1790340830020, 1790340830025, 1790340830030, 1790340830047, 1790340833183, 1790340837469,
    1790340837473, 1790340837477, 1790340837481, 1790400943609, 1790402943367, 1790410164633, 1790410164649,
    1790410164664, 1790410164679, 1790410164782, 1790410164797, 1790410167947, 1790410168028, 1790410172524,
    1790434555117, 1790434555294, 1790447745767, 1790447745937, 1790447746505, 1790459432472, 1790459457482,
    1790463093652, 1790532208014, 1790532209853, 1790562712346, 1790562713324, 1790562714288, 1790562716231,
    1790593469280, 1790623872960, 1790638644242, 1790683614249, 1790689591851, 1790714515220, 1790714525885,
    1790854395367, 1790854398230, 1790916070111, 1790931902340, 1791020197293, 1791034030929})
# 명소로 남긴 42곳(별마당도서관, 정독도서관, 장충체육관 등). 이름 규칙에 걸려도 검토로 보내지 않는다
PUBLIC_FACILITY_KEEP = frozenset({
    533, 2334, 2454, 2461, 2476, 2481, 3131, 4202, 4306, 4883, 5994, 6078, 1788641113388, 1788649644715,
    1788914039241, 1788942941596, 1789105478862, 1789136072632, 1789545765162, 1789551321217, 1789789809967,
    1790022147401, 1790258774461, 1790261923614, 1790261923621, 1790261923633, 1790261924709, 1790340837464,
    1790371664465, 1790386509374, 1790434555174, 1790459444979, 1790459520030, 1790481410030, 1790486509797,
    1790486563018, 1790525133133, 1790562698514, 1790578752798, 1790593467328, 1790707557898, 1790707558170})
PUBLIC_FACILITY = re.compile(r"도서관(\(.*\))?$|체육센터|체육관|공설운동장|구민운동장|실내수영장|체력인증센터|평생학습|평생교육|학생교육문화|"
                             r"복지회관|여성회관|노인회|주민센터|연수원")
# P-049 설명형 이름 모집단: 내보낸 이름이 3어절 이상이거나 이 표시를 담는다
DESCRIBED_MARK = re.compile(r"[&·+/]|\s및\s|\sin\s")
# P-058 층 A: 카카오 장소 이름이 내보낸 이름과 같고 300m 안인 398곳과 그때의 내보낸 이름. 이름이 바뀐 행은 다시 R5로 간다
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r5_map_name_exempt.json"), encoding="utf-8") as _f:
    R5_MAP_NAME_EXEMPT = {int(k): v for k, v in json.load(_f)["rows"].items()}
# P-064: R3 같은 주소 전수에서 사람이 남긴 116곳과 그때의 도로명 주소. 주소가 바뀐 행과 새로 든 행은 다시 R3로 간다
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r3_same_address_exempt.json"), encoding="utf-8") as _f:
    R3_SAME_ADDRESS_EXEMPT = {int(k): v for k, v in json.load(_f)["rows"].items()}


def export_name(row):
    """sync_live_spots 내보내기가 화면에 내는 이름(heal_all_spots의 상호명 정제와 같다)."""
    name, address = row.get("name") or "", row.get("address") or ""
    cleaned = strip_address_tail(clean_spot_name(name), address)
    return name if is_place_name_only(cleaned, address) else cleaned


def described_name(row):
    name = export_name(row)
    return len(name.split()) >= 3 or bool(DESCRIBED_MARK.search(name))


def map_name_exempt(row):
    return R5_MAP_NAME_EXEMPT.get(row["id"]) == export_name(row)


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
    """캐치테이블 출처 메모의 검색어에 나온 시·도. 광주는 경기 광주와 겹쳐 뺀다."""
    if src_type(row) != "catchtable_miner":
        return set()
    text = note(row).split("query:", 1)[-1]
    return {v for k, v in SIDO.items() if k != "광주" and re.search(rf"(^|[\s(]){k}", text)}


def video_title(row):
    """영상 전체 제목. social_links.youtube가 출처 영상이면 그 제목, 아니면 note의 잘린 제목."""
    yt, s = (row.get("social_links") or {}).get("youtube") or {}, row.get("source") or {}
    if yt.get("title") and yt.get("url") == s.get("url"):
        return yt["title"]
    m = re.search(r"유튜브 \((.*)", note(row))
    return m.group(1).split(") | ")[0] if m else ""  # 뒤에 덧붙은 처리 기록(| relocated: ...)은 제목이 아니다


def hint_matches(hint, row):
    a = row.get("address") or ""
    if hint in METRO_REGIONS:
        return sido_of_address(row) == hint or hint in a or (hint == "광주" and sido_of_address(row) == "전남")
    if hint == "영종구":
        return "영종구" in a or bool(re.search(r"인천 중구 (운서|운남|운북|중산|을왕|남북|덕교)동", a))
    return hint in a or (a.startswith("인천") and hint in INCHEON_REORG and INCHEON_REORG[hint] in a)


def video_region_mismatch(row):
    """영상 제목의 지역 힌트(수집기 extract_region_hints)가 주소의 시·도와 시군구 어디에도 맞지 않는 youtube_vlog 행.
    힌트 사전이 다른 낱말의 앞부분을 읽은 제목과 힌트가 상호 안에 있는 행은 뺀다."""
    if src_type(row) != "youtube_vlog":
        return False
    text = video_title(row)
    hints = extract_region_hints(text) if text else []
    if not hints or any(hint_matches(h, row) for h in hints) or HINT_COMPOUND.search(text):
        return False
    name = row.get("name") or ""
    return not any(h in name or (len(h) > 2 and h[-1] in "시군구" and h[:-1] in name) for h in hints)


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


def neighborhood_diner(row):
    """동네 식당 패턴(밥집·김밥·국밥 등 이름이나 분식·국밥 등 카테고리)에 걸리는 web 밖 행. 햄버거와 초밥은 뺀다."""
    name, cat = row.get("name") or "", row.get("category") or ""
    return (bool(DINER_WORD.search(name) or cat in DINER_CATS) and "햄버거" not in f"{name} {cat}" and "초밥" not in name
            and src_type(row) != "web")


def kakao_review_count(row):
    count = ((row.get("social_links") or {}).get("kakaomap") or {}).get("review_count")
    return count if isinstance(count, int) else None


def neighbor_counts(rows, radius_m=R22_RADIUS_M):
    """행마다 radius_m 안의 다른 행 수. 좌표가 없는 행은 세지도 않고 키도 없다."""
    step = radius_m / 111_000  # 위도 1도 약 111km. 격자 한 칸이 반경 이상이라 이웃 칸 아홉 개만 본다
    lng_step = step / 0.77  # 북위 39.6도의 cos. 한반도 북단까지 경도 한 칸이 반경 이상이다
    grid = {}
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            grid.setdefault((int(r["lat"] // step), int(r["lng"] // lng_step)), []).append(r)
    out = {}
    for (gy, gx), cell in grid.items():
        near = [o for dy in (-1, 0, 1) for dx in (-1, 0, 1) for o in grid.get((gy + dy, gx + dx), ())]
        for r in cell:
            cos = math.cos(math.radians(r["lat"]))
            out[r["id"]] = sum(o["id"] != r["id"] and math.hypot((o["lat"] - r["lat"]) * 111_000, (o["lng"] - r["lng"]) * 111_000 * cos)
                               <= radius_m for o in near)
    return out


def everyday_diner_sparse(row, ctx):
    """R22: 출처가 큐레이션 밖이고 일상 식사 카테고리이며 R15 이름 패턴 밖이고, 500m 안 열린 행이 적고 카카오 저장 리뷰가 적다."""
    reviews = kakao_review_count(row)
    return (src_type(row) in R22_SOURCES and row.get("category") in R22_CATS and not DINER_WORD.search(row.get("name") or "")
            and ctx["near"].get(row["id"], R22_MAX_NEIGHBORS + 1) <= R22_MAX_NEIGHBORS
            and reviews is not None and reviews <= R22_MAX_KAKAO_REVIEWS)


def solo_confucian(row, ctx):
    """R21: 출처 tourapi, 유형 관광지이고 이름이 서원·향교 등으로 끝나며 500m 안에 다른 열린 행이 없다. 좌표가 없는 행은 걸리지 않는다."""
    name = (row.get("name") or "").strip()
    return (src_type(row) == "tourapi" and row.get("category") == "관광지" and bool(CONFUCIAN.search(name)) and not CONFUCIAN_NOT.search(name)
            and ctx["near"].get(row["id"], 1) == 0)


def tourapi_wholesale(row):
    name = (row.get("name") or "").strip()
    return (src_type(row) == "tourapi" and row.get("category") == "쇼핑/소품" and bool(WHOLESALE.search(name))
            and not WHOLESALE_NOT.search(name))


def tourapi_golf(row):
    return src_type(row) == "tourapi" and row.get("category") == "레포츠/체험" and bool(GOLF.search(row.get("name") or ""))


def tourapi_fishing(row):
    return src_type(row) == "tourapi" and row.get("category") == "레포츠/체험" and bool(FISHING.search(row.get("name") or ""))


def tourapi_monument(row):
    name = (row.get("name") or "").strip()
    return (src_type(row) == "tourapi" and row.get("category") == "관광지" and bool(MONUMENT.search(name))
            and not MONUMENT_KEEP.search(name))


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
    ("R15_동네_식당", "close", "밥집·김밥·국밥 등 일상 식사 패턴에 걸리고 500m 안 열린 행 20곳 미만, 네이버 방문자 리뷰 500·블로그 3,000 미만인 "
     "web 밖 행 가운데 사람이 동네 식당으로 판정한 38곳. 정밀도 38/40(95.0%)",
     lambda r, c: neighborhood_diner(r) and r["id"] in DINER_VERIFIED, None),
    ("R2c_출처지역_오매칭", "close", "영상 제목이나 검색어의 지역과 주소가 다르고 카카오로 출처 장소가 아님을 확인한 9곳. 판정 9/9",
     lambda r, c: r["id"] in REGION_MISMATCH_VERIFIED, None),
    ("R17_공공시설", "close", "동네 공공도서관과 체육·주민·교육·복지 공공시설 가운데 사람이 판정하고 카카오로 확인한 98곳. 판정 98/98",
     lambda r, c: r["id"] in PUBLIC_FACILITY_VERIFIED, None),
    ("R18_tourapi_골프장", "close", "출처 tourapi, 유형 레포츠/체험이고 이름에 골프·CC·GC·컨트리클럽이 있다(미니골프 제외). "
     "열린 행 전수 판정 96/98(P-063), 애매 2곳은 R18 보류로 뺀다",
     lambda r, c: tourapi_golf(r) and r["id"] not in GOLF_RELIC_KEEP, None),
    ("R19_tourapi_낚시터", "close", "출처 tourapi, 유형 레포츠/체험이고 이름에 낚시·피싱·좌대가 있으며 실내·바다낚시터·좌대·캠핑은 없다. "
     "열린 행 전수 판정 70/70(P-063)",
     lambda r, c: tourapi_fishing(r) and not FISHING_KEEP.search(r.get("name") or ""), None),
    ("R20_tourapi_단독유물", "close", "출처 tourapi, 유형 관광지이고 이름이 비·묘·당간지주·고인돌·충혼탑 등으로 끝난다(석탑·석불 제외, "
     "종묘 등 제외). 열린 행 전수 판정 73/74(P-063), 애매 1곳은 R20 보류로 뺀다",
     lambda r, c: tourapi_monument(r) and r["id"] not in GOLF_RELIC_KEEP, None),
    ("R21_단독_유교시설", "close", "출처 tourapi, 유형 관광지이고 이름이 서원·향교·서당·영당·재실·종택·사당·묘각으로 끝나며(의사당 제외) "
     "500m 안 다른 열린 행이 0곳이고, 카카오 장소 패널이 사진 400장 미만·카카오맵 후기 5건 미만·블로그 후기 30건 미만인 165곳(P-067). "
     "표본 60곳 오탐 0",
     lambda r, c: solo_confucian(r, c) and r["id"] in R21_VERIFIED, None),
    ("R24_도매시설_전문상가", "close", "출처 tourapi, 유형 쇼핑/소품이고 이름이 도매시장·농산물·농수산물·청과·축산물·화훼·집하장·유통단지·도매상가나 상가로 끝나며"
     "(지하도상가·고미술·악기·전자·세운 제외), 카카오 패널이 있으면 블로그 후기 30건 미만·사진 400장 미만이고 네이버 같은 이름 장소의 "
     "방문자 리뷰 100건 미만·블로그 리뷰 500건 미만인 25곳(P-071). 28곳 전수 판정 오탐 0, 경계 3곳은 뺀다",
     lambda r, c: tourapi_wholesale(r) and r["id"] in R24_VERIFIED, None),
    ("R13_캠핑_낮슬롯", "fix", "이름이나 카테고리에 캠핑·글램핑·카라반·야영이 있거나 tourapi 레포츠/체험 이름에 캠프·펜션이 있고 슬롯 day. "
     "식당·카페는 뺀다. 표본 교정 2/2",
     lambda r, c: r.get("slot") == "day" and bool(CAMPING.search(r.get("name") or "") or CAMPING.search(r.get("category") or "")
                                                  or (src_type(r) == "tourapi" and r.get("category") == "레포츠/체험"
                                                      and LEISURE_CAMP.search(r.get("name") or "")))
     and not CAMP_NOT_LODGING.search(f"{r.get('name') or ''} {r.get('category') or ''}"),
     {"slot": "stay"}),
    ("R4w_기간없는_행사_web", "review", "R4와 같은 조건의 web 행. 상설 장소가 섞여 있다(궁남지 등)",
     lambda r, c: no_period_event(r) and src_type(r) == "web", None),
    ("R2_출처지역_불일치", "review", "캐치테이블 검색어의 시·도가 주소의 시·도와 다르거나, 영상 제목의 지역 힌트가 주소와 맞지 않는다. "
     "영상 44곳 판정에서 출처 장소가 아닌 행 39%",
     lambda r, c: (bool(source_sidos(r)) and sido_of_address(r) is not None
                   and sido_of_address(r) not in source_sidos(r)) or video_region_mismatch(r), None),
    ("R6_백화점_몰_입점", "review", "이름이나 주소에 백화점·더현대·스타필드·아울렛 등. 보충 58%, 별마당도서관 같은 명소가 섞임",
     lambda r, c: bool(MALL.search(r.get("name") or "") or MALL.search(r.get("address") or "")), None),
    ("R6c_몰_입점매장_미확인", "review", "R6c 조건의 이름 규칙 행 가운데 카카오로 확인하지 못한 행과 주소로만 몰에 걸린 행. 주소로만 걸린 23곳은 판정 14곳 중 7곳이 몰 밖",
     lambda r, c: mall_tenant(r, c) is not None and r["id"] not in MALL_TENANT_VERIFIED, None),
    ("R15_동네_식당_미측정", "review", "R15 패턴에 걸리지만 네이버 리뷰 수를 재기 전에 들어온 행",
     lambda r, c: neighborhood_diner(r) and r["id"] > DINER_MEASURED_MAX_ID, None),
    ("R17_공공시설_미확인", "review", "이름 끝이 도서관이거나 이름에 체육센터·체육관·실내수영장·평생학습·주민센터 등 공공시설 낱말이 있고 "
     "R17 닫기와 남김 목록에 없는 행. 이름 규칙 정밀도 90.7%",
     lambda r, c: bool(PUBLIC_FACILITY.search((r.get("name") or "").strip()))
     and r["id"] not in PUBLIC_FACILITY_VERIFIED and r["id"] not in PUBLIC_FACILITY_KEEP, None),
    ("R22_일상식당_저밀도_저리뷰", "review", "큐레이션 밖 출처(blog_mining·catchtable_miner·auto_discovery·community_miner)의 일상 식사 카테고리 18종이고 "
     "R15 이름 패턴 밖이며 500m 안 다른 열린 행 10곳 미만, 카카오 저장 리뷰 30 이하. 네이버 조건이 없어 35곳 중 24곳만 동네 식당이고 "
     "6곳은 데이트 맞는 식당이 걸린다(P-068). 닫은 24곳 밖은 사람이 본다",
     everyday_diner_sparse, None),
    ("R3_같은주소_5행이상", "review", "도로명 주소(번지까지)가 같은 열린 행이 5곳 이상. 보충 25%. "
     "사람이 지도로 보고 남긴 116곳(P-064, r3_same_address_exempt.json)은 그때 주소 그대로면 뺀다",
     lambda r, c: road_key(r) is not None and c["road"][road_key(r)] >= 5 and R3_SAME_ADDRESS_EXEMPT.get(r["id"]) != road_key(r), None),
    ("R8_시장", "review", "카테고리 시장. 보충 25%, 주관 판정", lambda r, c: r.get("category") == "시장", None),
    ("R10_tourapi_체육시설", "review", "출처 tourapi이고 이름이 체육공원·체육관·공설운동장 등으로 끝난다. 공원형이 섞임",
     lambda r, c: src_type(r) == "tourapi" and bool(SPORTS_FACILITY.search((r.get("name") or "").strip())), None),
    ("R18_tourapi_골프장_보류", "review", "R18 조건이지만 사람이 애매로 판정한 2곳(리베라CC, 서산수골프앤리조트)",
     lambda r, c: tourapi_golf(r) and r["id"] in GOLF_RELIC_KEEP, None),
    ("R19_tourapi_낚시터_제외", "review", "R19 조건이지만 이름에 실내·바다낚시터·좌대·캠핑이 있다. 판정 9곳 중 데이트 1, 애매 8",
     lambda r, c: tourapi_fishing(r) and bool(FISHING_KEEP.search(r.get("name") or "")), None),
    ("R20_tourapi_단독유물_보류", "review", "R20 조건이지만 사람이 애매로 판정한 1곳(경주 김유신묘)",
     lambda r, c: tourapi_monument(r) and r["id"] in GOLF_RELIC_KEEP, None),
    ("R21_단독_유교시설_미확인", "review", "R21 조건이지만 카카오 장소 패널 수치로 확인한 165곳 밖이다. 패널이 없는 41곳은 인기를 모르고 "
     "광주향교·도남서원·예연서원은 사진이나 후기가 많아 뺐다(P-067)",
     lambda r, c: solo_confucian(r, c) and r["id"] not in R21_VERIFIED, None),
    ("R24_도매시설_전문상가_미확인", "review", "R24 이름 조건이지만 닫은 25곳 밖이다. 경계 3곳(남포동건어물도매시장·동대문종합시장 한복상가·신사상가)과 "
     "네이버 방문자나 카카오 후기가 많아 뺀 도매시장 20곳(가락농수산물종합도매시장·노량진수산물도매시장 등)과 새로 든 행(P-071)",
     lambda r, c: tourapi_wholesale(r) and r["id"] not in R24_VERIFIED, None),
    ("R1_비데이트_카테고리", "review", "카테고리가 문화원·스포츠시설·도서관·매표소·공간대여 등. 대부분 카테고리만 틀린 명소",
     lambda r, c: r.get("category") in NON_DATE_CATS, None),
    ("R5_설명형_이름", "review", "내보낸 이름이 3어절 이상이거나 &·+/, 및, in을 담는다. 자동 이름 교정은 하지 않는다(P-049 드라이런 정밀도 2/5). "
     "핵심 이름이 500m 안에 없는 행은 R16 지도 검색 불가 검사(check_map_unfindable.py)로 넘긴다. "
     "카카오 장소 이름과 같은 403곳(P-058 층 A 398곳과 교정 뒤 조건에 맞은 5곳, r5_map_name_exempt.json)은 뺀다",
     lambda r, c: described_name(r) and not map_name_exempt(r), None),
    ("R11_술집_낮슬롯", "review", "주점류 카테고리인데 슬롯 day", lambda r, c: r.get("category") in BAR_CATS and r.get("slot") == "day", None),
    ("R12_카페_밤슬롯", "review", "카페류 카테고리인데 슬롯 night", lambda r, c: r.get("category") in CAFE_CATS and r.get("slot") == "night", None),
]
ACTION_ORDER = {"close": 0, "fix": 1, "review": 2}


def judge(rows):
    """열린 행 목록을 판정해 {'close': [...], 'fix': [...], 'review': [...]}를 돌려준다."""
    ctx = {"near": neighbor_counts(rows), "road": Counter(k for k in map(road_key, rows) if k), "mall_road": MALL_ROADS_CLOSED | {road_key(r) for r in rows if is_mall_road(r)}}
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
