import json
import logging
import requests
from pocketbase import PocketBase
from pocketbase.client import ClientResponseError

logger = logging.getLogger("oneul.pb_client")

class PocketBaseManager:
    def __init__(self, pb_url: str, admin_email: str, admin_password: str):
        self.pb_url = pb_url.rstrip("/")
        self.admin_email = admin_email
        self.admin_password = admin_password
        self.pb = PocketBase(self.pb_url)
        self.authenticated = False

    def authenticate(self) -> bool:
        """슈퍼유저 / 관리자 계정 인증 (계정이 없으면 최초 자동 생성)"""
        try:
            # 관리자 로그인 시도
            self.pb.admins.auth_with_password(self.admin_email, self.admin_password)
            self.authenticated = True
            logger.info("Successfully authenticated with PocketBase as admin.")
            return True
        except Exception as e:
            logger.warning(f"Initial auth failed ({e}). Attempting first-time admin registration...")
            try:
                # 관리자 계정 최초 생성 시도
                res = requests.post(
                    f"{self.pb_url}/api/admins",
                    json={
                        "email": self.admin_email,
                        "password": self.admin_password,
                        "passwordConfirm": self.admin_password,
                    },
                    timeout=10,
                )
                if res.status_code in (200, 204):
                    self.pb.admins.auth_with_password(self.admin_email, self.admin_password)
                    self.authenticated = True
                    logger.info("Created first admin user and authenticated.")
                    return True
                else:
                    logger.error(f"Failed to create admin: {res.text}")
                    return False
            except Exception as ex:
                logger.error(f"Error during admin registration: {ex}")
                return False

    def ensure_schema(self):
        """'spots' 컬렉션이 없으면 스키마를 자동 생성"""
        if not self.authenticated:
            self.authenticate()

        try:
            self.pb.collections.get_one("spots")
            logger.info("'spots' collection already exists.")
        except Exception:
            logger.info("Creating 'spots' collection...")
            schema = [
                {"name": "spot_id", "type": "number", "required": False},
                {"name": "name", "type": "text", "required": True},
                {"name": "slot", "type": "select", "required": True, "options": {"values": ["day", "evening", "night", "stay"]}},
                {"name": "region", "type": "text", "required": True},
                {"name": "area", "type": "text", "required": False},
                {"name": "mood", "type": "json", "required": False},
                {"name": "location", "type": "text", "required": True},
                {"name": "price", "type": "text", "required": False},
                {"name": "summary", "type": "text", "required": False},
                {"name": "source_url", "type": "url", "required": False},
                {"name": "source_type", "type": "text", "required": False},
                {"name": "source_note", "type": "text", "required": False},
                {"name": "verified", "type": "bool", "required": False},
            ]
            
            try:
                self.pb.collections.create({
                    "name": "spots",
                    "type": "base",
                    "schema": schema,
                    "listRule": "", # 공개 읽기 허용
                    "viewRule": "", # 공개 읽기 허용
                    "createRule": None, # 관리자만 작성
                    "updateRule": None,
                    "deleteRule": None,
                })
                logger.info("'spots' collection successfully created.")
            except Exception as e:
                logger.error(f"Failed to create 'spots' collection: {e}")

    def spot_exists(self, name: str, location: str = "") -> bool:
        """상호명 및 위치로 중복 스폿 존재 여부 확인"""
        if not self.authenticated:
            self.authenticate()
        try:
            # 특수문자 이스케이프 후 쿼리
            safe_name = name.replace("'", "\\'")
            records = self.pb.collection("spots").get_list(
                page=1,
                per_page=1,
                query_params={"filter": f'name = "{safe_name}"'},
            )
            return len(records.items) > 0
        except Exception as e:
            logger.warning(f"Error checking spot existence for '{name}': {e}")
            return False

    def insert_spot(self, spot_data: dict) -> bool:
        """신규 스폿 레코드 삽입"""
        if not self.authenticated:
            self.authenticate()

        try:
            payload = {
                "spot_id": spot_data.get("id"),
                "name": spot_data.get("name"),
                "slot": spot_data.get("slot"),
                "region": spot_data.get("region"),
                "area": spot_data.get("area"),
                "mood": spot_data.get("mood", []),
                "location": spot_data.get("location"),
                "price": spot_data.get("price"),
                "summary": spot_data.get("summary"),
                "source_url": spot_data.get("source", {}).get("url") if isinstance(spot_data.get("source"), dict) else spot_data.get("source_url"),
                "source_type": spot_data.get("source", {}).get("type", "web") if isinstance(spot_data.get("source"), dict) else "web",
                "source_note": spot_data.get("source", {}).get("note", "auto_collector") if isinstance(spot_data.get("source"), dict) else "auto_collector",
                "verified": spot_data.get("verified", False),
            }
            self.pb.collection("spots").create(payload)
            logger.info(f"Inserted new spot: {spot_data.get('name')} ({spot_data.get('slot')})")
            return True
        except Exception as e:
            logger.error(f"Failed to insert spot '{spot_data.get('name')}': {e}")
            return False

    def fetch_all_spots(self) -> list:
        """전체 스폿 목록을 프론트엔드 spots.json 규격 리스트로 반환"""
        if not self.authenticated:
            self.authenticate()

        try:
            records = self.pb.collection("spots").get_full_list(sort="-created")
            spots_list = []
            for i, r in enumerate(records, 1):
                item = {
                    "id": getattr(r, "spot_id", None) or i,
                    "name": getattr(r, "name", ""),
                    "slot": getattr(r, "slot", "day"),
                    "region": getattr(r, "region", "서울"),
                    "area": getattr(r, "area", None),
                    "mood": getattr(r, "mood", ["romantic"]),
                    "location": getattr(r, "location", ""),
                    "price": getattr(r, "price", None),
                    "summary": getattr(r, "summary", ""),
                    "source": {
                        "type": getattr(r, "source_type", "web"),
                        "url": getattr(r, "source_url", None),
                        "note": getattr(r, "source_note", "pocketbase"),
                    },
                    "verified": getattr(r, "verified", False),
                }
                spots_list.append(item)
            return spots_list
        except Exception as e:
            logger.error(f"Failed to fetch spots from PocketBase: {e}")
            return []
