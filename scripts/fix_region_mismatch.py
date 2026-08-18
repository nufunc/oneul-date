#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
일회성 교정 스크립트: Supabase `spots` 테이블의 region/area 불일치를 주소 기준으로 바로잡는다.

배경
----
collector 가 하드코딩 시드에서 region/area 를 스탬프하고 주소로 재검증하지 않아,
주소는 "경기도 양평군"인데 region 이 '서울'인 스팟 등이 존재한다.

동작
----
1. 활성 스팟(is_closed=false)을 Range 헤더로 1000건씩 페이징해 전부 로드
2. address 가 있는 스팟에 대해 주소에서 (region, area)를 도출
3. lat/lng 가 있으면 도출된 region 의 대략적 좌표 범위와 교차 검증
   - 주소와 좌표가 서로 다른 지역을 가리키면 교정하지 않고 conflict 로 분류
4. --dry-run(기본) 이면 보고만, --apply 면 region/area 컬럼만 PATCH

주의
----
- region/area 컬럼만 수정한다. 다른 컬럼은 절대 건드리지 않는다.
- DELETE/INSERT 하지 않는다. UPDATE 만.
- 확신이 없는 건은 교정하지 않고 보고에만 남긴다.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Windows 콘솔에서도 한글이 깨지지 않도록
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# 자격 증명
# ---------------------------------------------------------------------------

def _load_env_file(path):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _jwt_role(token):
    """JWT payload 에서 role 문자열을 best-effort 로 추출 (검증 아님, 표시용)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("role", "")
    except Exception:
        return ""


def load_credentials():
    """(url, key, kind) 를 반환. service role 키를 우선한다."""
    candidates = [
        os.path.join(BASE_DIR, ".env"),
        os.path.join(BASE_DIR, "collector", ".env"),
        os.path.join(BASE_DIR, "collector", ".env.example"),
    ]
    merged = {}
    for p in candidates:
        for k, v in _load_env_file(p).items():
            merged.setdefault(k, v)
    for k, v in os.environ.items():
        if k.startswith("SUPABASE") or k.startswith("VITE_SUPABASE"):
            merged[k] = v

    url = (merged.get("SUPABASE_URL") or merged.get("VITE_SUPABASE_URL") or "").rstrip("/")

    for name in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"):
        key = merged.get(name, "")
        if key and "..." not in key:
            role = _jwt_role(key)
            return url, key, ("service" if role == "service_role" else (role or "unknown"))

    key = merged.get("VITE_SUPABASE_ANON_KEY", "")
    if key and "..." not in key:
        return url, key, "anon"

    return url, "", "none"


# ---------------------------------------------------------------------------
# 주소 -> (region, area) 도출
# ---------------------------------------------------------------------------

# 8권역 매핑. 각 그룹 안에서 긴 토큰이 먼저 오도록 두어 접두 오매칭을 막는다.
SIDO_RULES = [
    # (주소 첫 토큰 후보들, region, 광역시 여부)
    (("서울특별시", "서울시", "서울"), "서울", True),
    (("경기도", "경기"), "경기", False),
    (("인천광역시", "인천시", "인천"), "인천", True),
    (("강원특별자치도", "강원도", "강원"), "강원", False),
    (("충청남도", "충남도", "충남"), "충청", False),
    (("충청북도", "충북도", "충북"), "충청", False),
    (("대전광역시", "대전시", "대전"), "충청", True),
    (("세종특별자치시", "세종시", "세종"), "충청", True),
    # 전남·광주 통합특별시 (2026 행정통합). 산하에 舊 광주 자치구와 전남 시·군이 함께 있으므로
    # 광역시처럼 취급해 '구'도 기초자치단체로 인정한다. '전남'보다 먼저 와야 오매칭되지 않는다.
    (("전남광주통합특별시", "전남광주통합시", "광주통합특별시"), "호남", True),
    (("전라남도", "전남도", "전남"), "호남", False),
    (("전북특별자치도", "전라북도", "전북도", "전북"), "호남", False),
    (("광주광역시", "광주시"), "호남", True),
    (("경상남도", "경남도", "경남"), "영남", False),
    (("경상북도", "경북도", "경북"), "영남", False),
    (("부산광역시", "부산시", "부산"), "영남", True),
    (("대구광역시", "대구시", "대구"), "영남", True),
    (("울산광역시", "울산시", "울산"), "영남", True),
    (("제주특별자치도", "제주도", "제주"), "제주", False),
]

# 시도 토큰 없이 기초자치단체로 시작하는 주소를 구제하기 위한 최소한의 예외
BARE_AREA_RULES = {
    "제주시": ("제주", "제주시"),
    "서귀포시": ("제주", "서귀포시"),
}

# region 별 대략적 좌표 바운딩 박스 (min_lat, max_lat, min_lng, max_lng).
# 도서 지역(백령도/울릉도/가거도 등)을 포함하도록 넉넉하게 잡았다.
# 정밀 판정이 아니라 "명백히 다른 지역인가"만 걸러내는 용도다.
REGION_BBOX = {
    "서울": (37.40, 37.72, 126.73, 127.22),
    "경기": (36.85, 38.32, 126.15, 127.95),
    "인천": (36.85, 38.30, 124.50, 126.95),
    "강원": (36.95, 38.65, 127.00, 129.40),
    "충청": (35.95, 37.25, 125.80, 128.75),
    "호남": (33.80, 36.40, 124.90, 128.10),
    "영남": (34.50, 37.30, 127.40, 131.00),
    "제주": (32.90, 33.75, 125.90, 127.10),
}

# 한국 본토+도서 전체 범위. 벗어나면 좌표 자체를 신뢰하지 않는다.
KR_BBOX = (32.9, 38.7, 124.4, 131.1)


def normalize_sido(token):
    """주소 첫 토큰에서 (region, is_metro, matched_token) 를 도출. 못 찾으면 None."""
    for names, region, is_metro in SIDO_RULES:
        for n in names:
            if token == n or token.startswith(n):
                return region, is_metro, n
    return None


def derive_region_area(address):
    """
    주소 문자열에서 (region, area, status) 를 도출한다.

    status:
      'ok'          - 신뢰 가능한 도출
      'no_address'  - 주소 없음
      'unparseable' - 시도 토큰을 못 찾음 (설명문일 가능성)
      'no_area'     - region 은 알겠으나 기초자치단체를 특정 못함
    """
    if not address or not address.strip():
        return "", "", "no_address"

    parts = address.replace(",", " ").split()
    if not parts:
        return "", "", "unparseable"

    p0 = parts[0]

    # 시도 토큰 없이 시작하는 예외 케이스
    if p0 in BARE_AREA_RULES:
        region, area = BARE_AREA_RULES[p0]
        return region, area, "ok"

    # 맨 앞 토큰이 그냥 "광주"인 경우는 광주광역시(호남)와 경기도 광주시가 모두 가능하다.
    # 뒤에 자치구가 오면 광주광역시로 확정하고, 그렇지 않으면 모호하므로 손대지 않는다.
    # (경기도 광주시에는 자치구가 없다)
    if p0 == "광주":
        nxt = parts[1] if len(parts) > 1 else ""
        if nxt.endswith("구"):
            return "호남", nxt, "ok"
        return "", "", "unparseable"

    hit = normalize_sido(p0)
    if not hit:
        return "", "", "unparseable"

    region, is_metro, matched = hit

    # "서울특별시강남구" 처럼 붙어 있는 경우 잔여분을 area 후보로 쓴다
    remainder = p0[len(matched):]
    tail = parts[1:]
    if remainder:
        tail = [remainder] + tail

    # 세종특별자치시는 산하 시군구가 없다 (읍/면/동이 바로 온다)
    if region == "충청" and matched.startswith("세종"):
        return region, "세종시", "ok"

    if not tail:
        return region, "", "no_area"

    a0 = tail[0]

    # "인천 검단구" 처럼 시도+시군구 뿐이고 그 아래 상세(도로명/동)가 없는 주소는
    # 교차 확인할 근거가 없다. region 은 믿되 area 는 미상으로 둔다.
    if len(tail) < 2:
        return region, "", "no_area"

    # 기초자치단체는 시/군/구로 끝나야 한다.
    # ("서울 근교 가평" 같은 설명문을 여기서 걸러낸다)
    if not a0.endswith(("시", "군", "구")):
        return region, "", "no_area"

    # 일반시 산하 일반구는 부모 시로 정규화한다.
    #   경기도 성남시 분당구 -> 성남시 (tail[0] 이 이미 '성남시' 이므로 자연히 성립)
    #   광역시 산하 구는 그대로 유지  (부산광역시 해운대구 -> 해운대구)
    # 도(道) 주소인데 tail[0] 이 '구'로 끝나면 상위 시 정보가 누락된 셈이라 신뢰하지 않는다.
    if not is_metro and a0.endswith("구"):
        return region, "", "no_area"

    return region, a0, "ok"


def coord_matches_region(lat, lng, region):
    """
    좌표가 해당 region 바운딩 박스 안인지 판정.
    반환: True(일치) / False(불일치) / None(판정 불가 - 좌표 없음/한국 밖)
    """
    if lat is None or lng is None:
        return None
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return None
    if lat == 0 and lng == 0:
        return None
    if not (KR_BBOX[0] <= lat <= KR_BBOX[1] and KR_BBOX[2] <= lng <= KR_BBOX[3]):
        return None  # 한국 밖 좌표는 좌표 쪽을 못 믿으므로 판정 보류
    box = REGION_BBOX.get(region)
    if not box:
        return None
    return box[0] <= lat <= box[1] and box[2] <= lng <= box[3]


# location 자유텍스트에서 권역 힌트를 뽑기 위한 키워드 사전.
# 주소가 엉뚱한 곳으로 지오코딩된 케이스(예: '경주 석굴암로' 스팟에 서울 마포 주소)를
# 걸러내기 위한 3차 검증용이다. 교정에 쓰지 않고 '보류' 판정에만 쓴다.
LOCATION_HINTS = {
    "서울": ["서울", "강남", "홍대", "성수", "종로", "을지로", "익선", "연남", "여의도",
             "잠실", "이태원", "서촌", "북촌", "망원", "한남", "압구정", "삼청"],
    "경기": ["경기", "수원", "성남", "분당", "판교", "가평", "양평", "파주", "고양", "일산",
             "남양주", "하남", "안산", "용인", "광명", "부천", "시흥", "안양", "평택",
             "김포", "이천", "포천", "여주", "두물머리", "헤이리"],
    "인천": ["인천", "송도", "영종", "강화", "을왕리", "부평", "차이나타운", "월미"],
    "강원": ["강원", "강릉", "속초", "양양", "춘천", "원주", "평창", "홍천", "정선",
             "삼척", "남이섬", "대관령", "경포"],
    "충청": ["충청", "충남", "충북", "대전", "세종", "청주", "천안", "아산", "공주", "부여",
             "태안", "서산", "단양", "제천", "충주", "안면도"],
    "호남": ["호남", "전남", "전북", "광주", "전주", "여수", "순천", "담양", "목포", "군산",
             "남원", "익산", "완도", "보성", "한옥마을"],
    "영남": ["영남", "경남", "경북", "부산", "대구", "울산", "경주", "포항", "통영", "거제",
             "안동", "창원", "진주", "해운대", "광안리", "서면", "전포", "황리단"],
    "제주": ["제주", "서귀포", "애월", "함덕", "성산", "우도", "협재", "중문", "구좌",
             "월정리", "한림", "표선"],
}


def location_hint_regions(text):
    """location/name 자유텍스트에서 유추되는 권역 집합. 판정 불가면 빈 집합."""
    if not text:
        return set()
    return set(r for r, kws in LOCATION_HINTS.items() if any(k in text for k in kws))


def coord_regions(lat, lng):
    """좌표가 들어맞는 region 목록 (보고용)."""
    out = []
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return out
    for r, b in REGION_BBOX.items():
        if b[0] <= lat <= b[1] and b[2] <= lng <= b[3]:
            out.append(r)
    return out


# ---------------------------------------------------------------------------
# Supabase REST
# ---------------------------------------------------------------------------

SELECT_COLS = "id,name,region,area,address,lat,lng,location"


def fetch_all_spots(url, key, page_size=1000):
    spots = []
    offset = 0
    while True:
        endpoint = (
            url + "/rest/v1/spots?select=" + SELECT_COLS +
            "&is_closed=eq.false&order=id.asc"
        )
        req = urllib.request.Request(
            endpoint,
            headers={
                "apikey": key,
                "Authorization": "Bearer " + key,
                "Range-Unit": "items",
                "Range": "%d-%d" % (offset, offset + page_size - 1),
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.loads(resp.read().decode("utf-8"))
        if not batch:
            break
        spots.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return spots


def patch_spot(url, key, spot_id, region, area):
    """region/area 컬럼만 PATCH. (성공여부, 메시지) 반환."""
    body = {"region": region}
    if area:
        body["area"] = area
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url + "/rest/v1/spots?id=eq." + str(spot_id),
        data=data,
        method="PATCH",
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return 200 <= resp.status < 300, str(resp.status)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        return False, "HTTP %d: %s" % (e.code, detail)
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, e)


# ---------------------------------------------------------------------------
# 분석
# ---------------------------------------------------------------------------

def analyze(spots, use_location_fallback=False):
    """스팟 목록을 분류해 dict 로 반환."""
    result = {
        "fixable": [],      # 교정 대상 (region 또는 area 불일치, 좌표 검증 통과)
        "conflict": [],     # 주소 vs 좌표 충돌 -> 교정 보류
        "unparseable": [],  # 주소가 파싱 불가 (설명문 가능성) -> 보류
        "no_area": [],      # region 은 도출됐으나 area 미상 -> 보류
        "match": 0,
        "no_address": 0,
    }

    for s in spots:
        addr = (s.get("address") or "").strip()
        addr_source = "address"
        if not addr and use_location_fallback:
            # address 가 비어 있으면 location 자유텍스트를 동일한 파서에 통과시킨다.
            # 파서 기준은 그대로이므로(시도 토큰 + 시군구 필수) 잣대를 느슨하게 푸는 게 아니다.
            cand = (s.get("location") or "").strip()
            if derive_region_area(cand)[2] == "ok":
                addr, addr_source = cand, "location"
        if not addr:
            result["no_address"] += 1
            continue

        region, area, status = derive_region_area(addr)

        if status == "unparseable":
            result["unparseable"].append(dict(s, reason="시도 토큰 없음(설명문 가능성)"))
            continue

        cur_region = s.get("region") or ""
        cur_area = s.get("area") or ""

        if status == "no_area":
            if region and region != cur_region:
                result["no_area"].append(dict(s, new_region=region, reason="기초자치단체 미상"))
            else:
                result["match"] += 1
            continue

        region_mismatch = bool(region) and region != cur_region
        area_mismatch = bool(area) and area != cur_area

        if not region_mismatch and not area_mismatch:
            result["match"] += 1
            continue

        # 좌표 교차 검증
        verdict = coord_matches_region(s.get("lat"), s.get("lng"), region)
        if verdict is False:
            result["conflict"].append(dict(
                s,
                new_region=region,
                new_area=area,
                coord_regions=coord_regions(s.get("lat"), s.get("lng")),
                reason="좌표가 주소와 다른 권역",
            ))
            continue

        # location 자유텍스트 교차 검증 (region 이 실제로 바뀌는 건에 한해서만).
        # 지오코딩이 엉뚱한 동명이지로 잡힌 케이스(예: 서울 서촌 코스에 부산 부암동 주소)를
        # 여기서 걸러낸다. 주소·좌표가 함께 틀릴 수 있으므로 좌표 검증만으로는 부족하다.
        if region_mismatch and addr_source == "address":
            hint = location_hint_regions(s.get("location")) | location_hint_regions(s.get("name"))
            if hint and region not in hint:
                result["conflict"].append(dict(
                    s,
                    new_region=region,
                    new_area=area,
                    coord_regions=coord_regions(s.get("lat"), s.get("lng")),
                    reason="location/name('%s' / '%s')이 %s 을(를) 가리킴"
                           % (s.get("location"), s.get("name"), "·".join(sorted(hint))),
                ))
                continue

        result["fixable"].append(dict(
            s,
            new_region=region,
            new_area=area,
            addr_source=addr_source,
            region_mismatch=region_mismatch,
            area_mismatch=area_mismatch,
            coord_checked=(verdict is True),
        ))

    return result


def w(x, width):
    """한글 폭(2칸)을 고려한 좌측 정렬 패딩."""
    x = str(x)
    disp = sum(2 if ord(c) > 0x2E80 else 1 for c in x)
    return x + " " * max(1, width - disp)


def report(res, spots):
    total = len(spots)
    with_addr = total - res["no_address"]
    fixable = res["fixable"]

    print("=" * 110)
    print("전체 활성 스팟: %d건 | 주소 보유: %d건 | 주소 없음: %d건"
          % (total, with_addr, res["no_address"]))
    print("일치: %d건 | 교정 대상: %d건 | 좌표충돌(보류): %d건 | 주소파싱불가(보류): %d건 | area미상(보류): %d건"
          % (res["match"], len(fixable), len(res["conflict"]),
             len(res["unparseable"]), len(res["no_area"])))
    print("=" * 110)

    if fixable:
        print("\n[교정 대상 전체 목록]")
        print(w("id", 8) + w("현재 region/area", 24) + w("-> 교정 region/area", 27)
              + w("주소", 44) + "스팟명")
        print("-" * 130)
        for s in sorted(fixable, key=lambda x: ((x.get("region") or ""), x["new_region"], str(x["id"]))):
            cur = "%s/%s" % (s.get("region") or "-", s.get("area") or "-")
            new = "-> %s/%s" % (s["new_region"], s["new_area"] or (s.get("area") or "-"))
            src = "" if s.get("addr_source") == "address" else "[loc]"
            basis = (s.get("address") or s.get("location") or "")[:40]
            print(w(s["id"], 8) + w(cur, 24) + w(new, 27)
                  + w(src + basis, 49) + str(s.get("name")))

        print("\n[패턴별 집계: region 변경]")
        pat = Counter(
            "%s -> %s" % (s.get("region") or "-", s["new_region"])
            for s in fixable if s["region_mismatch"]
        )
        for k, v in pat.most_common():
            print("  " + w(k, 24) + "%d건" % v)
        area_only = sum(1 for s in fixable if not s["region_mismatch"])
        print("  " + w("(region 동일, area만 교정)", 24) + "%d건" % area_only)

        print("\n[좌표 교차검증]")
        ok = sum(1 for s in fixable if s["coord_checked"])
        print("  좌표로 확인됨: %d건 | 좌표 없음(주소만 근거): %d건" % (ok, len(fixable) - ok))

    if res["conflict"]:
        print("\n[주소 vs 좌표 충돌 - 교정하지 않음]")
        for s in res["conflict"]:
            print("  " + w(s["id"], 8) + w(s.get("region") or "-", 8) + "-> "
                  + w(s["new_region"], 8)
                  + "[%s] 좌표=%s | %s | %s"
                  % (s.get("reason", ""), s["coord_regions"] or "범위밖",
                     s.get("address"), s.get("name")))

    if res["unparseable"]:
        print("\n[주소 파싱 불가 - 교정하지 않음 (설명문/불완전 주소)]")
        for s in res["unparseable"]:
            print("  " + w(s["id"], 8) + w(s.get("region") or "-", 8)
                  + "| %s | %s" % (s.get("address"), s.get("name")))

    if res["no_area"]:
        print("\n[region 불일치이나 기초자치단체 미상 - 교정하지 않음]")
        for s in res["no_area"]:
            print("  " + w(s["id"], 8) + w(s.get("region") or "-", 8) + "-> "
                  + w(s["new_region"], 8)
                  + "| %s | %s" % (s.get("address"), s.get("name")))


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="spots 테이블 region/area 불일치를 주소 기준으로 일괄 교정")
    ap.add_argument("--apply", action="store_true",
                    help="실제로 PATCH 를 실행한다 (미지정 시 dry-run)")
    ap.add_argument("--dry-run", action="store_true", default=True,
                    help="변경 없이 보고만 한다 (기본값)")
    ap.add_argument("--sleep", type=float, default=0.08,
                    help="PATCH 사이 대기 초 (rate limit 회피)")
    ap.add_argument("--only-ids", default="",
                    help="쉼표로 구분된 id 목록으로 교정 대상을 제한")
    ap.add_argument("--exclude-ids", default="",
                    help="쉼표로 구분된 id 목록을 교정 대상에서 제외")
    ap.add_argument("--location-fallback", action="store_true",
                    help="address 가 비어 있으면 location 텍스트를 같은 파서로 대신 사용한다")
    args = ap.parse_args()

    apply_mode = args.apply  # --apply 가 없으면 언제나 dry-run

    url, key, kind = load_credentials()
    if not url or not key:
        print("[중단] Supabase URL 또는 키를 찾지 못했습니다.")
        return 1
    print("Supabase: %s" % url)
    print("사용 키: %s (JWT role=%s)" % (kind, _jwt_role(key) or "?"))
    print("모드: %s\n" % ("APPLY (실제 UPDATE)" if apply_mode else "DRY-RUN (변경 없음)"))

    spots = fetch_all_spots(url, key)
    print("활성 스팟 %d건 로드 완료.\n" % len(spots))

    res = analyze(spots, args.location_fallback)
    report(res, spots)

    targets = res["fixable"]
    if args.only_ids:
        allow = set(x.strip() for x in args.only_ids.split(",") if x.strip())
        targets = [s for s in targets if str(s["id"]) in allow]
        print("\n--only-ids 적용: %d건으로 제한" % len(targets))
    if args.exclude_ids:
        deny = set(x.strip() for x in args.exclude_ids.split(",") if x.strip())
        before = len(targets)
        targets = [s for s in targets if str(s["id"]) not in deny]
        print("\n--exclude-ids 적용: %d건 제외 -> %d건" % (before - len(targets), len(targets)))

    if not apply_mode:
        print("\n[DRY-RUN] %d건이 교정 대상입니다. 실제 적용하려면 --apply 를 붙이세요." % len(targets))
        return 0

    if not targets:
        print("\n교정할 대상이 없습니다.")
        return 0

    print("\n[APPLY] %d건 PATCH 시작..." % len(targets))
    ok_cnt = 0
    fail = []
    for i, s in enumerate(targets, 1):
        area = s["new_area"] or s.get("area")
        success, msg = patch_spot(url, key, s["id"], s["new_region"], area)
        if success:
            ok_cnt += 1
        else:
            fail.append((s["id"], s.get("name"), msg))
            print("  [실패] id=%s %s :: %s" % (s["id"], s.get("name"), msg))
        if i % 10 == 0:
            print("  ... %d/%d 처리" % (i, len(targets)))
        time.sleep(args.sleep)

    print("\n[APPLY 완료] 성공 %d건 / 실패 %d건" % (ok_cnt, len(fail)))
    for fid, fname, fmsg in fail:
        print("  실패: %s %s - %s" % (fid, fname, fmsg))

    # 재검증
    print("\n[재검증] 전체 재로드 후 불일치 재계산...")
    time.sleep(1.0)
    spots2 = fetch_all_spots(url, key)
    res2 = analyze(spots2, args.location_fallback)
    print("  교정 전 불일치: %d건 -> 교정 후: %d건" % (len(res["fixable"]), len(res2["fixable"])))
    print("  좌표충돌 보류: %d건 | 파싱불가 보류: %d건 | area미상 보류: %d건"
          % (len(res2["conflict"]), len(res2["unparseable"]), len(res2["no_area"])))
    if res2["fixable"]:
        print("  남은 불일치 목록:")
        for s in res2["fixable"]:
            print("    %s %s/%s -> %s/%s | %s | %s"
                  % (s["id"], s.get("region"), s.get("area"),
                     s["new_region"], s["new_area"], s.get("address"), s.get("name")))

    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
