# 오늘 데이트 (oneul-date) — OCI VM 자율 수집 및 동기화 도커

OCI(Oracle Cloud Infrastructure) 무료 VM(Always Free ARM64 / AMD)에서 24시간 365일 무중단으로 네이버 플레이스 라이브 검증, 폐업 감지, 주소 보강 및 Supabase 클라우드 DB 동기화를 수행하는 경량 도커 컨테이너입니다.

---

## 🚀 OCI VM 3단계 초간단 배포 가이드

### 1단계: OCI VM에 소스 코드 클론
```bash
# Git 클론 및 디렉토리 이동
git clone https://github.com/nufunc/oneul-date.git
cd oneul-date/collector
```

### 2단계: `.env` 환경변수 설정
`collector/.env` 파일을 생성하고 Supabase 연결 키를 입력합니다:
```bash
cat << 'EOF' > .env
SUPABASE_URL=https://uyhwhnnzzfhtxjernfit.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
CHECK_INTERVAL_HOURS=2
BATCH_LIMIT=100
EOF
```

### 3단계: 도커 컨테이너 백그라운드 실행
```bash
# 도커 빌드 및 백그라운드 실행
docker compose up -d --build

# 실시간 로그 확인
docker compose logs -f
```

---

## ⚙️ 주요 기능 및 동작 방식
1. **24/7 백그라운드 자율 스케줄러**:
   - `CHECK_INTERVAL_HOURS` (기본 2시간)마다 Supabase DB에서 장소들을 가져와 네이버 지도 라이브 검증 수행.
   - 폐업/이전 감지 및 도로명 주소 자동 보강.
2. **Supabase 7일 휴면 방지 (Keep-alive)**:
   - 지속적인 API 쿼리를 통해 Supabase 무료 프로젝트가 일시정지(Pause)되지 않고 100% 상시 활성 상태 유지.
3. **초경량 자원 소모**:
   - 메모리 50MB~100MB 미만 소모로 OCI 무료 인스턴스(Micro/Ampere)에서 다른 서비스와 함께 쾌적하게 구동 가능.

---

## 🛠️ 유용한 관리 명령어
- **컨테이너 상태 확인**: `docker compose ps`
- **컨테이너 재시작**: `docker compose restart`
- **컨테이너 중지**: `docker compose down`
