#!/usr/bin/env python3
"""TourAPI 행사(축제/행사)의 기간을 채우고, 끝난 행사를 닫고, 다음 회차가 잡힌 연례 행사를 다시 연다.
기본은 드라이런이고 --apply일 때만 DB에 쓴다.

기간은 source.event에 둔다: {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "play_time": str, "place": str, "synced_at": ISO}.
metrics는 enrich 단계가 매번 통째로 덮어쓰고 business_hours는 앱이 요일별 영업시간으로 읽어 쓰지 않는다.

- 기간이 없거나 REFRESH_DAYS보다 오래된 행은 detailIntro2(contentTypeId=15)로 다시 받는다(연례 행사는 같은 contentid의 날짜가 바뀐다).
- 열린 행의 종료일이 오늘(KST)보다 이르면 닫고 source.note에 'closed: 행사 종료(종료일)'를 남긴다.
- 이 단계가 닫은 행(note에 'closed: 행사 종료')의 새 종료일이 오늘 이후면 다시 열고 'reopened: 다음 회차'를 남긴다.
  사람이 다른 사유로 닫은 행은 열지 않는다.

사용: python3 event_period.py [--apply]
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from supabase_worker import load_env

TOUR_API_BASE = os.getenv("TOUR_API_BASE") or "https://apis.data.go.kr/B551011/KorService2"
KST = timezone(timedelta(hours=9))
REFRESH_DAYS = 7
AUTO_CLOSE_MARK = "closed: 행사 종료"


def _tour_api_key():
    env = load_env()
    for k in ("TOUR_API_KEY", "PUBLIC_DATA_PORTAL_KEY", "KOREA_TOUR_API_KEY", "DATA_GO_KR_API_KEY"):
        v = os.getenv(k) or env.get(k)
        if v:
            return urllib.parse.unquote(v.strip())
    return ""


def _ymd(v):
    v = (v or "").strip()
    return f"{v[:4]}-{v[4:6]}-{v[6:8]}" if len(v) == 8 and v.isdigit() else None


def fetch_event_period(api_key, content_id):
    """detailIntro2로 행사 기간을 받는다. 날짜를 읽지 못하면 None."""
    op = "detailIntro2" if "KorService2" in TOUR_API_BASE else "detailIntro1"
    q = urllib.parse.urlencode({"serviceKey": api_key, "MobileOS": "ETC", "MobileApp": "OneulDate", "_type": "json",
                                "contentId": str(content_id), "contentTypeId": "15"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{TOUR_API_BASE}/{op}?{q}", timeout=15) as res:
                items = ((json.loads(res.read().decode("utf-8")).get("response") or {}).get("body") or {}).get("items") or {}
            item = (items.get("item") or [None])[0] if isinstance(items, dict) else None
            if not item:
                return None
            start, end = _ymd(item.get("eventstartdate")), _ymd(item.get("eventenddate"))
            if not start or not end:
                return None
            return {"start": start, "end": end, "play_time": (item.get("playtime") or "")[:80],
                    "place": (item.get("eventplace") or "")[:80], "synced_at": datetime.now(timezone.utc).isoformat()}
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def _request(url, headers, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=30) as res:
                raw = res.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(10)


def _event_rows(base_url, headers):
    """TourAPI 행사 행 전체(열린 행과 닫힌 행). 키셋으로 받는다."""
    rows, last = [], 0
    while True:
        q = urllib.parse.urlencode({"select": "id,name,is_closed,source", "source->>type": "eq.tourapi",
                                    "category": "eq.축제/행사", "order": "id.asc", "id": f"gt.{last}", "limit": 1000})
        page = _request(f"{base_url}/rest/v1/spots?{q}", headers)
        if not page:
            return rows
        rows.extend(page)
        last = page[-1]["id"]
        if len(page) < 1000:
            return rows


def plan_event_updates(rows, fetch, today, now=None):
    """행마다 (새 source, 새 is_closed 또는 None, 사유)를 계산한다. fetch(content_id)는 기간 dict 또는 None."""
    now = now or datetime.now(timezone.utc)
    plans = []
    for r in rows:
        src = r.get("source") if isinstance(r.get("source"), dict) else {}
        cotid = (src.get("url") or "").rsplit("cotid=", 1)[-1] if "cotid=" in (src.get("url") or "") else ""
        event = src.get("event") if isinstance(src.get("event"), dict) else None
        stale = not event or not event.get("synced_at") or \
            now - datetime.fromisoformat(event["synced_at"]) > timedelta(days=REFRESH_DAYS)
        fetched = fetch(cotid) if (stale and cotid) else None
        new_event = fetched or event
        new_src = {**src, "event": new_event} if fetched else src
        note = src.get("note") or ""
        closed_by_us = AUTO_CLOSE_MARK in note.rsplit("reopened:", 1)[-1]
        action = None
        if new_event and new_event.get("end"):
            if not r.get("is_closed") and new_event["end"] < today:
                action = "close"
                new_src = {**new_src, "note": f"{note} | {AUTO_CLOSE_MARK}({new_event['end']}) ({today} 자동)".lstrip(" |")}
            elif r.get("is_closed") and closed_by_us and new_event["end"] >= today:
                action = "reopen"
                new_src = {**new_src, "note": f"{note} | reopened: 다음 회차 {new_event['start']}~{new_event['end']} ({today} 자동)"}
        plans.append({"id": r["id"], "name": r.get("name"), "fetched": bool(fetched), "has_period": bool(new_event),
                      "action": action, "source": new_src, "changed": new_src is not src})
    return plans


def run_event_sync(apply=False, log=print):
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

    today = datetime.now(KST).strftime("%Y-%m-%d")
    rows = _event_rows(base_url, headers)

    def fetch(cotid):
        time.sleep(0.3)
        return fetch_event_period(api_key, cotid)

    plans = plan_event_updates(rows, fetch, today)
    closes = [p for p in plans if p["action"] == "close"]
    reopens = [p for p in plans if p["action"] == "reopen"]
    log(f"행사 행 {len(rows)}개 · 기간 새로 받음 {sum(p['fetched'] for p in plans)} · 기간 없음 {sum(not p['has_period'] for p in plans)} · "
        f"닫을 행 {len(closes)} · 다시 열 행 {len(reopens)}")
    for p in (closes + reopens)[:15]:
        ev = p["source"].get("event") or {}
        log(f"  {p['action']} {p['id']} {p['name']} ({ev.get('start')}~{ev.get('end')})")
    if not apply:
        log("드라이런: DB에 쓰지 않았다. 실제 반영은 --apply")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    for p in plans:
        if not p["changed"]:
            continue
        body = {"source": p["source"], "updated_at": now}
        if p["action"] == "close":
            body["is_closed"] = True
        elif p["action"] == "reopen":
            body["is_closed"] = False
        _request(f"{base_url}/rest/v1/spots?id=eq.{p['id']}", {**headers, "Prefer": "return=minimal"}, "PATCH", body)
    log(f"반영 완료: 기간 {sum(p['fetched'] for p in plans)}행, 닫음 {len(closes)}행, 다시 엶 {len(reopens)}행")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다(기본은 드라이런)")
    sys.exit(run_event_sync(apply=ap.parse_args().apply))
