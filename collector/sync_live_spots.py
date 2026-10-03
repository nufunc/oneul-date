"""
오늘 데이트 (oneul-date) — OCI DB ↔ 라이브 CDN 무중단 데이터 동기화 스크립트
OCI PostgreSQL (PostgREST API)에서 최신 유효 스팟 전수를 조회하여 public/data/spots.json을 갱신합니다.
"""

import os
import sys
import json
import re
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
CLIENT_UNUSED_KEYS = {"metrics", "created_at", "updated_at", "provider_ids", "reservation_type", "fail_count"}
ALIAS_FILE = os.path.join(os.path.dirname(TARGET_FILE), "spot_aliases.json")
# 첫 방문자가 spots.json을 받는 동안 보이는 번들 샘플. 실제 id로 다시 써야 그동안 찜한 스팟이 도착 뒤에도 남는다
SAMPLE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "data", "spots.sample.json"))
SAMPLE_MAX_COUNT = 480
SAMPLE_MAX_BYTES = 305_000  # 2026-09-13 샘플 크기(305,327B). 번들이 이보다 커지지 않게 한다

def get_with_retry(params, attempts=6, wait_sec=10):
    """18088은 my-stock-score의 API 컨테이너가 oneul-api로 중계하는 주소라, 그쪽 배포로 컨테이너가 재생성되는
    10~20초 동안 연결이 거부된다(2026-09-23 21:54 UTC 동기화가 offset 9000에서 실패). 연결 오류, 응답 시간 초과, 5xx만
    잠시 기다렸다 다시 시도하고, 끝내 실패하면 예외를 그대로 올려 아래에서 동기화를 중단시킨다."""
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(API_URL, params=params, timeout=30)
            if r.status_code < 500 or attempt == attempts:
                return r
            logger.warning(f"  HTTP {r.status_code} ({params['id']}), {wait_sec}초 뒤 재시도 {attempt}/{attempts - 1}")
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, requests.exceptions.ChunkedEncodingError) as e:
            if attempt == attempts:
                raise
            logger.warning(f"  연결 실패 ({params['id']}), {wait_sec}초 뒤 재시도 {attempt}/{attempts - 1}: {e.__class__.__name__}")
        time.sleep(wait_sec)


def fetch_all_active_spots():
    # offset 대신 마지막 id 기준으로 넘긴다. 받는 도중 이미 지나간 id가 닫히면(enrich_worker가 상시 PATCH)
    # offset 방식은 뒤 행이 한 칸 당겨져 다음 페이지 첫 행을 오류 없이 건너뛴다
    limit = 1000
    last_id = 0
    all_spots = []
    
    logger.info(f"OCI DB에서 활성 스팟 동기화 시작: {API_URL}")
    
    while True:
        params = {
            "is_closed": "eq.false",
            "order": "id.asc",
            "id": f"gt.{last_id}",
            "limit": limit,
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
                logger.error(f"API 호출 실패 (id gt.{last_id}): HTTP {r.status_code} - {r.text[:200]}")
                sys.exit(1)
            items = r.json()
            if not items:
                break
            all_spots.extend(items)
            last_id = items[-1]["id"]
            logger.info(f"  ... {len(all_spots)}개 스팟 수신 중 (마지막 id: {last_id})")
            if len(items) < limit:
                break
        except Exception as e:
            logger.error(f"API 요청 중 예외 발생: {e}")
            sys.exit(1)

    return all_spots

def fetch_merge_aliases(active_ids):
    """병합으로 닫힌 행(source.note의 merged_into:{id})을 남은 열린 행 id로 잇는다.
    찜·저장 코스·공유 링크가 병합된 옛 id를 들고 있어도 앱이 남은 스팟을 찾게 한다"""
    merged, last_id = {}, 0
    while True:
        r = get_with_retry({"select": "id,source", "is_closed": "eq.true", "source->>note": "like.*merged_into:*",
                            "order": "id.asc", "id": f"gt.{last_id}", "limit": 1000})
        if r.status_code != 200:
            logger.error(f"병합 별칭 조회 실패: HTTP {r.status_code} - {r.text[:200]}")
            sys.exit(1)
        items = r.json()
        for it in items:
            hits = re.findall(r"merged_into:(\d+)", (it.get("source") or {}).get("note") or "")
            if hits:
                merged[it["id"]] = int(hits[-1])
        if len(items) < 1000:
            break
        last_id = items[-1]["id"]
    aliases = {}
    for src, dst in merged.items():
        seen = {src}
        while dst in merged and dst not in seen:  # 병합이 이어진 경우 끝까지 따라간다
            seen.add(dst)
            dst = merged[dst]
        if dst in active_ids:
            aliases[str(src)] = dst
    return aliases


def pick_sample(out_spots, max_count=SAMPLE_MAX_COUNT, max_bytes=SAMPLE_MAX_BYTES):
    """이미지가 있는 열린 스팟을 지역마다 hot_score 순으로 줄 세워 한 곳씩 돌아가며 뽑는다.
    입력이 같으면 결과가 같고, 개수와 직렬화 크기가 상한을 넘기 전에 멈춘다"""
    queues = {}
    for sp in sorted(out_spots, key=lambda x: (-(x.get("hot_score") or 0), x["id"])):
        if sp.get("image_url") and not sp.get("is_closed"):
            queues.setdefault(sp.get("region") or "", []).append(sp)
    picked, size = [], 2  # 대괄호 두 글자
    for rank in range(max_count):
        for region in sorted(queues):
            if rank >= len(queues[region]):
                continue
            row = len(json.dumps(queues[region][rank], ensure_ascii=False, separators=(",", ":")).encode()) + 1
            if len(picked) >= max_count or size + row > max_bytes:
                return picked
            picked.append(queues[region][rank])
            size += row
    return picked


def main():
    spots = fetch_all_active_spots()
    total = len(spots)
    logger.info(f"총 수신된 활성 스팟: {total}개")

    if total < MIN_EXPECTED_SPOTS:
        logger.error(f"수신된 스팟 수({total})가 최소 기준({MIN_EXPECTED_SPOTS}) 미만입니다. 동기화를 중단합니다.")
        sys.exit(1)

    logger.info("수집 데이터 정밀 검증 및 보정 파이프라인 가동...")
    healed_spots, stats = heal_all_spots(spots)
    logger.info(f"보정 완료: 더미비활성화 {stats['deactivated_dummies']}건, 상호정제 {stats['cleaned_names']}건, 카테고리보정 {stats['healed_categories']}건, 슬롯보정 {stats['healed_slots']}건, 가격티어 {stats['filled_price_tiers']}건, https이미지 {stats['https_images']}건 (최종 유효 활성: {stats['active_total']}건)")

    os.makedirs(os.path.dirname(TARGET_FILE), exist_ok=True)

    # 임시 파일 작성 후 원자적 교체
    # 모든 행에서 비어 있는 칸은 빼고 공백 없이 쓴다. 앱은 이 칸들을 없는 값으로 다룬다.
    # 2026-09-29 실측 31.3MB → 21.0MB(gzip 3.56 → 3.25MB). 값이 한 행이라도 생기면 다시 들어간다
    keys = set().union(*(sp.keys() for sp in healed_spots))
    empty_keys = {k for k in keys if all(sp.get(k) in (None, "", [], {}) for sp in healed_spots)}
    # 앱이 읽지 않는 칸도 뺀다. 2026-09-30 src에서 타입 선언 밖 참조가 0건이었고 이 여섯이 압축 전 4.5MB(23%)였다.
    # 화면이 이 값을 쓰게 되면 여기서 빼야 한다
    drop_keys = empty_keys | CLIENT_UNUSED_KEYS
    out_spots = [{k: v for k, v in sp.items() if k not in drop_keys} for sp in healed_spots]
    tmp_file = f"{TARGET_FILE}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(out_spots, f, ensure_ascii=False, separators=(",", ":"))

    if os.path.exists(TARGET_FILE):
        os.remove(TARGET_FILE)
    os.rename(tmp_file, TARGET_FILE)

    active_ids = {sp["id"] for sp in healed_spots if not sp.get("is_closed")}
    aliases = fetch_merge_aliases(active_ids)
    with open(ALIAS_FILE, "w", encoding="utf-8") as f:
        json.dump(aliases, f, separators=(",", ":"), sort_keys=True)
    logger.info(f"병합 별칭 {len(aliases)}건 기록: {ALIAS_FILE}")

    sample = pick_sample(out_spots)
    sample_bytes = json.dumps(sample, ensure_ascii=False, separators=(",", ":")).encode()
    out_ids = {sp["id"] for sp in out_spots}
    assert sample and all(sp["id"] in out_ids for sp in sample), "샘플 id가 spots.json에 없다"
    assert len(sample) <= SAMPLE_MAX_COUNT and len(sample_bytes) <= SAMPLE_MAX_BYTES, "샘플이 상한을 넘었다"
    with open(SAMPLE_FILE, "wb") as f:
        f.write(sample_bytes)
    logger.info(f"번들 샘플 {len(sample)}곳 기록: {SAMPLE_FILE} ({len(sample_bytes):,}B)")

    file_size_mb = os.path.getsize(TARGET_FILE) / (1024 * 1024)
    logger.info(f"동기화 완료: {TARGET_FILE} ({total}개 스팟, {file_size_mb:.2f} MB)")

if __name__ == "__main__":
    main()
