import os
from dotenv import load_dotenv

load_dotenv()

POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://localhost:8090")
PB_ADMIN_EMAIL = os.getenv("PB_ADMIN_EMAIL", "admin@oneul-date.local")
PB_ADMIN_PASSWORD = os.getenv("PB_ADMIN_PASSWORD", "oneul_date_admin_pass_2026!")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
COLLECT_INTERVAL_HOURS = int(os.getenv("COLLECT_INTERVAL_HOURS", "2"))

# 수집 대상 트렌드 키워드 및 지역 풀
TARGET_REGIONS = ["서울", "경기", "인천", "강원", "충청", "영남", "호남", "제주"]

DISCOVERY_KEYWORDS = [
    "데이트 신상 핫플",
    "브런치 카페 핫플",
    "분위기 좋은 비스트로",
    "심야 카페 드라이브",
    "야경 명소 데이트",
    "LP 청음바 위스키",
    "이색 원데이 클래스 데이트",
    "감성 테라스 맛집",
    "솥밥 다이닝 핫플",
    "재즈 라이브 펍",
]
