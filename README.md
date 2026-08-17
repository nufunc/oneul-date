# 오늘 데이트 (oneul-date) ✨

시간대 슬롯(☀️낮 → 🌆저녁 → 🌙밤) 기반 감성 데이트 코스 자동 큐레이션 서비스.
전국 4,100여 곳 이상의 검증된 핫플레이스를 기반으로 맞춤 코스를 추천받고, 원클릭으로 카카오톡/메신저에 공유합니다.

🌐 **Live Website**: [https://nufunc.github.io/oneul-date/](https://nufunc.github.io/oneul-date/)

---

## 🏛️ 시스템 아키텍처

```
 [백엔드 도커 엔진 (24/7 자율 수집·검증 엔진)]
   ├── 1단계: 네이버/카카오 듀얼 검색 기반 위/경도 좌표, 썸네일, 카테고리 심층 메타 보강
   └── 2단계: 전국 8개 권역 2026 신규 핫플레이스 자율 발굴 및 AI 슬롯 태깅
          │
          ▼ (UPSERT / INSERT)
 ┌──────────────────────────────────────────────┐
 │  Supabase Cloud PostgreSQL Database          │
 │   - 4,100+ 유효 검증 데이트 스팟 관리        │
 │   - RLS 보안 정책 및 GIN 검색 인덱스 완비     │
 └──────────────────────────────────────────────┘
          ▲
          │ (실시간 쿼리)
 [GitHub Pages 웹 프론트엔드]
   - 초경량 Vite + TypeScript (번들 크기 28KB)
   - Supabase 실시간 클라우드 DB 연동 & 로컬 자동 폴백
```

---

## 📁 디렉토리 구조

```
oneul-date/
├── src/          # 웹 프론트엔드 (Vite + TypeScript)
├── collector/    # 백엔드 자율 데이터 수집 & 검증 엔진 (Docker)
└── supabase/     # PostgreSQL 데이터베이스 스키마
```

---

## 🚀 빠른 시작 (Quick Start)

### 1. 로컬 프론트엔드 개발
```bash
# 의존성 설치
npm install

# 로컬 개발 서버 실행
npm run dev

# 프로덕션 빌드 검증
npm run build
```

### 2. 백엔드 도커 수집기 배포
```bash
cd collector
cp .env.example .env
# .env 파일에 Supabase 키 입력 후 실행:
docker compose up -d --build
docker compose logs -f
```
