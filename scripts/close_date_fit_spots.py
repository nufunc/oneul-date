#!/usr/bin/env python3
"""P-044 일회성 교정: judge_date_fit.py 결과의 소프트 삭제 목록을 닫고 교정 목록의 슬롯을 바꾼다. 기본은 드라이런이고 --apply일 때만 쓴다.

라이브 DB에서 대상 행을 다시 읽어 지금도 열려 있고 같은 규칙에 걸리는 행만 고친다(그사이 바뀐 행은 제외).
기간 없는 행사(R4)는 --festival-lookup이면 닫기 전에 TourAPI searchFestival2로 올해 행사 목록을 한 번 받아 이름(공백·기호·연도 제외)이
같은 행사를 찾는다. 종료일이 오늘 이후면 열어 두고 source.event만 채운다(앱이 종료일 뒤에 숨긴다).
TourAPI 행의 contentid는 detailIntro2가 빈 응답을 돌려줘(10-03 수집기 11단계: 기간 없음 48) event_period.py로는 채울 수 없다.
닫는 행은 source.note에 closed: P-044를 남겨 recover_naver_captcha_closures.py가 되열지 않게 한다.

OCI 호스트에서 돌린다. LOG_DIR는 수집기 컨테이너와 같은 TourAPI 사용량 파일을 쓰게 하고, 그 파일이 root 소유라 sudo로 돈다:
sudo COLLECTOR_DIR=/mnt/data/git/oneul-date/collector LOG_DIR=/mnt/data/git/oneul-date/collector/data/logs \\
  python3 close_date_fit_spots.py date-fit-20261003.json --backup-dir /home/opc/oneul-backups [--festival-lookup] [--apply]
수작업 목록은 판정 파일 대신 --ids 1,2,3 --reason "영상 오매칭"으로 닫는다.
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from judge_date_fit import connect, judge

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
import tourapi_quota  # noqa: E402
from event_period import TOUR_API_BASE, _tour_api_key, _ymd  # noqa: E402

KST = timezone(timedelta(hours=9))


def request(url, headers, method="GET", body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=60) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def fetch_ids(base, headers, ids):
    rows = []
    for i in range(0, len(ids), 100):
        rows += request(f"{base}/rest/v1/spots?select=*&id=in.({','.join(map(str, ids[i:i + 100]))})", headers)
    return rows


def norm_title(s):
    return re.sub(r"[\s·,&!()\-]|20\d\d", "", s or "")


def fetch_festivals(year):
    """올해 시작한 TourAPI 행사 전체. 1,000건씩 받는다."""
    q = {"serviceKey": _tour_api_key(), "MobileOS": "ETC", "MobileApp": "OneulDate", "_type": "json",
         "eventStartDate": f"{year}0101", "numOfRows": 1000, "arrange": "A"}
    items, page = [], 1
    while True:
        body = tourapi_quota.tour_get_json(f"{TOUR_API_BASE}/searchFestival2?{urllib.parse.urlencode({**q, 'pageNo': page})}")
        body = body["response"]["body"]
        items += (body.get("items") or {}).get("item") or [] if isinstance(body.get("items"), dict) else []
        if page * 1000 >= int(body.get("totalCount") or 0):
            return items
        page += 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("judged", nargs="?", help="date-fit-YYYYMMDD.json")
    ap.add_argument("--ids", help="판정 파일 대신 닫을 id 목록(쉼표 구분). 판정을 다시 거치지 않고 열린 행만 닫는다")
    ap.add_argument("--reason", default="수작업 목록", help="--ids로 닫을 때 source.note에 남길 사유")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    ap.add_argument("--festival-lookup", action="store_true",
                    help="기간 없는 행사를 닫기 전에 searchFestival2로 기간을 찾는다(TourAPI 호출). 없으면 바로 닫는다")
    args = ap.parse_args()
    if args.festival_lookup:
        assert os.path.exists(tourapi_quota.USAGE_FILE), f"TourAPI 사용량 파일이 없다: {tourapi_quota.USAGE_FILE} (LOG_DIR 확인)"

    base, headers = connect()
    if args.ids:
        # 규칙 밖 수작업 목록(사이클 36 영상 오매칭 등). 사유를 규칙 이름 자리에 넣어 아래 닫기 경로를 그대로 쓴다
        planned = {int(i): ("close", {"rules": ["_" + args.reason]}) for i in args.ids.split(",")}
    else:
        judged = json.load(open(args.judged, encoding="utf-8"))
        planned = {item["id"]: ("close", item) for item in judged["close"]}
        planned.update({item["id"]: ("fix", item) for item in judged["fix"]})
    current = fetch_ids(base, headers, list(planned))
    by_id = {r["id"]: r for r in current}
    if args.ids:
        still = {i: planned[i] for i, r in by_id.items() if not r.get("is_closed")}
    else:
        # 지금 행으로 다시 판정해 같은 목록에 드는 행만 남긴다(close·fix 규칙은 전체 행 문맥을 쓰지 않는다)
        now_judged = judge([r for r in current if not r.get("is_closed")])
        still = {item["id"]: (action, item) for action in ("close", "fix") for item in now_judged[action]}
    excluded = {i: ("행 없음" if i not in by_id else "닫힘" if by_id[i].get("is_closed") else "조건 바뀜")
                for i, (action, _) in planned.items() if i not in still or still[i][0] != action}

    today = datetime.now(KST).strftime("%Y-%m-%d")
    events = [i for i, (a, item) in still.items() if a == "close" and "R4_기간없는_행사" in item["rules"] and i not in excluded]
    festivals = {}
    if events and args.festival_lookup:
        before = tourapi_quota.usage_today()
        for f in fetch_festivals(today[:4]):
            festivals.setdefault(norm_title(f.get("title")), f)
        print(f"TourAPI 행사 {len(festivals)}건 받음 · 오늘 사용량 {before} → {tourapi_quota.usage_today()}")

    plan = []
    for i, (action, item) in still.items():
        if i in excluded:
            continue
        row = by_id[i]
        if action == "fix":
            plan.append({"id": i, "do": "fix", "patch": item["patch"], "row": row})
            continue
        fest = festivals.get(norm_title(row["name"])) if i in events else None
        period = fest and {"start": _ymd(fest.get("eventstartdate")), "end": _ymd(fest.get("eventenddate"))}
        if period and period["start"] and period["end"] and period["end"] >= today:
            event = {**period, "play_time": "", "place": (fest.get("addr1") or "")[:80],
                     "synced_at": datetime.now(timezone.utc).isoformat()}
            plan.append({"id": i, "do": "event", "event": event, "festival": fest.get("contentid"), "row": row})
        else:
            reason = item["rules"][0].split("_", 1)[1].replace("_", " ")  # R4_기간없는_행사 → 기간없는 행사
            if period and period["end"]:
                reason += f", TourAPI 기간 {period['start']}~{period['end']} 종료"
            plan.append({"id": i, "do": "close", "reason": reason, "row": row})

    counts = {k: sum(p["do"] == k for p in plan) for k in ("close", "event", "fix")}
    print(f"대상 {len(planned)} · 제외 {len(excluded)} {excluded} · 닫을 행 {counts['close']} · 기간 채우고 열어 둘 행 "
          f"{counts['event']} · 슬롯 교정 {counts['fix']}")
    for p in plan:
        if p["do"] == "event" or (p["do"] == "close" and "TourAPI 기간" in p["reason"]):
            print(f"  {p['id']} {p['row']['name']}: {p['event'] if p['do'] == 'event' else p['reason']}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(args.backup_dir, f"p044_date_fit_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump({"rows": current, "plan": [{k: v for k, v in p.items() if k != "row"} for p in plan], "excluded": excluded},
                  f, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    done = {"close": 0, "event": 0, "fix": 0}
    failed = []
    for p in plan:
        row, source = p["row"], dict(p["row"].get("source") or {})
        if p["do"] == "close":
            source["note"] = f"{(source.get('note') or '').strip()} | closed: P-044 {p['reason']} ({stamp[:8]})".lstrip(" |")
            body, cond = {"is_closed": True, "source": source, "updated_at": now}, ""
        elif p["do"] == "event":
            body, cond = {"source": {**source, "event": p["event"]}, "updated_at": now}, ""
        else:
            body, cond = {**p["patch"], "updated_at": now}, "&slot=eq.day"
        res = request(f"{base}/rest/v1/spots?id=eq.{row['id']}&is_closed=eq.false{cond}", rep, "PATCH", body)
        if len(res or []) == 1:
            done[p["do"]] += 1
        else:
            failed.append((row["id"], p["do"]))
    print(f"닫음 {done['close']} · 기간 채움 {done['event']} · 슬롯 교정 {done['fix']} · 실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, [p["id"] for p in plan])}
    check = {"close": sum(after[p["id"]]["is_closed"] and "closed: P-044" in (after[p["id"]]["source"].get("note") or "")
                          for p in plan if p["do"] == "close"),
             "event": sum(not after[p["id"]]["is_closed"] and bool(after[p["id"]]["source"].get("event"))
                          for p in plan if p["do"] == "event"),
             "fix": sum(after[p["id"]]["slot"] == "stay" for p in plan if p["do"] == "fix")}
    print(f"쓰기 뒤 DB 재조회: 닫힘·표시 {check['close']}/{counts['close']} · 열림·기간 {check['event']}/{counts['event']} · "
          f"stay {check['fix']}/{counts['fix']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
