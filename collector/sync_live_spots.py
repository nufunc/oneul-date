"""
오늘 데이트 (oneul-date) — OCI DB ↔ 라이브 CDN 무중단 데이터 동기화 스크립트
OCI PostgreSQL (PostgREST API)에서 최신 유효 스팟 전수를 조회하여 public/data/spots.json을 갱신합니다.
"""

import os
import sys
import json
import time
import logging
from datetime import datetime

# Windows 콘솔 인코딩 대응
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("sync_live_spots")

try:
    import requests
except ImportError:
    logger.error("requests 라이브러리가 필요합니다: pip install requests")
    sys.exit(1)

try:
    from heal_and_verify_spots import heal_all_spots
except ImportError:
    from collector.heal_and_verify_spots import heal_all_spots

API_URL = os.environ.get("ONEUL_API_URL", "http://152.70.89.210:18088/rest/v1/spots")
TARGET_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "data", "spots.json"))
MIN_EXPECTED_SPOTS = 9000  # 비정상 데이터 누락 방지 안전 가드

def get_with_retry(params, attempts=6, wait_sec=10):
    """18088은 my-stock-score의 API 컨테이너가 oneul-api로 중계하는 주소라, 그쪽 배포로 컨테이너가 재생성되는
    10~20초 동안 연결이 거부된다(2026-09-23 21:54 UTC 동기화가 offset 9000에서 실패). 연결 오류와 5xx만
    잠시 기다렸다 다시 시도하고, 끝내 실패하면 예외를 그대로 올려 아래에서 동기화를 중단시킨다."""
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(API_URL, params=params, timeout=30)
            if r.status_code < 500 or attempt == attempts:
                return r
            logger.warning(f"  HTTP {r.status_code} (offset {params['offset']}), {wait_sec}초 뒤 재시도 {attempt}/{attempts - 1}")
        except requests.exceptions.ConnectionError as e:
            if attempt == attempts:
                raise
            logger.warning(f"  연결 실패 (offset {params['offset']}), {wait_sec}초 뒤 재시도 {attempt}/{attempts - 1}: {e.__class__.__name__}")
        time.sleep(wait_sec)


def fetch_all_active_spots():
    limit = 1000
    offset = 0
    all_spots = []
    
    logger.info(f"OCI DB에서 활성 스팟 동기화 시작: {API_URL}")
    
    while True:
        params = {
            "is_closed": "eq.false",
            "order": "id.asc",
            "limit": limit,
            "offset": offset
        }
        try:
            r = get_with_retry(params)
            if r.status_code != 200:
                # 페이지 도중 오류는 break로 조용히 빠지면 안 된다 —
                # MIN_EXPECTED_SPOTS 가드는 "9,000건 넘게 받았는지"만 보고
                # "끝까지 다 받았는지"는 안 보므로, 예를 들어 10,000건까지
                # 받다가 여기서 끊겨도 가드를 통과해 불완전한 목록이
                # spots.json에 그대로 커밋될 수 있었다(2026-09-23 발견,
                # 활성 12,926건 기준). 즉시 실패시켜 커밋 자체를 막는다.
                logger.error(f"API 호출 실패 (offset {offset}): HTTP {r.status_code} - {r.text[:200]}")
                sys.exit(1)
            items = r.json()
            if not items:
                break
            all_spots.extend(items)
            offset += len(items)
            logger.info(f"  ... {len(all_spots)}개 스팟 수신 중 (offset: {offset})")
            if len(items) < limit:
                break
        except Exception as e:
            logger.error(f"API 요청 중 예외 발생: {e}")
            sys.exit(1)

    return all_spots

def main():
    spots = fetch_all_active_spots()
    total = len(spots)
    logger.info(f"총 수신된 활성 스팟: {total}개")

    if total < MIN_EXPECTED_SPOTS:
        logger.error(f"수신된 스팟 수({total})가 최소 기준({MIN_EXPECTED_SPOTS}) 미만입니다. 동기화를 중단합니다.")
        sys.exit(1)

    logger.info("수집 데이터 정밀 검증 및 보정 파이프라인 가동...")
    healed_spots, stats = heal_all_spots(spots)
    logger.info(f"보정 완료: 더미비활성화 {stats['deactivated_dummies']}건, 상호정제 {stats['cleaned_names']}건, 카테고리보정 {stats['healed_categories']}건, 슬롯보정 {stats['healed_slots']}건 (최종 유효 활성: {stats['active_total']}건)")

    os.makedirs(os.path.dirname(TARGET_FILE), exist_ok=True)

    # 임시 파일 작성 후 원자적 교체
    tmp_file = f"{TARGET_FILE}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(healed_spots, f, ensure_ascii=False, indent=2)

    if os.path.exists(TARGET_FILE):
        os.remove(TARGET_FILE)
    os.rename(tmp_file, TARGET_FILE)

    file_size_mb = os.path.getsize(TARGET_FILE) / (1024 * 1024)
    logger.info(f"동기화 완료: {TARGET_FILE} ({total}개 스팟, {file_size_mb:.2f} MB)")

if __name__ == "__main__":
    main()
