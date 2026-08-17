# 오늘데이트 (Oneul-Date) 프로젝트 문서 가이드

오늘데이트 프로젝트의 기획, 디자인, 운영 관련 문서들을 목적별로 체계화한 인덱스입니다.

---

## 📁 디렉토리 구조 및 문서 인덱스

```text
docs/
├── README.md                  # 문서 전체 인덱스 및 개요 (본 문서)
├── planning/                  # 서비스 기획 및 프로젝트 로드맵
│   ├── PLAN.md                # 서비스 기획 & 핵심 기능 명세서
│   ├── ROADMAP.md             # 개발 및 릴리스 마일스톤 로드맵
│   ├── WORKLOG.md             # 일자별 작업 기록 및 변경 로그
│   └── RESEARCH-2026-08.md    # 데이트 코스 추천 서비스 시장 조사 & 리서치 스냅샷
├── design/                    # UI/UX 및 디자인 시스템 가이드
│   ├── DESIGN.md              # 브랜드 아이덴티티 및 디자인 가이드라인
│   ├── DESIGN_SYSTEM_stitch.md# Stitch 기반 디자인 시스템 토큰 명세 (Color, Typography, Component)
│   ├── SCREENS.md             # 단계별 화면 UI 설계서 및 사용자 플로우
│   ├── home_result.html       # 화면 프로토타입 HTML 목업
│   ├── home_create_course.png # 코스 생성 화면 캡처
│   └── home_result.png        # 결과 화면 캡처
└── ops/                       # 인프라, DB 및 데이터 운영
    ├── DB-OPS.md              # Supabase DB 스키마, 스폿 데이터 수집/검증 운영 가이드
    ├── COLLECTION_GUIDELINES.md # 스팟 데이터 수집 & 검증 표준 가이드라인
    └── EXTERNAL_VM_DB_COLLECTOR.md # 독립 VM 도커 24/7 수집기 운영 가이드
```

---

## 📑 분류별 상세 안내

### 1. 🎯 [planning/](./planning/) — 서비스 기획
* [**PLAN.md**](./planning/PLAN.md): 사용자 페르소나, 핵심 가치, AI 코스 추천 로직 등 서비스 기획 명세
* [**ROADMAP.md**](./planning/ROADMAP.md): Phase별 기능 개발 및 배포 일정
* [**WORKLOG.md**](./planning/WORKLOG.md): 작업 히스토리 및 개발 이슈 추적
* [**RESEARCH-2026-08.md**](./planning/RESEARCH-2026-08.md): 타겟 유저 분석, 경쟁 서비스 벤치마킹 및 시장 리서치

### 2. 🎨 [design/](./design/) — 디자인 & UI/UX
* [**DESIGN.md**](./design/DESIGN.md): 디자인 컨셉, 컬러 팔레트, 컴포넌트 디자인 원칙
* [**DESIGN_SYSTEM_stitch.md**](./design/DESIGN_SYSTEM_stitch.md): 디자인 시스템 토큰 명세
* [**SCREENS.md**](./design/SCREENS.md): 화면 UI 설계서 및 사용자 인터랙션 플로우

### 3. ⚙️ [ops/](./ops/) — 인프라 & 데이터 운영
* [**DB-OPS.md**](./ops/DB-OPS.md): Supabase DB 스키마 및 마이그레이션 운영 가이드
* [**COLLECTION_GUIDELINES.md**](./ops/COLLECTION_GUIDELINES.md): 스팟 수집 3대 원칙 및 표준 마크다운 규격 가이드
* [**EXTERNAL_VM_DB_COLLECTOR.md**](./ops/EXTERNAL_VM_DB_COLLECTOR.md): OCI VM 24/7 도커 수집·검증 엔진 운영 가이드
