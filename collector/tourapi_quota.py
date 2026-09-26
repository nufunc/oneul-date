"""TourAPI 호출 공통 창구: 날짜별(KST) 호출 수를 파일에 세고, 429(한도 초과)는 예외로 올린다.
2026-09-27에 하루 한도(개발 계정 약 1,000회)를 넘긴 뒤 조회 실패가 None으로 조용히 넘어가, 요금·기간이 빈 채 적재됐다.
"""
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
# 수집기 볼륨(LOG_DIR의 상위)에 둬 재배포 뒤에도 그날 사용량이 이어진다. 로컬 실행은 이 파일 옆에 둔다
USAGE_FILE = os.path.join(os.path.dirname(os.environ["LOG_DIR"]) if os.environ.get("LOG_DIR")
                          else os.path.dirname(os.path.abspath(__file__)), ".tourapi_usage.json")


class TourApiRateLimited(Exception):
    """TourAPI가 429를 돌려줬다. 그날 남은 TourAPI 작업은 멈춘다."""


def _count():
    day = datetime.now(KST).strftime("%Y-%m-%d")
    try:
        with open(USAGE_FILE, encoding="utf-8") as f:
            usage = json.load(f)
    except Exception:
        usage = {}
    usage = {k: v for k, v in usage.items() if k >= (datetime.now(KST) - timedelta(days=7)).strftime("%Y-%m-%d")}
    usage[day] = usage.get(day, 0) + 1
    try:
        with open(USAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(usage, f)
    except Exception:
        pass
    return usage[day]


def usage_today():
    try:
        with open(USAGE_FILE, encoding="utf-8") as f:
            return json.load(f).get(datetime.now(KST).strftime("%Y-%m-%d"), 0)
    except Exception:
        return 0


def tour_get_json(url, timeout=15):
    """TourAPI GET. 호출 수를 세고, 429면 경고를 남기고 TourApiRateLimited를 올린다. 그 밖의 오류는 그대로 올린다."""
    n = _count()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OneulDate-DataEngine/4.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"  ⚠️ [TourAPI 한도 초과] HTTP 429 — 오늘 {n}번째 호출에서 거절됨. 이번 회차의 TourAPI 작업을 멈춘다", flush=True)
            raise TourApiRateLimited() from e
        raise
