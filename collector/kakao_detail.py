#!/usr/bin/env python3
"""카카오 장소 패널로 TourAPI 밖 열린 행의 영업시간(business_hours)과 정기 휴무(closed_days)를 채운다(P-226, 수집기 13단계).
같은 응답의 메뉴 가격으로 양 끝 가격대(price_tier)도 채운다(P-300). 기본은 드라이런, --apply일 때만 쓴다.

- 대상: 열림, source.type이 tourapi가 아님, provider_ids.kakao 있음, business_hours가 빈 행. id 오름차순으로 커서 뒤부터 본다.
- business_hours: {"영업시간": 문구}. 상세 시트가 키를 그대로 라벨로 보인다(src/main.ts:8101-8104).
- closed_days: open_hours.headline_addition.current_off_day_desc가 '매주 ~ 휴무'일 때 parse_closed_days로 읽은 요일.
- 쓰지 않는 행: 응답 실패(404 포함), summary.status가 Y가 아님, 영업시간 안내에 '임시 휴업', 패널과 DB 주소의 도로명이 다르거나
  어느 한쪽에 도로명이 없음. 읽을 때 빈 칸만 쓰고, 읽은 updated_at이 그대로인 행에만 쓴다.
- price_tier(P-300): 식음료(category가 DINING)이고 price_tier·avg_price_per_person·price가 모두 빈 행만, 패널 메뉴 가격(0 이하와 '변동가격' -1 제외)이 3개 이상이고
  패널 이름이 DB 이름과 같거나 포함 관계일 때 평균이 15,000원 미만이면 ₩, 30,000원 이상이면 ₩₩₩ 또는 ₩₩₩₩(경계는 price_tier_from_avg).
  가운데(15,000~30,000원)는 비운다. 앱이 avg_price_per_person을 '1인 약 N원'으로 보이고 메뉴 평균은 1인 가격이 아니라서
  avg_price_per_person과 price 문구는 쓰지 않는다. 백업은 p300_<시각>.json.
- 패널 주소는 비공식이라 차단 기준을 모른다. 하루 한도는 KAKAO_DETAIL_DAILY_CAP(기본 500), 연속 실패 5회면 그날 멈춘다.

사용: python3 kakao_detail.py [--apply] [--backup-dir DIR] [--limit N]
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
from supabase_worker import load_env, price_tier_from_avg
from event_period import _request
from tour_fee import parse_closed_days
from tourapi_quota import USAGE_FILE
from miners.tourapi_miner import KAKAO_PANEL_URL

KST = timezone(timedelta(hours=9))
# 리드 조건(P-226): 처음 3일은 500회로 시작하고 차단이 없으면 환경 변수로 올린다
DAILY_CAP = int(os.getenv("KAKAO_DETAIL_DAILY_CAP") or 500)
MAX_CONSECUTIVE_FAILS = 5
PANEL_INTERVAL = 1.0
# 12단계 커서(.parking_backfill.json)와 같은 볼륨(/mnt/data)에 둔다
STATE = os.path.join(os.path.dirname(USAGE_FILE), ".kakao_detail_backfill.json")
DAYS = "월화수목금토일"
# '고양대로 1955', '도산대로57길 8', '연희로11가길 47 지하1층'에서 도로명만 뽑는다. 지번 주소에는 걸리지 않는다
ROAD = re.compile(r'(?:^|\s)([가-힣A-Za-z0-9·.]+(?:로|길))\s*(?:지하\s*)?\d')
MENU_MIN_PRICES = 3
# src/main.ts DINING_CATEGORY_RE와 같은 식음료 범위. P-300 표본이 식음료뿐이라 펜션·박물관·공원의 메뉴 가격은 읽지 않는다. 앱이 바꾸면 여기도 바꾼다
DINING = re.compile(r"카페|커피|양식|한식|이탈리안|제과|베이커리|디저트|호프|요리주점|육류|고기|주점|일식|칵테일바|와인바|술집|해물|생선|분식|회$|국수|피자|한정식|포장마차|칼국수|중국요리|돈까스|우동|찻집|맥주")
TIER_LOW_BELOW, TIER_HIGH_FROM = 15000, 30000  # 이 사이는 한 단계 안 오차가 잦아(표본 평균 일치 47%) 비운다


class PanelFailed(Exception):
    pass


def fetch_panel(kakao_id):
    req = urllib.request.Request(KAKAO_PANEL_URL.format(kakao_id),
                                 headers={"User-Agent": "Mozilla/5.0", "pf": "web", "Referer": "https://map.kakao.com/"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        raise PanelFailed(str(e)) from e


def road_name(address):
    m = ROAD.search(address or "")
    return m.group(1) if m else None


def hours_text(open_hours):
    """패널 open_hours → '매일 10:00 ~ 18:00' 또는 '화 18:00 ~ 23:30 / 수 ...'. 없으면 None.
    all의 '기본 영업시간'을 먼저 쓰고, 없으면 이번 주 7일(week_from_today)의 요일별 값을 잇는다.
    이번 주 7일은 그 주에만 쉬는 요일이 문구에서 빠진다(2026-11-01 표본 2행)."""
    oh = open_hours or {}
    base = next((p for p in (oh.get("all") or {}).get("periods") or [] if p.get("period_title") == "기본 영업시간"), None)
    if base:
        parts = [f"{d.get('day_of_the_week') or ''} {t}".strip() for d in base.get("days") or []
                 if (t := (d.get("on_days") or {}).get("start_end_time_desc"))]
        return " / ".join(parts) or None
    by = {}
    for w in (oh.get("week_from_today") or {}).get("week_periods") or []:
        for d in w.get("days") or []:
            t = (d.get("on_days") or {}).get("start_end_time_desc")
            if t:
                by[(d.get("day_of_the_week_desc") or "")[:1]] = t
    if not by:
        return None
    if len(by) == 7 and len(set(by.values())) == 1:
        return f"매일 {next(iter(by.values()))}"
    return " / ".join(f"{d} {by[d]}" for d in DAYS if d in by)


def _name_key(name):
    return re.sub(r"[\s·\-()\[\]]", "", name or "").lower()


def price_empty(row):
    """가격 칸이 모두 빈 식음료 행. 가격대를 채울 수 있는 행이다"""
    return not (row.get("price_tier") or row.get("avg_price_per_person") or row.get("price")) and bool(DINING.search(row.get("category") or ""))


def menu_price_tier(panel, row):
    """패널 메뉴 가격 평균의 양 끝 가격대. 이름이 다르거나 가격이 3개 미만이거나 평균이 가운데면 None."""
    a, b = _name_key((panel.get("summary") or {}).get("name")), _name_key(row.get("name"))
    if not a or not b or not (a in b or b in a):
        return None
    items = ((panel.get("menu") or {}).get("menus") or {}).get("items") or []
    prices = [i["price"] for i in items if type(i.get("price")) is int and i["price"] > 0]
    if len(prices) < MENU_MIN_PRICES:
        return None
    mean = sum(prices) / len(prices)
    return price_tier_from_avg(mean) if mean < TIER_LOW_BELOW or mean >= TIER_HIGH_FROM else None


def panel_fields(panel, row):
    """패널 응답과 DB 행 → (쓸 칸, 건너뛴 까닭). 쓸 칸은 읽을 때 빈 칸만 담는다."""
    summary = panel.get("summary") or {}
    if summary.get("status") != "Y":
        return {}, "status"
    oh = panel.get("open_hours") or {}
    if re.search(r"임시\s*휴업", json.dumps(oh, ensure_ascii=False)):
        return {}, "temp_closed"
    road = road_name((summary.get("address") or {}).get("road"))
    if not road or road != road_name(row.get("address")):
        return {}, "road"
    fields = {}
    text = hours_text(oh) if not row.get("business_hours") else None
    if text:
        fields["business_hours"] = {"영업시간": text}
    off = ((oh.get("headline_addition") or {}).get("current_off_day_desc") or "").strip()
    closed = parse_closed_days(off) if off.startswith("매주") and not row.get("closed_days") else []
    if closed:
        fields["closed_days"] = closed
    tier = menu_price_tier(panel, row) if price_empty(row) else None
    if tier:
        fields["price_tier"] = tier
    return fields, None if fields else "empty"


def run_kakao_detail_backfill(apply=False, log=print, backup_dir=None, limit=None):
    """수집기 13단계. 하루 limit회(기본 DAILY_CAP)까지 패널을 1초 간격으로 읽어 빈 영업시간과 정기 휴무와 가격대를 채운다.
    쓰기 전에 그 회차의 대상 행을 p226_<시각>.json으로(가격 칸이 모두 빈 행은 p300_<시각>.json으로도) 백업하고, 그 백업이 그날의 실행 표시라 재기동해도 하루 한 번만 돈다.
    드라이런은 DB에 쓰지 않고 계획만 p226_<시각>_dry.json으로 남긴다."""
    limit = limit or DAILY_CAP
    backup_dir = backup_dir or os.path.expanduser("~/oneul-backups")
    day = datetime.now(KST).strftime('%Y%m%d')
    if apply and os.path.isdir(backup_dir) and any(f.startswith(f"p226_{day}-") and not f.endswith("_dry.json")
                                                   for f in os.listdir(backup_dir)):
        log(f"카카오 영업시간 백필: 오늘({day}) 이미 돌아 건너뛴다")
        return 0
    env = load_env()
    base_url = (os.getenv("SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY") or ""
    if not base_url:
        log("SUPABASE_URL이 없어 중단한다")
        return 1
    headers = {"Content-Type": "application/json"}
    if key:
        headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    cond = {"is_closed": "eq.false", "source->>type": "neq.tourapi"}
    last = load_json(STATE, {}).get("last_id", 0)
    q = urllib.parse.urlencode({"select": "id,name,address,category,business_hours,closed_days,provider_ids,price,price_tier,avg_price_per_person,updated_at", **cond,
                                "provider_ids->>kakao": "not.is.null", "business_hours": "eq.{}", "id": f"gt.{last}",
                                "order": "id.asc", "limit": limit})
    todo = _request(f"{base_url}/rest/v1/spots?{q}", headers) or []
    stamp = datetime.now(KST).strftime('%Y%m%d-%H%M')
    if apply and todo:
        os.makedirs(backup_dir, exist_ok=True)
        with open_new(os.path.join(backup_dir, f"p226_{stamp}.json")) as fp:
            json.dump([{k: r.get(k) for k in ("id", "name", "business_hours", "closed_days", "updated_at")} for r in todo],
                      fp, ensure_ascii=False, indent=2)
        log(f"백업: {fp.name}")
        priced = [r for r in todo if price_empty(r)]
        if priced:
            with open_new(os.path.join(backup_dir, f"p300_{stamp}.json")) as fp:
                json.dump([{k: r.get(k) for k in ("id", "name", "price_tier", "avg_price_per_person", "updated_at")} for r in priced],
                          fp, ensure_ascii=False, indent=2)
            log(f"백업: {fp.name}")

    plans, skipped, calls, fails, streak_start = [], {}, 0, 0, None
    for r in todo:
        if calls:
            time.sleep(PANEL_INTERVAL)
        calls += 1
        try:
            panel = fetch_panel(r["provider_ids"]["kakao"])
        except PanelFailed as e:
            fails += 1
            skipped["fail"] = skipped.get("fail", 0) + 1
            streak_start = last if streak_start is None else streak_start
            last = r["id"]
            if fails >= MAX_CONSECUTIVE_FAILS:
                # 차단일 수 있으므로 연속 실패한 행은 지나간 것으로 남기지 않고 다음 날 다시 본다
                last = streak_start
                log(f"  패널 연속 실패 {fails}회로 오늘 단계를 멈춘다(마지막 오류: {e})")
                break
            continue
        fails, streak_start, last = 0, None, r["id"]
        fields, why = panel_fields(panel, r)
        if fields:
            plans.append((r, fields))
        else:
            skipped[why] = skipped.get(why, 0) + 1
    hours_n = sum(1 for _, f in plans if f.get("business_hours"))
    closed_n = sum(1 for _, f in plans if f.get("closed_days"))
    tier_n = sum(1 for _, f in plans if f.get("price_tier"))
    log(f"카카오 영업시간 백필: 대상 {len(todo)}행 · 패널 호출 {calls}회 · 쓸 행 {len(plans)}(영업시간 {hours_n}, 정기 휴무 {closed_n}, 가격대 {tier_n}) · "
        f"건너뜀 {skipped}")
    if not apply:
        os.makedirs(backup_dir, exist_ok=True)
        with open_new(os.path.join(backup_dir, f"p226_{stamp}_dry.json")) as fp:
            json.dump({"calls": calls, "skipped": skipped, "plans": [{"row": r, "fields": f} for r, f in plans]},
                      fp, ensure_ascii=False, indent=2)
        for r, f in plans[:10]:
            log(f"  {r['id']} {r['name']} | {f}")
        log(f"드라이런: DB에 쓰지 않았다. 계획: {fp.name}. 실제 반영은 --apply")
        return 0
    now = datetime.now(timezone.utc).isoformat()
    for r, fields in plans:
        q = urllib.parse.urlencode({"id": f"eq.{r['id']}", **cond, "updated_at": f"eq.{r['updated_at']}"})
        _request(f"{base_url}/rest/v1/spots?{q}", {**headers, "Prefer": "return=minimal"}, "PATCH", {**fields, "updated_at": now})
    atomic_dump(STATE, {"last_id": last})
    log(f"반영 완료: {len(plans)}행")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다(기본은 드라이런)")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    ap.add_argument("--limit", type=int, help=f"이번에 부를 패널 최대 횟수(기본 {DAILY_CAP})")
    args = ap.parse_args()
    sys.exit(run_kakao_detail_backfill(apply=args.apply, backup_dir=args.backup_dir, limit=args.limit))
