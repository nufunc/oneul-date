#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 (oneul-date) — 한국관광공사 TourAPI 4.0 공공데이터 마이너 (TourAPI Miner)
전국 250개 시·군·구의 문화시설(14), 관광지(12), 축제(15), 레포츠(28), 쇼핑(38) 데이터를
정형 API로 수집하여 낮(day) 슬롯의 고품질 데이트 명소를 대량 확충합니다.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import re
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase_worker import (load_env, derive_region_area, find_duplicate_spot, normalize_spot_address, sanitize_spot, new_spot_id,
                             insert_spots, _near_fn, KAKAO_REST_API_KEY)
from category_filter import is_date_spot_category
from event_period import fetch_event_period
from tour_fee import fee_fields, fetch_intro, hours_fields, parse_closed_days
from tourapi_quota import TourApiFetchFailed, TourApiRateLimited, tour_get_json, usage_today

KST = timezone(timedelta(hours=9))

# TourAPI 4.0 엔드포인트 (KorService2 국문 관광정보 서비스)
TOUR_API_BASE = os.getenv("TOUR_API_BASE") or "https://apis.data.go.kr/B551011/KorService2"

# 데이트 적합 콘텐츠 타입
# 12: 관광지, 14: 문화시설, 15: 축제공연행사, 28: 레포츠, 32: 숙박, 38: 쇼핑, 39: 음식점
DATE_CONTENT_TYPES = [
    ("14", "문화시설", ["healing", "romantic"], "day"),
    ("12", "관광지", ["view", "healing"], "day"),
    ("28", "레포츠/체험", ["active"], "day"),
    ("38", "쇼핑/소품", ["trendy"], "day"),
    ("15", "축제/행사", ["romantic", "trendy"], "evening"),
    # 서울·제주에 숙소가 적어 추가했다(2026-09-30). 좌표는 공식 데이터로 바로 받는다
    ("32", "숙박", ["romantic", "healing"], "stay"),
]

# 숙박 중 데이트 코스로 추천하지 않는 저가 단기 숙박: 모텔·여관·호스텔(category_filter의 숙박 예외와 같은 기준).
# TourAPI 분류(cat3)는 쓰지 않는다. 포도호텔이 모텔(B02010900)로 분류돼 있어 좋은 곳까지 걸러진다(2026-09-30)
LODGING_SKIP_NAME = re.compile(r"모텔|여관|호스텔|hostel", re.IGNORECASE)
# 레포츠/체험 유형의 캠핑장은 기본 슬롯 day로 들어가 낮 코스에 섞였다(2026-10-03 사이클 36: 215곳). 숙소로 둔다
CAMPSITE_NAME = re.compile(r"캠핑|글램핑|카라반|야영")
# 문화시설 유형의 지방문화원·평생학습관·교육원·시민회관은 강좌·행정 시설이다(2026-10-03 사이클 36: 121곳).
# 공용 필터에 넣으면 다른 수집기의 성심당문화원(빵집)까지 막혀 이 유형에서만 거른다. 정독도서관 같은 명소가 있어 도서관은 막지 않는다
PUBLIC_FACILITY_NAME = re.compile(r"(문화원|평생학습관|교육원|시민회관)(\(.*\))?$")
# 레포츠/체험 유형의 캠프·펜션도 숙소다(2026-10-04 P-057: 하늘그린캠프, 학마을캠프펜션이 day로 들어옴).
# 다른 유형에는 캠프그리브스(관광지), 소금강행복펜션마트(쇼핑)가 있어 이 유형에서만 본다
LEISURE_LODGING_NAME = re.compile(r"캠프|펜션")
# 데이트 코스로 추천하지 않는 레포츠/체험 유형: 골프장, 낚시터(P-057 열린 행 96곳, 77곳). 보광미니골프장은 남긴다
GOLF_NAME = re.compile(r"(?<!미니)골프|컨트리\s*클럽|(CC|GC|C\.C)(?![A-Za-z])", re.IGNORECASE)
FISHING_NAME = re.compile(r"낚시|피싱|좌대")
# 관광지 유형의 단독 비석·묘·당간지주 같은 유물(P-057). 석탑·석불은 골굴사 마애여래좌상 같은 명소가 섞여 거르지 않는다.
# 이름 끝만 보므로 묘적사·묘각사 같은 사찰은 걸리지 않고, 종묘·문묘·동묘는 명소라 남긴다
MONUMENT_NAME = re.compile(r"(비|비석|비각|묘|고인돌|당간지주|귀부 및 이수|각서석|남근석|정려각|효각|열녀문|홍살문|당산|부도|석장승|석등|"
                           r"충혼탑|기념탑)(\s*\(.*\))?$")
MONUMENT_KEEP = re.compile(r"^(종묘|문묘|동묘)$|나비$|갈비$|도깨비$|바람개비$")


def is_skipped_lodging(item: dict) -> bool:
    return bool(LODGING_SKIP_NAME.search(item.get("title") or ""))


def is_campsite(ctype_id: str, title: str) -> bool:
    return bool(CAMPSITE_NAME.search(title) or (ctype_id == "28" and LEISURE_LODGING_NAME.search(title)))


def is_non_date_leisure_or_monument(ctype_id: str, title: str) -> bool:
    """레포츠/체험의 골프장·낚시터와 관광지의 단독 유물이면 True"""
    title = title.strip()
    if ctype_id == "28":
        # 실내낚시터는 도심 데이트 장소라 통과시킨다(P-063 드림바다실내낚시터)
        return bool(GOLF_NAME.search(title) or (FISHING_NAME.search(title) and "실내" not in title))
    if ctype_id == "12":
        return bool(MONUMENT_NAME.search(title)) and not MONUMENT_KEEP.search(title)
    return False


# 관광지 유형의 단독 유교 시설 관문(P-075). 이름 기준은 scripts/judge_date_fit.py R21과 같다.
# 500m 안에 열린 행이 없고 카카오 장소 패널이 인기(P-067 임곗값)로 보이지 않으면 버리지 않고 닫힌 채 넣는다
CONFUCIAN_NAME = re.compile(r"(서원|향교|서당|영당|재실|종택|사당|묘각)(\s*\(.*\))?$")
CONFUCIAN_NOT = re.compile(r"의사당(\s*\(.*\))?$")
CONFUCIAN_NEIGHBOR_METERS = 500
POPULAR_PHOTOS, POPULAR_KAKAO_REVIEWS, POPULAR_BLOG_REVIEWS = 400, 5, 30
KAKAO_PANEL_URL = "https://place-api.map.kakao.com/places/panel3/{}"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def is_confucian_facility(ctype_id: str, title: str) -> bool:
    title = title.strip()
    return ctype_id == "12" and bool(CONFUCIAN_NAME.search(title)) and not CONFUCIAN_NOT.search(title)


def kakao_query_names(title: str) -> list:
    """카카오 키워드 검색어 후보. 괄호를 떼고, 앞 낱말이 지역어인 이름(옥천 청산향교)은 그 낱말을 뗀 것도 시도한다"""
    name = re.sub(r"\s*\(.*?\)", "", title).strip()
    words = name.split()
    return [name] + ([" ".join(words[1:])] if len(words) > 1 else [])


def is_popular_panel(panel) -> bool:
    """카카오 장소 패널 수치가 P-067 임곗값(사진 400장, 후기 5건, 블로그 30건) 중 하나 이상이면 True. 패널이 없으면 False"""
    if not panel:
        return False
    return ((panel.get("photos") or 0) >= POPULAR_PHOTOS or (panel.get("kreview") or 0) >= POPULAR_KAKAO_REVIEWS
            or (panel.get("blog") or 0) >= POPULAR_BLOG_REVIEWS)


def should_close_confucian(ctype_id: str, title: str, neighbor_count, panel) -> bool:
    """단독 유교 시설이면서 인기가 확인되지 않으면 True. neighbor_count가 None(조회 실패)이면 고립으로 보고,
    panel이 None(검색·조회 실패)이면 인기 아님으로 본다: 어느 쪽이든 닫힌 채 넣고 사람이 되열 수 있다"""
    if not is_confucian_facility(ctype_id, title) or neighbor_count:
        return False
    return not is_popular_panel(panel)


def _open_neighbor_count(supabase_url, headers, lat, lng):
    """좌표 반경 안의 열린 행 수. 좌표가 없거나 조회가 실패하면 None"""
    near = _near_fn(lat, lng, CONFUCIAN_NEIGHBOR_METERS)
    if near is None:
        return None
    dlat, dlng = 0.006, 0.0075  # 500m를 덮는 상자(위도 약 670m, 경도 약 600m 이상)
    lat0, lng0 = float(lat), float(lng)
    url = (f"{supabase_url}/rest/v1/spots?select=lat,lng&is_closed=eq.false"
           f"&lat=gte.{lat0 - dlat}&lat=lte.{lat0 + dlat}&lng=gte.{lng0 - dlng}&lng=lte.{lng0 + dlng}&limit=200")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=8) as res:
            return sum(1 for row in json.loads(res.read().decode("utf-8")) if near(row))
    except Exception:
        return None


def _fetch_kakao_panel(title, lat, lng):
    """카카오 키워드 검색(REST)으로 장소를 찾고 장소 패널(REST 한도 밖)에서 사진·후기·블로그 수를 읽는다. 어느 단계든 실패하면 None"""
    if not KAKAO_REST_API_KEY:
        return None
    for query in kakao_query_names(title):
        compact = re.sub(r"\s", "", query)
        params = {"query": query, "x": lng, "y": lat, "radius": 2000, "sort": "distance", "size": 5}
        try:
            req = urllib.request.Request(f"{KAKAO_KEYWORD_URL}?{urllib.parse.urlencode(params)}",
                                         headers={"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"})
            with urllib.request.urlopen(req, timeout=8) as res:
                docs = json.loads(res.read().decode("utf-8")).get("documents", [])
        except Exception:
            return None
        # 향교 주차장 같은 부속 장소가 아니라 같은 시설을 가리키는 결과만 인정한다
        hit = next((d for d in docs if CONFUCIAN_NAME.search(d.get("place_name", ""))
                    and compact in re.sub(r"\s", "", d["place_name"])), None)
        if not hit:
            continue
        try:
            req = urllib.request.Request(KAKAO_PANEL_URL.format(hit["id"]),
                                         headers={"User-Agent": "Mozilla/5.0", "pf": "web", "Referer": "https://map.kakao.com/"})
            with urllib.request.urlopen(req, timeout=10) as res:
                p = json.loads(res.read().decode("utf-8"))
            return {"blog": (p.get("blog_review") or {}).get("review_count"),
                    "kreview": ((p.get("kakaomap_review") or {}).get("score_set") or {}).get("review_count"),
                    "photos": ((p.get("photos") or {}).get("counts") or {}).get("total")}
        except Exception:
            return None
    return None


def confucian_gate_closes(supabase_url, headers, ctype_id, title, lat, lng) -> bool:
    """입수 직전 관문. 이름이 맞는 행에서만 이웃 조회와 카카오 조회를 부른다"""
    if not is_confucian_facility(ctype_id, title):
        return False
    neighbors = _open_neighbor_count(supabase_url, headers, lat, lng)
    panel = None if neighbors else _fetch_kakao_panel(title, lat, lng)
    return should_close_confucian(ctype_id, title, neighbors, panel)


# 전국 8대 권역별 TourAPI areaCode 매핑
# TourAPI areaCode와 지역 이름. 두 번째 값은 주소로 지역을 못 읽을 때 쓰는 DB region 라벨(서울·경기·인천·강원·
# 충청·영남·호남·제주)이다. 35~38의 이름이 뒤바뀌어 있었고(실제 35 경북, 36 경남, 37 전북, 38 전남), 폴백 라벨도
# '전라'·'경상'·'부산'처럼 DB에 없는 값이었다(2026-09-24 적재 지역으로 확인)
AREA_CODE_MAP = {
    "1": ("서울", ["서울"]),
    "2": ("인천", ["인천"]),
    "3": ("대전", ["충청"]),
    "4": ("대구", ["영남"]),
    "5": ("광주", ["호남"]),
    "6": ("부산", ["영남"]),
    "7": ("울산", ["영남"]),
    "8": ("세종", ["충청"]),
    "31": ("경기", ["경기"]),
    "32": ("강원", ["강원"]),
    "33": ("충북", ["충청"]),
    "34": ("충남", ["충청"]),
    "35": ("경북", ["영남"]),
    "36": ("경남", ["영남"]),
    "37": ("전북", ["호남"]),
    "38": ("전남", ["호남"]),
    "39": ("제주", ["제주"]),
}

# 컨테이너 쓰기 레이어(/app)에 두면 배포로 컨테이너가 재생성될 때마다 지워져 이미 적재한 지역 1~4의
# 1페이지만 반복했다(2026-09-23). LOG_DIR(/mnt/data/logs)이 가리키는 볼륨에 두고, 없으면 종전 위치를 쓴다
_CHECKPOINT_DIR = (os.path.dirname(os.environ["LOG_DIR"]) if os.environ.get("LOG_DIR")
                   else os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHECKPOINT_PATH = os.path.join(_CHECKPOINT_DIR, ".tourapi_checkpoint.json")


def _cotid_exists(supabase_url, headers, content_id):
    """같은 TourAPI 콘텐츠(cotid)로 만든 행이 이미 있는지 본다. 조회가 실패하면 find_duplicate_spot처럼 건너뛴다(fail-closed)"""
    detail_url = f"https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid={content_id}"
    url = f"{supabase_url}/rest/v1/spots?select=id&source->>url=eq.{urllib.parse.quote(detail_url, safe='')}&limit=1"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=5) as res:
            return bool(json.loads(res.read().decode("utf-8")))
    except Exception:
        return True


def _load_checkpoint() -> dict:
    try:
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"area_index": 0, "page_by_combo": {}}


def _save_checkpoint(checkpoint: dict) -> None:
    try:
        with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False)
    except Exception as e:
        print(f"  ⚠️ TourAPI 체크포인트 저장 실패({CHECKPOINT_PATH}): {e}")


def fetch_tourapi_spots(api_key: str, area_code: str = "1", content_type_id: str = "14", num_of_rows: int = 30, page_no: int = 1) -> list[dict]:
    """TourAPI 4.0 areaBasedList2 / areaBasedList1 호출하여 관광/문화 스팟 목록 수급"""
    if not api_key:
        return []

    # ServiceKey 인코딩 안전화 (이미 인코딩된 %3D 등 중복 인코딩 방지)
    clean_key = urllib.parse.unquote(api_key.strip())

    params = {
        "serviceKey": clean_key,
        "numOfRows": str(num_of_rows),
        "pageNo": str(page_no),
        "MobileOS": "ETC",
        "MobileApp": "OneulDate",
        "_type": "json",
        "arrange": "A",
        "areaCode": area_code,
        "contentTypeId": content_type_id
    }

    # KorService2면 areaBasedList2, KorService1이면 areaBasedList1
    op_name = "areaBasedList2" if "KorService2" in TOUR_API_BASE else "areaBasedList1"
    url = f"{TOUR_API_BASE}/{op_name}?{urllib.parse.urlencode(params)}"
    try:
        raw = tour_get_json(url, timeout=8)
        body = raw.get("response", {}).get("body", {})
        items = body.get("items", {})
        if isinstance(items, dict):
            item_list = items.get("item", [])
            if isinstance(item_list, dict):
                item_list = [item_list]
            return item_list
    except TourApiRateLimited:
        raise
    except Exception as e:
        print(f"  ⚠️ TourAPI 호출 오류 (area: {area_code}, type: {content_type_id}): {e}")
        # 빈 목록과 구분한다. 빈 목록을 돌려주면 마지막 페이지로 보고 페이지를 1로 되돌렸다
        raise TourApiFetchFailed(f"list {area_code}:{content_type_id}") from e

    return []

def run_tourapi_mining(supabase_url: str, service_key: str, tour_api_key: str = None, max_discoveries: int = 15) -> int:
    """한국관광공사 TourAPI 순회 마이닝 실행"""
    if not supabase_url or not service_key:
        print("⚠️ Supabase URL 또는 키가 없어 TourAPI 마이닝을 건너뜁니다.")
        return 0

    env = load_env()
    api_key = (
        tour_api_key
        or os.getenv("TOUR_API_KEY")
        or env.get("TOUR_API_KEY")
        or os.getenv("PUBLIC_DATA_PORTAL_KEY")
        or env.get("PUBLIC_DATA_PORTAL_KEY")
        or os.getenv("KOREA_TOUR_API_KEY")
        or env.get("KOREA_TOUR_API_KEY")
        or os.getenv("DATA_GO_KR_API_KEY")
        or env.get("DATA_GO_KR_API_KEY")
    )
    if not api_key:
        print("💡 [TourAPI Miner] TOUR_API_KEY(공공데이터포털 인증키)가 설정되지 않아 공공데이터 수집을 스킵합니다.")
        return 0
    clean_api_key = urllib.parse.unquote(api_key.strip())

    supabase_url = supabase_url.rstrip("/")
    api_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("🏛️ [TourAPI Miner] 한국관광공사 공공데이터 4.0 순회 마이닝 시작...")

    discovered_spots = []
    batch_seen_names = set()

    # 매 실행마다 area_codes를 무작위로 섞어 4개만 훑으면 같은 조합이 반복
    # 선택되고, pageNo도 항상 1이라 매번 같은 상위 15건만 재조회해 순수
    # 재삽입(이미 DB에 있는 스팟을 다시 발굴로 착각)이 잦았다(peer 실측
    # 193/643, 2026-09-22). area_index/page_by_combo 체크포인트로 지역은
    # 고정 순서로 한 바퀴씩 돌리고, 조합별 pageNo도 이어서 증가시킨다.
    checkpoint = _load_checkpoint()
    area_codes = sorted(AREA_CODE_MAP.keys(), key=int)
    start_idx = checkpoint.get("area_index", 0) % len(area_codes)
    selected_codes = [area_codes[(start_idx + i) % len(area_codes)] for i in range(4)]
    page_by_combo = checkpoint.get("page_by_combo", {})

    # 429(하루 한도 초과)를 받으면 이번 회차의 TourAPI 조회를 멈추고, 이미 모은 행만 넣는다.
    # 종전에는 실패가 조용히 넘어가 요금·기간이 빈 채 적재됐다(2026-09-27)
    rate_limited = False
    for area_code in selected_codes:
        for ctype_id, ctype_name, default_moods, default_slot in DATE_CONTENT_TYPES:
            combo_key = f"{area_code}:{ctype_id}"
            prev_page = page_by_combo.get(combo_key, 0)
            page_no = prev_page + 1
            try:
                items = fetch_tourapi_spots(api_key, area_code, ctype_id, num_of_rows=15, page_no=page_no)
            except TourApiRateLimited:
                rate_limited = True
                break
            except TourApiFetchFailed:
                continue  # 페이지 번호를 그대로 두고 다음 회차에 같은 페이지를 다시 받는다
            # 반환 건수가 요청보다 적으면 마지막 페이지 — 다음 실행은 1페이지부터 다시 돈다
            page_by_combo[combo_key] = 1 if len(items) < 15 else page_no
            time.sleep(0.3)

            for item in items:
                content_id = str(item.get("contentid", ""))
                title = item.get("title", "").strip()
                addr1 = item.get("addr1", "").strip()
                mapx = item.get("mapx")
                mapy = item.get("mapy")
                first_img = item.get("firstimage") or item.get("firstimage2")

                if not title or not content_id:
                    continue

                if title in batch_seen_names or re.sub(r'\(.*?\)|\[.*?\]', '', title).strip() in batch_seen_names:
                    continue

                # 콘텐츠 유형은 화이트리스트 밖이 많아 '화이트리스트외'만 통과시키고, 상호명 패턴(어린이 시설, 주식회사 등)과
                # 숙박업종은 다른 마이너처럼 버린다. 전에는 '블랙리스트'만 버려 울산어린이천문대가 들어왔다
                if ctype_id == "32" and is_skipped_lodging(item):
                    continue
                if ctype_id == "14" and PUBLIC_FACILITY_NAME.search(title.strip()):
                    continue
                if is_non_date_leisure_or_monument(ctype_id, title):
                    continue
                is_valid, reason = is_date_spot_category(ctype_name, title, allow_lodging=True)
                if not is_valid and not reason.startswith("화이트리스트외"):
                    continue

                # 이름 확인보다 먼저 본다. 제목에 ' & ' 같은 표기가 있으면 run_worker의 [Auto-Healing]이 나중에
                # 이름을 검색 1위 상호로 바꿔, 다음 수집 때 같은 제목으로는 기존 행을 못 찾고 다시 넣었다
                # (농부마켓 & 농부밥상 → 농부밥상, 같은 cotid 행 3개. 2026-09-26 확인). 닫힌 행도 막는다
                if _cotid_exists(supabase_url, api_headers, content_id):
                    continue

                if find_duplicate_spot(supabase_url, api_headers, title, addr1):
                    continue

                batch_seen_names.add(title)
                batch_seen_names.add(re.sub(r'\(.*?\)|\[.*?\]', '', title).strip())

                derived_region, derived_area = derive_region_area(addr1)
                region = derived_region or AREA_CODE_MAP.get(area_code, ("서울", ["서울"]))[1][0]
                area = derived_area or "전체"

                # TourAPI가 좌표 미보유 항목에 대한민국 영역 밖(예: 19.69/117.99,
                # 남중국해 부근) 더미값을 그대로 반환하는 경우가 있다(2026-09-23
                # 데이터 큐레이션 감사가 서로 무관한 두 스팟에서 동일 좌표 발견).
                # 한반도 대략 범위를 벗어나면 결측으로 처리한다. 숫자 변환과 이 범위
                # 검증은 적재 직전 sanitize_spot이 맡는다(비숫자 값의 float() 예외 방지).
                lat_val = mapy or None
                lng_val = mapx or None

                # 행사는 기간을 함께 받아 source.event에 둔다. 이미 끝난 행사는 넣지 않는다(2026-09-27: 행사 216곳 기간 0곳)
                event_period = None
                if ctype_id == "15":
                    try:
                        event_period = fetch_event_period(clean_api_key, content_id)
                    except TourApiRateLimited:
                        rate_limited = True
                        page_by_combo[combo_key] = prev_page  # 이 페이지의 남은 항목을 다음 회차에 다시 본다
                        break
                    except TourApiFetchFailed as e:
                        # 기간 없이 넣지 않는다. 이 페이지를 다음 회차에 다시 받고 다른 조합으로 넘어간다
                        print(f"  ⚠️ {title}: {e} — 이 페이지를 다음 회차로 미룬다")
                        page_by_combo[combo_key] = prev_page
                        break
                    time.sleep(0.3)
                    if event_period and event_period["end"] < datetime.now(KST).strftime("%Y-%m-%d"):
                        continue

                # 문화시설은 detailIntro의 이용요금(usefee)을 실제 가격으로 쓴다. 없으면 가격을 비워 둔다.
                # 같은 응답의 휴관 요일(restdateculture)은 closed_days로, 이용시간(usetimeculture)은 business_hours로 받는다
                fee, closed_days, hours = None, [], None
                if ctype_id == "14":
                    try:
                        intro = fetch_intro(clean_api_key, content_id)
                        fee = fee_fields(intro.get("usefee"))
                        closed_days = parse_closed_days(intro.get("restdateculture"))
                        hours = hours_fields(intro.get("usetimeculture"))
                    except TourApiRateLimited:
                        rate_limited = True
                        page_by_combo[combo_key] = prev_page  # 이 페이지의 남은 항목을 다음 회차에 다시 본다
                        break
                    except TourApiFetchFailed as e:
                        print(f"  ⚠️ {title}: {e} — 이 페이지를 다음 회차로 미룬다")
                        page_by_combo[combo_key] = prev_page
                        break
                    time.sleep(0.3)

                gate_closed = confucian_gate_closes(supabase_url, api_headers, ctype_id, title, lat_val, lng_val)
                if gate_closed:
                    print(f"  🔒 [TourAPI Miner] 단독 유교 시설 관문: {title} 닫힌 채 입수")

                spot_id = new_spot_id()

                new_spot = {
                    "id": spot_id,
                    "name": title,
                    "slot": "stay" if is_campsite(ctype_id, title) else default_slot,
                    "region": region,
                    "area": area,
                    "address": addr1,
                    "location": f"{region} {area}".strip(),
                    "mood": default_moods,
                    # '무료/입장권'은 파생 단계가 FREE 등급을 만들어 입장료가 있는 곳까지 무료로 보였고 '현장결제'는 가격이 아니다.
                    # 실제 요금은 detailIntro의 usefee 등에서 받을 수 있으나 지금은 비워 둔다(2026-09-27)
                    "price": (fee or {}).get("price"),
                    **({k: fee[k] for k in ("price_tier", "avg_price_per_person") if fee and fee.get(k) is not None}),
                    "summary": f"{title} — 한국관광공사 인증 {ctype_name} 명소 ({area})",
                    "category": ctype_name,
                    **({"closed_days": closed_days} if closed_days else {}),
                    **({"business_hours": hours} if hours else {}),
                    "image_url": first_img,
                    "lat": lat_val,
                    "lng": lng_val,
                    "quality_score": 92,
                    "fail_count": 0,
                    # curation_badges는 프론트가 {tour_api, michelin, ...} 객체로 읽는다.
                    # 배열로 넣으면 spot.curation_badges?.tour_api 같은 접근이 전부
                    # undefined가 돼 배지 표시·인기도 점수 계산에서 조용히 빠진다.
                    "curation_badges": {
                        "tour_api": "한국관광공사 인증",
                    },
                    "parking_info": {
                        "type": "free" if "주차" in addr1 else "unknown",
                        "detail": "공영/부설 주차장 완비" if "주차" in addr1 else "인근 공영주차장 이용"
                    },
                    "source": {
                        "type": "tourapi",
                        "url": f"https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid={content_id}",
                        "note": f"TourAPI 4.0 {ctype_name}"
                                + (f" | closed: P-075 단독 유교 시설 관문 ({datetime.now(KST).strftime('%Y%m%d')})" if gate_closed else ""),
                        **({"event": event_period} if event_period else {}),
                    },
                    "verified": True,
                    "is_closed": gate_closed,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }

                discovered_spots.append(new_spot)
                if len(discovered_spots) >= max_discoveries:
                    break
            if len(discovered_spots) >= max_discoveries or rate_limited:
                break
        if len(discovered_spots) >= max_discoveries or rate_limited:
            break

    if rate_limited:
        # 한도 초과로 끊긴 회차는 같은 지역부터 다시 돌도록 지역 순서를 넘기지 않는다
        print(f"  ⚠️ [TourAPI Miner] 한도 초과로 회차 중단(오늘 호출 {usage_today()}회), 모은 {len(discovered_spots)}건만 적재")
    else:
        checkpoint["area_index"] = (start_idx + 4) % len(area_codes)
    checkpoint["page_by_combo"] = page_by_combo
    # 체크포인트는 적재 결과를 받은 뒤에만 저장한다. INSERT 전에 저장하면 적재가 실패해도 지역·페이지가
    # 전진해 그 항목을 한 바퀴 돌 때까지 건너뛰었다(2026-09-24 17:08 회차)

    # find_duplicate_spot는 실행 시점의 라이브 DB만 보고, 이 배치가 아직
    # INSERT하지 않은 자기 자신의 discovered_spots는 못 본다. 같은 업체가
    # 이번 실행 안에서 서로 다른 조회 조합으로 두 번 발견되면 어느 쪽도
    # DB에 없어 중복 검사를 둘 다 통과해버려, 0.1~0.2초 간격의 배치 내부
    # 즉시 중복 삽입이 반복적으로 관측됐다(2026-09-23 확인). 최종 INSERT
    # 직전에 이번 배치 자체 내에서 이름+주소로 한 번 더 걸러낸다.
    seen_keys = set()
    deduped_spots = []
    for s in discovered_spots:
        key = (s["name"].strip(), normalize_spot_address(s.get("address") or ""))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped_spots.append(s)
    discovered_spots = deduped_spots

    if discovered_spots:
        discovered_spots = [sanitize_spot(s) for s in discovered_spots]
        try:
            inserted = insert_spots(supabase_url, api_headers, discovered_spots)
            # 행 단위 실패(제약 위반)는 다시 넣어도 같으므로 전진한다. 네트워크 오류·5xx는 예외라 저장하지 않는다
            _save_checkpoint(checkpoint)
            if inserted:
                print(f"✨ [TourAPI 4.0 INSERT 성공] 총 {len(inserted)}개 문화/관광 스팟 적재 완료:")
                for s in inserted:
                    print(f"   + [{s['region']}/{s['slot']}] {s['name']} ({s['category']})")
            return len(inserted)
        except Exception as e:
            print(f"❌ TourAPI 스팟 INSERT 실패: {e}")
    else:
        _save_checkpoint(checkpoint)
        print("💡 [TourAPI Miner] 신규 발굴 스팟 없음 (DB 최신 상태 유지)")

    return 0

if __name__ == "__main__":
    env = load_env()
    supa_url = os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL")
    supa_key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    run_tourapi_mining(supa_url, supa_key, max_discoveries=10)
