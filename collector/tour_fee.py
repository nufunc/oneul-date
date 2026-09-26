#!/usr/bin/env python3
"""TourAPI 문화시설(contentTypeId=14)의 이용요금(usefee)을 price에 적재한다. 기본은 드라이런, --apply일 때만 쓴다.
관광지(12)·쇼핑(38)은 detailIntro2에 요금 필드가 없고 레포츠(28)는 상세가 비어 와서 대상이 아니다(2026-09-27 확인).

- price: usefee 원문에서 HTML을 걷어낸 문자열(100자까지). 비어 있으면 넣지 않는다.
- price_tier·avg_price_per_person: 가장 높은 금액(대개 성인 요금)으로 derive_price_tier_from_text를 부른다.
  금액이 없고 '무료'라고만 적힌 경우만 FREE다. 빈 값을 무료로 읽지 않는다.
- 이미 price가 있는 행은 건드리지 않는다. 쓰기 전에 바꿀 행을 백업한다.

사용: python3 tour_fee.py [--apply] [--backup-dir DIR]
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

from supabase_worker import derive_price_tier_from_text, load_env
from event_period import TOUR_API_BASE, _request, _tour_api_key

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


def fetch_usefee(api_key, content_id):
    op = "detailIntro2" if "KorService2" in TOUR_API_BASE else "detailIntro1"
    q = urllib.parse.urlencode({"serviceKey": api_key, "MobileOS": "ETC", "MobileApp": "OneulDate", "_type": "json",
                                "contentId": str(content_id), "contentTypeId": "14"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{TOUR_API_BASE}/{op}?{q}", timeout=15) as res:
                items = ((json.loads(res.read().decode("utf-8")).get("response") or {}).get("body") or {}).get("items") or {}
            item = (items.get("item") or [None])[0] if isinstance(items, dict) else None
            return (item or {}).get("usefee") or None
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def run_fee_backfill(apply=False, log=print, backup_dir=None):
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
        q = urllib.parse.urlencode({"select": "id,name,price,price_tier,avg_price_per_person,source,updated_at",
                                    "source->>type": "eq.tourapi", "source->>note": "eq.TourAPI 4.0 문화시설",
                                    "is_closed": "eq.false", "order": "id.asc", "id": f"gt.{last}", "limit": 1000})
        page = _request(f"{base_url}/rest/v1/spots?{q}", headers)
        if not page:
            break
        rows.extend(page)
        last = page[-1]["id"]
        if len(page) < 1000:
            break
    targets = [r for r in rows if not r.get("price")]
    plans = []
    for r in targets:
        cotid = (r["source"].get("url") or "").rsplit("cotid=", 1)[-1]
        fields = fee_fields(fetch_usefee(api_key, cotid)) if cotid else None
        time.sleep(0.3)
        if fields:
            plans.append((r, fields))
    free = sum(1 for _, f in plans if f["price_tier"] == "FREE")
    priced = sum(1 for _, f in plans if f["avg_price_per_person"])
    log(f"문화시설 {len(rows)}행 · price 빈 행 {len(targets)} · 요금 받음 {len(plans)}(금액 {priced}, 무료 {free}, 등급 없음 {len(plans) - priced - free})")
    for r, f in plans[:12]:
        log(f"  {r['id']} {r['name']} | {f['price'][:50]} | {f['price_tier']} {f['avg_price_per_person']}")
    if not apply or not plans:
        if not apply:
            log("드라이런: DB에 쓰지 않았다. 실제 반영은 --apply")
        return 0

    backup_dir = backup_dir or os.path.expanduser("~/oneul-backups")
    os.makedirs(backup_dir, exist_ok=True)
    path = os.path.join(backup_dir, f"tour_fee_{datetime.now(KST).strftime('%Y%m%d-%H%M%S')}.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump([r for r, _ in plans], fp, ensure_ascii=False, indent=2)
    log(f"백업: {path}")
    now = datetime.now(timezone.utc).isoformat()
    for r, f in plans:
        body = {k: v for k, v in f.items() if v is not None}
        body["updated_at"] = now
        _request(f"{base_url}/rest/v1/spots?id=eq.{r['id']}", {**headers, "Prefer": "return=minimal"}, "PATCH", body)
    log(f"반영 완료: {len(plans)}행")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다(기본은 드라이런)")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()
    sys.exit(run_fee_backfill(apply=args.apply, backup_dir=args.backup_dir))
