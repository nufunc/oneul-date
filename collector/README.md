# 🐳 오늘 데이트 24/7 자율 스폿 수집기 & PocketBase DB

별도 VM 서버에서 **외부 API 키나 유료 서비스 없이 100% 로컬 자율 규칙 엔진**으로 핫플/데이트 스폿을 탐색·정제하여 경량 DB에 적재하는 Docker 패키지입니다.

---

## 🚀 1. VM에서 빠른 시작 (1분 완성)

### 1) 파일 업로드 또는 클론
VM 서버의 원하는 폴더(예: `~/oneul-collector`)에 `collector/` 폴더 내 파일들을 복사합니다.

```bash
mkdir -p ~/oneul-collector
cd ~/oneul-collector
```

### 2) 환경 변수 설정 (`.env`)
API 키 입력 없이 관리자 패스워드만 지정하면 바로 동작합니다:
```bash
cat << 'EOF' > .env
# PocketBase 관리자 계정 (최초 실행 시 자동 생성됨)
PB_ADMIN_EMAIL=admin@oneul-date.local
PB_ADMIN_PASSWORD=oneul_date_admin_pass_2026!
PB_ENCRYPTION_KEY=oneul_date_secret_key_2026

# 수집 주기 (시간 단위, 기본값: 2시간마다 1회)
COLLECT_INTERVAL_HOURS=2
EOF
```

### 3) Docker Compose 실행
```bash
docker compose up -d --build
```

---

## 📊 2. 서비스 확인 및 어드민 접속

* **PocketBase 관리자 웹 콘솔**: `http://YOUR_VM_IP:8090/_/`
  * 로그인: `.env`에 지정한 관리자 이메일 / 패스워드
  * `spots` 컬렉션에서 수집기가 실시간으로 등록한 장소들을 엑셀처럼 열람/검색/수정/삭제 가능
* **수집기 로그 실시간 확인**:
  ```bash
  docker compose logs -f spot-collector
  ```

---

## 🔄 3. 프론트엔드 프로젝트(`oneul-date`)와의 동기화

로컬 PC 또는 GitHub Actions에서 아래 명령 한 줄로 VM의 최신 스폿 데이터를 땡겨올 수 있습니다:

```bash
python scripts/sync_from_pocketbase.py --url http://YOUR_VM_IP:8090
```
이후 `npm run build`를 거치면 최신 스폿이 라이브 사이트에 즉시 반영됩니다.
