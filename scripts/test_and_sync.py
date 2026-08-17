import os
import sys
import json
import urllib.request
import urllib.parse
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")
SPOTS_PATH = os.path.join(BASE_DIR, "src", "data", "spots.json")

env = {}
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")

url = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
service_key = env.get("SUPABASE_SERVICE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
anon_key = env.get("VITE_SUPABASE_ANON_KEY") or service_key

if not url or not service_key:
    print("❌ .env 파일에 SUPABASE_URL 또는 Key가 설정되지 않았습니다.")
    sys.exit(1)

url = url.rstrip("/")
masked_key = service_key[:10] + "..." + service_key[-5:] if len(service_key) > 20 else "***"
print(f"🔗 Supabase URL: {url}")
print(f"🔑 Key 감지: {masked_key}")

# 1. 테이블 존재 여부 및 접속 검증
test_url = f"{url}/rest/v1/spots?select=count"
headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Prefer": "count=exact"
}
req = urllib.request.Request(test_url, headers=headers)

table_ready = False
try:
    with urllib.request.urlopen(req, timeout=10) as res:
        print(f"✅ Supabase 연결 성공! (HTTP {res.status})")
        content_range = res.headers.get("Content-Range", "0-0/0")
        print(f"📊 현재 Supabase DB의 spots 레코드 수: {content_range}")
        table_ready = True
except urllib.error.HTTPError as e:
    err = e.read().decode("utf-8", errors="replace")
    print(f"⚠️ HTTP 응답 ({e.code}): {err}")
    if "relation \"public.spots\" does not exist" in err or "spots" in err:
        print("\n💡 [안내] Supabase에 'spots' 테이블이 아직 생성되지 않았습니다.")
        print("👉 Supabase 대시보드 -> SQL Editor에서 'supabase/schema.sql' 파일의 내용을 실행해주세요!")
    sys.exit(1)
except Exception as e:
    print(f"❌ 연결 오류: {e}")
    sys.exit(1)

# 2. 동기화 (Migration / Upsert) 실행
if table_ready:
    print("\n🚀 spots.json (4,153곳) Supabase 일괄 동기화(Upsert) 시작...")
    with open(SPOTS_PATH, "r", encoding="utf-8") as f:
        spots = json.load(f)

    total = len(spots)
    batch_size = 100
    success = 0
    start_time = time.time()

    upsert_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    endpoint = f"{url}/rest/v1/spots"
    for i in range(0, total, batch_size):
        batch = spots[i:i + batch_size]
        payload = []
        for s in batch:
            payload.append({
                "id": s.get("id"),
                "name": s.get("name"),
                "slot": s.get("slot"),
                "region": s.get("region"),
                "area": s.get("area"),
                "address": s.get("address"),
                "mood": s.get("mood", []),
                "location": s.get("location"),
                "price": s.get("price"),
                "summary": s.get("summary"),
                "source": s.get("source", {}),
                "verified": s.get("verified", False),
                "is_closed": False
            })

        data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        post_req = urllib.request.Request(endpoint, data=data_bytes, headers=upsert_headers, method="POST")

        try:
            with urllib.request.urlopen(post_req, timeout=15) as r:
                if r.status in (200, 201):
                    success += len(batch)
                    pct = success * 100 // total
                    print(f"  ✓ [{success}/{total}] ({pct}%) 업로드 완료")
        except Exception as e:
            print(f"  ❌ 배치 오류: {e}")
            break
        time.sleep(0.05)

    elapsed = time.time() - start_time
    print(f"\n🎉 최종 동기화 완료: 총 {success}/{total}건 업로드 성공! (소요 시간: {elapsed:.2f}초)")
