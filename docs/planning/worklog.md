# 작업 기록 (WORKLOG)

> 다음 세션에서 이어서 하려면: 이 문서 + `docs/PLAN.md`(제품 기획) + `docs/DESIGN.md`(디자인)를 읽으면 전체 맥락 복원됨.
> DB 주기 강화 절차·명령문: `docs/DB-OPS.md` (다른 세션에서 실행 가능)
> **⛔ 배포 금지 설정 중** — 아래 [배포] 절 참고. 사용자가 명시적으로 요청할 때만 배포한다.

## 2026-08-15 세션 결산

### 배포된 상태 (Live: https://nufunc.github.io/oneul-date/)
- **제품**: "오늘 데이트" — 시간대 슬롯(낮/저녁/밤/숙박) 데이트 코스 자동 생성기
- **기능**: 슬롯 토글 + 지역 다중선택 + 분위기 8종 → 코스 생성 / 앵커 기반 근접 자동(같은 시·군·구 우선) / 스텝별 즉시 랜덤 교체 + 전체 다시 뽑기 / 코스 저장(localStorage) / 텍스트 복사(장소별 지도 링크 포함) / 스텝 카드 네이버 지도 링크(`/p/search` + 정제 검색어)
- **디자인**: A안 감성 매거진 (미색+테라코타+Noto Serif KR 헤딩) — 로드맵 D1 완료
- **데이터**: 3,222건 (area 94%, mood 8종, verified 120+)

### 데이터 파이프라인 (핵심 구조)
```
D:\git\obsidianVault\sources\*.md (183개 문서, Live_Research_*.md 포함)
 + scripts/overrides.json (279건: exclude 123 / verified / 필드·slot 보정)
 → python scripts/build_spots_json.py → src/data/spots.json (2.1MB)
```
- 파서 지원: 명시 필드(`- **슬롯/분위기/출처**:`), 오버라이드(이름 키, 미매칭 시 WARNING), area 추출(시·군·구 화이트리스트+지명사전)
- 하이쿠 웨이브 절차: `.claude/skills/live-spot-research/SKILL.md`
- 웨이브 이력: 1차(20) 2차(35) 3차(20) 4차(22) 5차(9) — 검증·적절성·신규발굴. 워크플로우 스크립트는 세션 디렉토리에 있으나 패턴은 스킬 문서로 재현 가능

### 미완 작업 (다음 세션 TODO)
1. **재검증 잔여 70건** — WebSearch 쿼터 소진으로 5차 실패. 배치 준비됨: `scripts/_review5/verify-v5-{1..9}.json` (gitignore됨, 로컬에만 있음). 쿼터 회복 후 하이쿠 9팀 웨이브 재실행 → 결과를 overrides.json 병합 → 파서 재실행
2. **푸시 트리거 미작동** — main 푸시가 Actions를 트리거하지 않음 (원인 미상). 현재 배포는 수동 디스패치만
3. **디자인 로드맵 D2~D4** (docs/DESIGN.md) — 컴포넌트 폴리시 / 인터랙션·다크모드 / **OG 이미지·파비콘** (카톡 공유 미리보기, 저비용 고효과)
4. **백로그** (docs/PLAN.md 7절) — 링크 공유(URL 인코딩), 세부 지역 직접 선택, 좌표 기반 근접, 카카오맵/구글맵, private 전환 시 Vercel/Netlify 이전

### 알아둘 것
- **GitHub private 전환**: 무료 플랜이면 Pages가 꺼짐 → 전환하려면 Vercel/Netlify 이전 먼저
- WebSearch 쿼터: 하이쿠 웨이브 ~50팀 연속이면 소진, ~25분 후 회복되는 패턴
- 데이터 추가 루틴: 조사 md를 obsidianVault/sources에 넣고 파서 실행 → 커밋 (배포는 별도)

## 배포 (⛔ 현재 금지 설정)
- GitHub Actions 워크플로우 **비활성화됨** (`gh workflow disable`). 푸시해도 배포 안 됨.
- 재개 방법: `gh workflow enable deploy.yml -R nufunc/oneul-date` 후
  `gh workflow run deploy.yml -R nufunc/oneul-date --ref main`
- 원칙: **사용자가 명시적으로 "배포해줘"라고 할 때만** 위 명령 실행

## 재개 치트시트
```sh
npm run dev                            # 로컬 확인 (http://localhost:5173)
python scripts/build_spots_json.py    # 데이터 재생성
npm run build                          # 타입체크+빌드
git push origin dev dev:main           # 푸시 (배포 아님 — 워크플로우 꺼져 있음)
```
