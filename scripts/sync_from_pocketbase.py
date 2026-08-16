#!/usr/bin/env python3
"""
PocketBase -> src/data/spots.json 동기화 스크립트

사용법:
  python scripts/sync_from_pocketbase.py --url http://VM_IP:8090
"""

import os
import sys
import json
import argparse
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DEFAULT_OUTPUT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "src", "data", "spots.json")
)

def sync_from_pocketbase(pb_url: str, output_path: str):
    pb_url = pb_url.rstrip("/")
    api_url = f"{pb_url}/api/collections/spots/records?perPage=5000&sort=-created"
    
    print(f"Connecting to PocketBase at: {api_url}")
    try:
        res = requests.get(api_url, timeout=15)
        res.raise_for_status()
        data = res.json()
        items = data.get("items", [])
        print(f"Successfully fetched {len(items)} spots from PocketBase.")
    except Exception as e:
        print(f"Error fetching from PocketBase: {e}")
        sys.exit(1)

    # spots.json 표준 스키마 변환
    formatted_spots = []
    for i, r in enumerate(items, 1):
        item = {
            "id": r.get("spot_id") or i,
            "name": r.get("name", "").strip(),
            "slot": r.get("slot", "day"),
            "region": r.get("region", "서울"),
            "area": r.get("area") or None,
            "mood": r.get("mood") if isinstance(r.get("mood"), list) else ["romantic"],
            "location": r.get("location", ""),
            "price": r.get("price") or None,
            "summary": r.get("summary", ""),
            "source": {
                "type": r.get("source_type", "web"),
                "url": r.get("source_url") or None,
                "note": r.get("source_note", "pocketbase"),
            },
            "verified": r.get("verified", False),
        }
        formatted_spots.append(item)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(formatted_spots, f, ensure_ascii=False, indent=2)

    print(f"Successfully saved {len(formatted_spots)} spots to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Sync spots.json from remote PocketBase")
    parser.add_argument(
        "--url",
        default=os.getenv("POCKETBASE_URL", "http://localhost:8090"),
        help="PocketBase Base URL (e.g., http://your-vm-ip:8090)",
    )
    parser.add_argument(
        "--out",
        default=DEFAULT_OUTPUT_PATH,
        help=f"Output spots.json path (default: {DEFAULT_OUTPUT_PATH})",
    )
    args = parser.parse_args()
    sync_from_pocketbase(args.url, args.out)

if __name__ == "__main__":
    main()
