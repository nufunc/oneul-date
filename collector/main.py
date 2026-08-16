import time
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from config import (
    POCKETBASE_URL,
    PB_ADMIN_EMAIL,
    PB_ADMIN_PASSWORD,
    GEMINI_API_KEY,
    COLLECT_INTERVAL_HOURS,
)
from pipeline.pb_client import PocketBaseManager
from pipeline.crawler import discover_new_spot_candidates
from pipeline.extractor import extract_spot_info_with_gemini
from pipeline.verifier import verify_spot_existence

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("oneul.collector")

def run_collection_cycle():
    """1회 수집 사이클 실행"""
    logger.info("=== Starting Date Spot Collection Cycle ===")
    
    pb = PocketBaseManager(POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
    if not pb.authenticate():
        logger.error("PocketBase auth failed. Aborting cycle.")
        return
        
    pb.ensure_schema()
    
    # 1. 핫플 후보 탐색
    candidates = discover_new_spot_candidates()
    logger.info(f"Discovered {len(candidates)} raw spot candidate entries.")
    
    added_count = 0
    for cand in candidates:
        # 2. LLM 지능형 정제 및 추출
        spot_info = extract_spot_info_with_gemini(cand["raw_text"], GEMINI_API_KEY)
        if not spot_info or not spot_info.get("name"):
            continue
            
        spot_name = spot_info["name"]
        
        # 3. 실존 및 유효성 검증
        if not verify_spot_existence(spot_name, spot_info.get("location", "")):
            logger.info(f"Skipping invalid spot candidate: {spot_name}")
            continue
            
        # 4. 중복 검사
        if pb.spot_exists(spot_name):
            logger.info(f"Spot '{spot_name}' already exists in DB. Skipping.")
            continue
            
        # 5. DB 등록
        spot_info["source"] = {
            "type": "youtube",
            "url": cand.get("source_url"),
            "note": cand.get("source_note", "auto_collector"),
        }
        spot_info["verified"] = True
        
        if pb.insert_spot(spot_info):
            added_count += 1

    logger.info(f"=== Cycle Finished. Successfully added {added_count} new spots to DB. ===")

def main():
    logger.info("Oneul-Date 24/7 Spot Collector Daemon Starting...")
    
    # 기동 즉시 1회 초기화 및 실행
    try:
        run_collection_cycle()
    except Exception as e:
        logger.error(f"Initial cycle error: {e}")
        
    # APScheduler 주기적 실행 등록
    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_collection_cycle,
        "interval",
        hours=COLLECT_INTERVAL_HOURS,
        id="date_spot_collector_job",
    )
    
    logger.info(f"Scheduler registered. Running every {COLLECT_INTERVAL_HOURS} hour(s).")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Collector Daemon stopped.")

if __name__ == "__main__":
    main()
