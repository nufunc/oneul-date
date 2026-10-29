#!/usr/bin/env python3
"""TourAPI 문화시설(contentTypeId=14)의 이용요금(usefee)을 price에, 휴관 요일(restdateculture)을 closed_days에,
이용시간(usetimeculture)을 business_hours에 적재한다.
기본은 드라이런, --apply일 때만 쓴다.
관광지(12)·쇼핑(38)은 detailIntro2에 요금 필드가 없고 레포츠(28)는 상세가 비어 와서 대상이 아니다(2026-09-27 확인).

- price: usefee 원문에서 HTML을 걷어낸 문자열(100자까지). 비어 있으면 넣지 않는다.
- price_tier·avg_price_per_person: 가장 높은 금액(대개 성인 요금)으로 derive_price_tier_from_text를 부른다.
  금액이 없고 '무료'라고만 적힌 경우만 FREE다. 빈 값을 무료로 읽지 않는다.
- closed_days: restdateculture가 '매주 월요일'처럼 매주 반복하는 요일일 때만 채운다. 매월 몇째 주나 시설별 예외는 넣지 않는다.
- business_hours: {"이용시간": usetimeculture 원문}. 요일 키가 아니라서 앱의 오늘 휴무 판정에는 쓰이지 않는다.
- 이미 price나 closed_days나 business_hours가 있는 칸은 건드리지 않는다. 쓰기 전에 바꿀 행을 백업한다.

사용: python3 tour_fee.py [--apply] [--backup-dir DIR] [--parking --limit N]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from state_io import atomic_dump, load_json, open_new
from supabase_worker import derive_price_tier_from_text, load_env
from event_period import TOUR_API_BASE, _request, _tour_api_key
from tourapi_quota import USAGE_FILE, TourApiFetchFailed, TourApiRateLimited, tour_get_json, usage_today

KST = timezone(timedelta(hours=9))


def clean_usefee(raw):
    text = re.sub(r'<br\s*/?>', ' / ', raw or '', flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip(' /')
    return text[:100] or None


def fee_fields(raw):
    """usefee 원문 → price, price_tier, avg_price_per_person. 읽을 수 없으면 None."""
    price = clean_usefee(raw)
    if not price:
        return None
    amounts = [int(a.replace(',', '')) for a in re.findall(r'(\d{1,3}(?:,\d{3})+|\d{3,6})\s*원', price)]
    if amounts and max(amounts) < 1000:
        # derive_price_tier_from_text는 네 자리 이상 숫자만 읽어 '500원'이 등급 없이 남았다
        return {"price": price, "price_tier": "₩", "avg_price_per_person": max(amounts)}
    tier, avg = derive_price_tier_from_text(f"{max(amounts):,}원" if amounts else price)
    return {"price": price, "price_tier": tier, "avg_price_per_person": avg}


def hours_fields(raw):
    """usetimeculture 원문 → {"이용시간": ...}. 비어 있으면 None."""
    text = clean_usefee(raw)
    return {"이용시간": text} if text else None


WEEKDAYS = "월화수목금토일"
_DAY_SPAN = rf'(?:매주\s*)?([{WEEKDAYS}])요일(?:\s*~\s*([{WEEKDAYS}])요일)?'


def parse_closed_days(raw):
    """restdateculture 원문 → 매주 쉬는 요일 목록(['월요일', ...]). 매주 반복이 아니거나 읽을 수 없으면 빈 목록.
    첫 조각(/, <br>, 줄바꿈 앞)은 그대로 읽고, 뒤 조각은 요일만 적힌 것만 보탠다. 뒤 조각의 나머지는 공휴일 조건이나
    일부 시설 이야기라 넣지 않는다. 2026-09-30 문화시설 40곳 표본에서 38곳이 채워져 있었고
    연중무휴, 매월 몇째 주, 시설별 안내가 섞여 있었다."""
    text = re.sub(r'<br\s*/?>', '\n', raw or '', flags=re.I)
    parts = [p.strip(' ,') for p in re.split(r'[/\n]', text)]
    # '- 자료열람실 매주 금요일'처럼 목록으로 시설마다 나눠 적은 것은 시설 전체의 휴관일이 아니다
    if not parts[0] or re.search(r'(?m)^\s*[-•ㆍ]\s', text) or re.search(r'매월|첫째|둘째|셋째|넷째|다섯째|격주|다음', parts[0]):
        return []
    days = set()
    for i, part in enumerate(parts):
        text = re.sub(r'\([^)]*\)', '', part)
        for seg in re.split(r'\s*,\s*', text) if i == 0 else [text]:
            if i and not re.fullmatch(_DAY_SPAN, seg.strip()):
                continue
            for m in re.finditer(_DAY_SPAN, seg):
                i0 = WEEKDAYS.index(m.group(1))
                j0 = WEEKDAYS.index(m.group(2)) if m.group(2) else i0
                days.update(WEEKDAYS[i0:j0 + 1] if i0 <= j0 else WEEKDAYS[i0:] + WEEKDAYS[:j0 + 1])
            if i == 0 and '주말' in seg:
                days.update("토일")
    # '매주 월요일~일요일'(충현박물관)처럼 7일 전부면 개관 요일을 적은 것이라 매일 휴관으로 읽으면 안 된다
    return [] if len(days) == len(WEEKDAYS) else [f"{d}요일" for d in WEEKDAYS if d in days]


# detailIntro2의 유형별 주차 필드와 요금 필드(2026-10-29 표본 응답 키). 축제(15)에는 주차 필드가 없다
PARKING_FIELDS = {"12": ("parking",), "14": ("parkingculture", "parkingfee"), "28": ("parkingleports", "parkingfeeleports"),
                  "32": ("parkinglodging",), "38": ("parkingshopping",)}


def parking_fields(intro, content_type_id):
    """detailIntro 응답 → parking_info. 값이 없거나 읽을 수 없으면 None(DB 기본값 unknown).
    유료를 무료보다 먼저 보는 것은 '최대 4시간 무료 ... 2,000원'처럼 부분 무료인 곳을 free로 보이지 않기 위해서다(P-208)."""
    raw = " ".join((intro or {}).get(f) or "" for f in PARKING_FIELDS.get(str(content_type_id), ()))
    text = re.sub(r'\s+', ' ', re.sub(r'<br\s*/?>', ' ', raw, flags=re.I)).strip()
    if not text:
        return None
    for kind, pattern in (("impossible", r'불가|없음'), ("paid", r'유료|\d\s*원'), ("free", r'무료'), ("available", r'가능|있음')):
        if re.search(pattern, text):
            return {"type": kind, "detail": text}
    return None


def fetch_intro(api_key, content_id, content_type_id="14"):
    op = "detailIntro2" if "KorService2" in TOUR_API_BASE else "detailIntro1"
    q = urllib.parse.urlencode({"serviceKey": api_key, "MobileOS": "ETC", "MobileApp": "OneulDate", "_type": "json",
                                "contentId": str(content_id), "contentTypeId": str(content_type_id)})
    for attempt in range(3):
        try:
            data = tour_get_json(f"{TOUR_API_BASE}/{op}?{q}")
            items = ((data.get("response") or {}).get("body") or {}).get("items") or {}
            item = (items.get("item") or [None])[0] if isinstance(items, dict) else None
            return item or {}
        except TourApiRateLimited:
            raise
        except Exception as e:
            err = e
            time.sleep(2 * (attempt + 1))
    raise TourApiFetchFailed(f"intro {content_id}: {err}")


def fetch_usefee(api_key, content_id):
    return fetch_intro(api_key, content_id).get("usefee") or None


def run_fee_backfill(apply=False, log=print, backup_dir=None, limit=None):
    env = load_env()
    base_url = (os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY") or ""
    api_key = _tour_api_key()
    if not base_url or not api_key:
        log("SUPABASE_URL 또는 TourAPI 키가 없어 중단한다")
        return 1
    headers = {"Content-Type": "application/json"}
    if key:
        headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    rows, last = [], 0
    while True:
        q = urllib.parse.urlencode({"select": "id,name,price,price_tier,avg_price_per_person,closed_days,business_hours,source,updated_at",
                                    "source->>type": "eq.tourapi", "source->>note": "eq.TourAPI 4.0 문화시설",
                                    "is_closed": "eq.false", "order": "id.asc", "id": f"gt.{last}", "limit": 1000})
        page = _request(f"{base_url}/rest/v1/spots?{q}", headers)
        if not page:
            break
        rows.extend(page)
        last = page[-1]["id"]
        if len(page) < 1000:
            break
    targets = [r for r in rows if not r.get("price") or not r.get("closed_days") or not r.get("business_hours")]
    # TourAPI 하루 한도(개발 계정 약 1,000회)를 수집기와 나눠 쓰므로 한 번에 limit행까지만 조회한다
    todo = targets[:limit] if limit else targets
    plans, failed = [], 0
    for r in todo:
        cotid = (r["source"].get("url") or "").rsplit("cotid=", 1)[-1]
        try:
            intro = fetch_intro(api_key, cotid) if cotid else {}
        except TourApiRateLimited:
            log(f"TourAPI 한도 초과로 조회를 멈춘다(오늘 호출 {usage_today()}회). 여기까지 받은 {len(plans)}행만 다룬다")
            break
        except TourApiFetchFailed as e:
            failed += 1
            log(f"  조회 실패로 건너뜀: {r['id']} {r['name']} ({e})")
            continue
        time.sleep(0.3)
        # 이미 있는 칸은 건드리지 않는다
        fields = (fee_fields(intro.get("usefee")) if not r.get("price") else None) or {}
        closed = parse_closed_days(intro.get("restdateculture")) if not r.get("closed_days") else []
        if closed:
            fields = {**fields, "closed_days": closed}
        hours = hours_fields(intro.get("usetimeculture")) if not r.get("business_hours") else None
        if hours:
            fields = {**fields, "business_hours": hours}
        if fields:
            plans.append((r, fields))
    fees = [f for _, f in plans if f.get("price")]
    free = sum(1 for f in fees if f["price_tier"] == "FREE")
    priced = sum(1 for f in fees if f["avg_price_per_person"])
    closed_n = sum(1 for _, f in plans if f.get("closed_days"))
    hours_n = sum(1 for _, f in plans if f.get("business_hours"))
    log(f"문화시설 {len(rows)}행 · price나 closed_days나 business_hours가 빈 행 {len(targets)} · 이번 조회 {len(todo)} · 조회 실패 {failed} · "
        f"요금 받음 {len(fees)}(금액 {priced}, 무료 {free}, 등급 없음 {len(fees) - priced - free}) · 휴관 요일 받음 {closed_n} · 이용시간 받음 {hours_n}")
    for r, f in plans[:12]:
        log(f"  {r['id']} {r['name']} | {(f.get('price') or '')[:50]} | {f.get('price_tier')} {f.get('avg_price_per_person')} | {f.get('closed_days')} | {f.get('business_hours')}")
    if not apply or not plans:
        if not apply:
            log("드라이런: DB에 쓰지 않았다. 실제 반영은 --apply")
        return 0

    backup_dir = backup_dir or os.path.expanduser("~/oneul-backups")
    os.makedirs(backup_dir, exist_ok=True)
    path = os.path.join(backup_dir, f"tour_fee_{datetime.now(KST).strftime('%Y%m%d-%H%M%S')}.json")
    with open_new(path) as fp:
        json.dump([r for r, _ in plans], fp, ensure_ascii=False, indent=2)
    log(f"백업: {fp.name}")
    now = datetime.now(timezone.utc).isoformat()
    for r, f in plans:
        body = {k: v for k, v in f.items() if v is not None}
        body["updated_at"] = now
        _request(f"{base_url}/rest/v1/spots?id=eq.{r['id']}", {**headers, "Prefer": "return=minimal"}, "PATCH", body)
    log(f"반영 완료: {len(plans)}행")
    return 0


# P-208 (b) 관광지 주차 백필의 하루 몫. 수집기와 한도 1,000회를 나눠 쓰므로 그날 사용량이 700 이상이면 쉰다(2026-10-29 사용자 결정)
PARKING_DAILY_CAP = 300
PARKING_SKIP_AT = 700
# 값이 없는 행은 unknown으로 남으므로, 마지막으로 조회한 id를 사용량 파일 옆에 남겨 다음 날 그 뒤부터 본다
PARKING_STATE = os.path.join(os.path.dirname(USAGE_FILE), ".parking_backfill.json")


def run_parking_backfill(apply=False, log=print, backup_dir=None, limit=PARKING_DAILY_CAP):
    """열린 tourapi 관광지(12) 중 parking_info가 unknown인 행에 detailIntro 주차 값을 채운다.
    TourAPI 호출은 limit회까지, 분류한 값만 쓴다. 쓰기 전에 그 회차의 대상 행을 p208b_<시각>.json으로 백업하고,
    그 백업이 그날의 실행 표시라 재기동해도 하루 한 번만 돈다."""
    backup_dir = backup_dir or os.path.expanduser("~/oneul-backups")
    day = datetime.now(KST).strftime('%Y%m%d')
    if apply and os.path.isdir(backup_dir) and any(f.startswith(f"p208b_{day}-") for f in os.listdir(backup_dir)):
        log(f"주차 백필: 오늘({day}) 이미 돌아 건너뛴다")
        return 0
    used = usage_today()
    if used < 0 or used >= PARKING_SKIP_AT:
        log(f"주차 백필: 오늘 TourAPI 사용량 {used}회라 건너뛴다(기준 {PARKING_SKIP_AT}회)")
        return 0
    env = load_env()
    base_url = (os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY") or ""
    api_key = _tour_api_key()
    if not base_url or not api_key:
        log("SUPABASE_URL 또는 TourAPI 키가 없어 중단한다")
        return 1
    headers = {"Content-Type": "application/json"}
    if key:
        headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    cond = {"is_closed": "eq.false", "source->>type": "eq.tourapi", "parking_info->>type": "eq.unknown"}
    last = load_json(PARKING_STATE, {}).get("last_id", 0)
    q = urllib.parse.urlencode({"select": "id,name,parking_info,source,updated_at", **cond, "id": f"gt.{last}",
                                "source->>note": "like.TourAPI 4.0 관광지*", "order": "id.asc", "limit": limit})
    todo = _request(f"{base_url}/rest/v1/spots?{q}", headers) or []
    if apply and todo:
        os.makedirs(backup_dir, exist_ok=True)
        with open_new(os.path.join(backup_dir, f"p208b_{datetime.now(KST).strftime('%Y%m%d-%H%M')}.json")) as fp:
            json.dump([{k: r.get(k) for k in ("id", "name", "parking_info", "updated_at")} for r in todo], fp, ensure_ascii=False, indent=2)
        log(f"백업: {fp.name}")

    start, plans, failed = usage_today(), [], 0
    for r in todo:
        # 재시도도 호출로 세므로 행 수가 아니라 사용량 증가분으로 상한을 본다
        if usage_today() - start >= limit:
            break
        cotid = (r["source"].get("url") or "").rsplit("cotid=", 1)[-1]
        try:
            info = parking_fields(fetch_intro(api_key, cotid, "12"), "12") if cotid else None
        except TourApiRateLimited:
            log(f"TourAPI 한도 초과로 조회를 멈춘다(오늘 호출 {usage_today()}회)")
            break
        except TourApiFetchFailed as e:
            failed += 1
            log(f"  조회 실패로 건너뜀: {r['id']} {r['name']} ({e})")
            last = r["id"]
            continue
        last = r["id"]
        time.sleep(0.3)
        if info:
            plans.append((r, info))
    kinds = {}
    for _, info in plans:
        kinds[info["type"]] = kinds.get(info["type"], 0) + 1
    log(f"주차 백필: 대상 {len(todo)}행 · 호출 {usage_today() - start}회 · 조회 실패 {failed} · 값 있음 {len(plans)} {kinds}")
    if not apply:
        log("드라이런: DB에 쓰지 않았다. 실제 반영은 --apply")
        return 0
    now = datetime.now(timezone.utc).isoformat()
    for r, info in plans:
        q = urllib.parse.urlencode({"id": f"eq.{r['id']}", **cond})
        _request(f"{base_url}/rest/v1/spots?{q}", {**headers, "Prefer": "return=minimal"}, "PATCH",
                 {"parking_info": info, "updated_at": now})
    atomic_dump(PARKING_STATE, {"last_id": last})
    log(f"반영 완료: {len(plans)}행")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다(기본은 드라이런)")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    ap.add_argument("--limit", type=int, help="이번에 조회할 최대 행 수(TourAPI 하루 한도를 나눠 쓸 때)")
    ap.add_argument("--parking", action="store_true", help="요금 대신 관광지 주차 백필(P-208)을 돌린다")
    args = ap.parse_args()
    if args.parking:
        sys.exit(run_parking_backfill(apply=args.apply, backup_dir=args.backup_dir, limit=args.limit or PARKING_DAILY_CAP))
    sys.exit(run_fee_backfill(apply=args.apply, backup_dir=args.backup_dir, limit=args.limit))
