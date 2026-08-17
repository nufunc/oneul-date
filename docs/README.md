# 오늘 데이트 (oneul-date) 프로젝트 문서 가이드

오늘 데이트 프로젝트의 기획, 디자인, 운영 관련 문서들을 목적별로 체계화한 인덱스입니다.

---

## 📁 디렉토리 구조 및 문서 인덱스

```text
docs/
├── README.md                  # 문서 전체 인덱스 및 개요 (본 문서)
├── design/                    # UI/UX 및 디자인 시스템 가이드
│   ├── design-system.md       # 브랜드 아이덴티티 및 디자인 시스템 토큰 가이드
│   ├── screens.md             # 단계별 화면 UI 설계서 및 사용자 플로우
│   └── home_result.html       # 화면 프로토타입 HTML 목업
├── ops/                       # 인프라, DB 및 데이터 운영
│   ├── data-collection.md     # 스팟 데이터 수집 & 데이트 적합 선별 가이드
│   ├── database-guide.md      # Supabase DB 스키마 및 마이그레이션 운영 가이드
│   └── engine-deployment.md   # 백엔드 24/7 도커 수집·검증 엔진 운영 가이드
└── planning/                  # 서비스 기획 및 프로젝트 로드맵
    ├── project-plan.md        # 서비스 기획 & 핵심 기능 명세서
    ├── roadmap.md             # 개발 및 릴리스 마일스톤 로드맵
    ├── research.md            # 핫플레이스 쿼리 매트릭스 & 시장 리서치
    └── worklog.md             # 개발 및 릴리즈 작업 일지
```

---

## 📑 분류별 상세 안내

### 1. 🎨 [design/](./design/) — 디자인 & UI/UX
* [**design-system.md**](./design/design-system.md): 감성 매거진 디자인 컨셉, 컬러 팔레트, 디자인 토큰 명세
* [**screens.md**](./design/screens.md): 단계별 화면 UI 설계서 및 사용자 인터랙션 플로우

### 2. ⚙️ [ops/](./ops/) — 인프라 & 데이터 운영
* [**data-collection.md**](./ops/data-collection.md): 핫플레이스 수집 기준 및 비데이트 시설 필터링 원칙
* [**database-guide.md**](./ops/database-guide.md): Supabase PostgreSQL DDL 스키마 및 인덱스 가이드
* [**engine-deployment.md**](./ops/engine-deployment.md): 백엔드 자율 데이터 엔진 도커 배포 및 환경변수 가이드

### 3. 🎯 [planning/](./planning/) — 서비스 기획
* [**project-plan.md**](./planning/project-plan.md): 사용자 페르소나, 핵심 가치, AI 코스 추천 로직 명세
* [**roadmap.md**](./planning/roadmap.md): 2026 기능 개발 및 릴리스 로드맵
* [**research.md**](./planning/research.md): 전국 권역별 핫플 쿼리 매트릭스 및 벤치마킹 분석
* [**worklog.md**](./planning/worklog.md): 개발 히스토리 및 최신 변경 로그
