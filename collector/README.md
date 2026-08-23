# 오늘 데이트 (oneul-date) — 백엔드 자율 수집 및 동기화 도커 엔진

리눅스 VM 및 도커 환경에서 24시간 365일 무중단으로 네이버 플레이스 라이브 검증, 폐업 감지, 유튜브 핫클립 마이닝 및 Supabase 클라우드 DB 동기화를 수행하는 경량 도커 컨테이너입니다.

---

## 🚀 도커 엔진 3단계 초간단 배포 가이드

### 1단계: 소스 코드 클론
```bash
# Git 클론 및 디렉토리 이동
git clone https://github.com/nufunc/oneul-date.git
cd oneul-date/collector
```

### 2단계: `.env` 환경변수 설정
`collector/.env` 파일을 생성하고 Supabase 연결 키 및 SMTP 설정을 입력합니다:
```bash
cat << 'EOF' > .env
SUPABASE_URL=https://uyhwhnnzzfhtxjernfit.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
CHECK_INTERVAL_HOURS=1
BATCH_LIMIT=100
DAILY_REPORT_HOUR=9
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
   - `CHECK_INTERVAL_HOURS` (기본 1시간)마다 Supabase DB에서 장소들을 가져와 네이버 지도 라이브 검증 수행.
   - 폐업/이전 감지 및 도로명 주소 자동 보강.
2. **Supabase 7일 휴면 방지 (Keep-alive)**:
   - 지속적인 API 쿼리를 통해 Supabase 무료 프로젝트가 일시정지(Pause)되지 않고 100% 상시 활성 상태 유지.
3. **초경량 자원 소모**:
   - 메모리 50MB~100MB 미만 소모로 무료/소형 클라우드 인스턴스에서도 다른 서비스와 함께 쾌적하게 구동 가능.

---

## 📊 로그 저장 & 미비점 분석 도구 (`analyze_logs.py`)

수집기의 실행 로그는 `/mnt/data/logs/collector.log` 및 일자별 `collector-YYYY-MM-DD.log`로 자동 분할 저장됩니다.  
수집 실패 원인(429 한도, 카테고리 필터 탈락, 매칭 오류)이나 신규 발굴 현황을 즉시 진단할 수 있습니다:

```bash
# 기본 분석 실행 (최근 전체 로그 종합 진단)
python analyze_logs.py

# 특정 일자 로그 분석
python analyze_logs.py --date 2026-08-23

# 최근 500줄만 분석하고 마크다운 리포트 생성
python analyze_logs.py -n 500 -m report.md
```

---

## 🗺️ 소외 지역(가산/구로/비핫플) 자율 발굴 엔진 (`area_seeds.py`)

- **전국 25개 구 + 수도권 300+개 전철역/생활권 전수 그리드**: 유명 핫플(성수/한남 등)뿐만 아니라 가산디지털단지, 독산, 구로, 노원, 수유 등 비(非)핫플 지역의 숨은 데이트 스팟을 자동 발굴합니다.
- **DB 커버리지 갭 감지(Gap Detector)**: Supabase DB의 등록 스팟 수를 분석하여 데이터가 부족한 소외 지역을 최우선 탐색 큐에 자동 배치합니다.
- **오피스 상권 노이즈 필터링**: 구내식당, 한식뷔페, 단체회식, 지식산업센터 등 직장인 회식 노이즈를 완벽히 차단하고 감성/소개팅/데이트 스팟만 선별합니다.

---

## 🛠️ 유용한 관리 명령어
- **컨테이너 상태 확인**: `docker compose ps`
- **실시간 로그 스트리밍**: `docker compose logs -f`
- **로그 미비점 정밀 진단**: `python analyze_logs.py`
- **컨테이너 재시작**: `docker compose restart`
- **컨테이너 중지**: `docker compose down`
