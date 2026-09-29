"""spots.json의 결손 지표를 docs/planning/metrics.csv에 하루 한 줄로 쌓는다. 같은 날짜를 다시 돌리면 그 줄을 덮어쓴다."""
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPOTS = ROOT / "public" / "data" / "spots.json"
CSV_PATH = ROOT / "docs" / "planning" / "metrics.csv"
FIELDS = ["date", "total", "closed", "open_no_image", "open_no_coords", "open_no_category", "open_no_price_tier"]


def measure(spots):
    opened = [s for s in spots if not s.get("is_closed")]
    return {
        "total": len(spots),
        "closed": len(spots) - len(opened),
        "open_no_image": sum(1 for s in opened if not s.get("image_url")),
        "open_no_coords": sum(1 for s in opened if not s.get("lat") or not s.get("lng")),
        "open_no_category": sum(1 for s in opened if not s.get("category")),
        "open_no_price_tier": sum(1 for s in opened if not s.get("price_tier")),
    }


def main():
    data = json.loads(SPOTS.read_text(encoding="utf-8"))
    spots = data if isinstance(data, list) else data["spots"]
    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    row = {"date": today, **measure(spots)}

    rows = []
    if CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8", newline="") as f:
            rows = [r for r in csv.DictReader(f) if r["date"] != today]
    rows.append(row)
    rows.sort(key=lambda r: r["date"])

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(",".join(str(row[k]) for k in FIELDS))


if __name__ == "__main__":
    sys.exit(main())
