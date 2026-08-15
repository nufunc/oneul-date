# 오늘 데이트 — 디자인 강화 기획서 (제안)

> 2026-08-15 작성. **확정 문서가 아니라 선택지를 제시하는 제안서**입니다.
> 전제: PLAN.md의 원칙 준수 — 틀 위주(디자인 = `:root` 토큰 교체), 모바일 웹 우선(~430px 기준 · max-width 640px), 기능·버튼 추가 없음, 무료 리소스만 사용.

---

## 1. 현재 상태 진단

현 `src/style.css`의 토큰 체계는 이미 스킨 교체에 충분한 구조를 갖추고 있다:

| 그룹 | 토큰 |
|---|---|
| 색 (11종) | `--color-bg` `--color-surface` `--color-surface-sub` `--color-border` `--color-text` `--color-text-sub` `--color-text-faint` `--color-accent` `--color-accent-soft` `--color-on-accent` `--color-backdrop` |
| 간격 (6종) | `--space-1` ~ `--space-6` (4/8/12/16/20/28px) |
| 라운드 (4종) | `--radius-sm/md/lg/full` (8/12/16/999px) |
| 폰트 크기 (5종) | `--font-xs/sm/md/lg/xl` (0.75~1.3rem) |
| 기타 | `--font-sans`(Pretendard), `--shadow-card`, `--shadow-float`, `--layout-max` |

**뉴트럴 스킨의 한계**: 그레이 배경 + 화이트 카드 + 액센트 1색(#f0506e)의 "와이어프레임에 색만 얹은" 상태라 데이트라는 감성적 맥락이 화면에 드러나지 않는다. 또 액센트 한 색이 fill(버튼 배경)과 텍스트(슬롯 뱃지·지도 링크)를 겸하고 있어, 흰 글자 대비(#f0506e 위 white ≈ 3.2:1)와 작은 텍스트 대비를 동시에 만족시키지 못하는 구조적 문제가 있다.

**공통 토큰 추가 제안 (어느 안을 골라도 적용)**: 액센트를 역할로 분리한다.

- `--color-accent` — fill 전용 (버튼 배경 등, 위에는 `--color-on-accent`만)
- `--color-accent-text` — 밝은 배경 위 작은 텍스트 전용 (슬롯 뱃지·지도 링크·카운트), 4.5:1 이상 보장
- `--font-display` — 헤딩용 폰트 스택 (A안에서 세리프, B/C안에서는 `var(--font-sans)`와 동일값)

이렇게 하면 마크업 변경 없이 CSS에서 `.step-slot`, `.step-map-link`, `.overlay-count`, `.saved-item-meta`의 `color`만 `--color-accent-text`로 바꾸는 1회 작업 후, 이후 모든 스킨이 대비를 자동으로 만족한다.

---

## 2. 디자인 방향 3안

> 각 안의 표는 현 `:root` 블록에 **그대로 붙여넣을 수 있는 실값**이다. 간격 토큰은 3안 모두 현행 유지(변경 불필요).

### A안 — 감성 매거진 (Editorial Warm)

**컨셉 한 줄**: 미색 종이 위에 인쇄된 주말 여행 매거진의 데이트 코스 페이지.

**무드**: 크림/아이보리 배경, 테라코타 포인트, 세리프 헤딩. 그림자를 거의 걷어내고 얇은 선과 여백으로 위계를 만드는 에디토리얼 톤. 라운드를 한 단계 줄여 지면(紙面) 느낌.

**어울리는 이유**: 결과물이 "코스 = 읽는 콘텐츠"다. 스텝 카드 목록이 잡지 기사의 코스 추천 꼭지처럼 읽히면 텍스트 복사→카톡 전달이라는 핵심 플로우와 톤이 일치한다. 뷰·전망/힐링/레트로 같은 분위기 축과도 궁합이 좋다.

| 토큰 | 값 | 비고 |
|---|---|---|
| `--color-bg` | `#f6f1e7` | 미색 종이 |
| `--color-surface` | `#fffdf7` | |
| `--color-surface-sub` | `#f0e9db` | |
| `--color-border` | `#e3d9c6` | |
| `--color-text` | `#2c2620` | 대비 ≈ 13:1 |
| `--color-text-sub` | `#6e6355` | 대비 ≈ 5.6:1 |
| `--color-text-faint` | `#a29686` | 장식·라벨 전용 |
| `--color-accent` | `#a84b26` | 테라코타 (fill) |
| `--color-accent-text` | `#8c3c1c` | 텍스트용, 대비 ≈ 6:1 |
| `--color-accent-soft` | `rgba(168, 75, 38, 0.09)` | |
| `--color-on-accent` | `#fffdf7` | |
| `--color-backdrop` | `rgba(44, 38, 32, 0.5)` | |
| `--radius-sm/md/lg` | `4px / 8px / 12px` | 각을 살림 |
| `--shadow-card` | `none` | 선 위주 위계 |
| `--shadow-float` | `0 -12px 40px rgba(44, 38, 32, 0.18)` | |

**타이포**: `--font-display: 'MaruBuri', 'Noto Serif KR', serif;` (마루부리 — 네이버 무료 배포, jsdelivr CDN 있음. 대안 Noto Serif KR — 구글 폰트 무료). 적용 범위는 `.app-title` `.course-title` `.step-name` 3곳만 — 본문은 Pretendard 유지. 스케일: `--font-xl: 1.45rem`으로 확대, `.app-title` `letter-spacing: 0` (세리프는 자간 축소 불필요), 나머지 현행 유지.

### B안 — 다크 프리미엄 (Night Date)

**컨셉 한 줄**: 밤 데이트를 계획하는 앱다운, 딥 네이비 위 골드 포인트의 바(bar) 무드.

**무드**: 화면 전체가 어두운 남색, 카드가 살짝 밝은 층, 골드가 유일한 색. 그림자 대신 카드 상단 1px 하이라이트와 보더로 깊이 표현. 럭셔리/야경/바 슬롯의 정서와 직결.

**어울리는 이유**: 데이트 계획은 저녁~밤에 세우는 경우가 많고(사용 시간대와 무드 일치), 숙박·나이트 슬롯이 핵심 차별 기능이다. 다크가 기본이므로 별도 다크모드 작업이 필요 없다는 실리도 있다.

| 토큰 | 값 | 비고 |
|---|---|---|
| `--color-bg` | `#0f1420` | 딥 네이비 |
| `--color-surface` | `#171e2e` | |
| `--color-surface-sub` | `#212a40` | |
| `--color-border` | `#2d3852` | |
| `--color-text` | `#eef1f8` | 대비 ≈ 14:1 |
| `--color-text-sub` | `#a7b1c8` | 대비 ≈ 7:1 |
| `--color-text-faint` | `#68718c` | 장식·라벨 전용 |
| `--color-accent` | `#d9b36a` | 골드 (fill) |
| `--color-accent-text` | `#e3c37f` | 다크 위 텍스트, 대비 ≈ 8:1 |
| `--color-accent-soft` | `rgba(217, 179, 106, 0.13)` | |
| `--color-on-accent` | `#231a08` | 골드 버튼 위 다크 텍스트 |
| `--color-backdrop` | `rgba(0, 0, 0, 0.65)` | |
| `--radius-sm/md/lg` | 현행 유지 (8/12/16) | |
| `--shadow-card` | `inset 0 1px 0 rgba(255,255,255,0.05)` | 상단 하이라이트 |
| `--shadow-float` | `0 -8px 40px rgba(0, 0, 0, 0.55)` | |

**타이포**: Pretendard 단독 유지(`--font-display` = sans). 다크에서는 얇은 굵기가 뭉개지므로 위계는 굵기 대신 색 층(text/sub/faint)으로. `.app-title`은 `letter-spacing: 0.01em`로 살짝 벌려 프리미엄 톤. 스케일 현행 유지. 주의: 토스트(`.toast-msg`)가 `--color-text` 배경을 쓰므로 다크에서는 밝은 배경 + 다크 글자로 자동 반전 — 오히려 잘 어울림.

### C안 — 프레시 데이팅 (현 스킨의 발전형)

**컨셉 한 줄**: 지금의 코랄 액센트를 유지하며 배경에 온기, 형태에 곡선을 더한 밝고 가벼운 데이팅 앱 톤.

**무드**: 순백이 아닌 아주 옅은 핑크 틴트 배경, 화이트 카드, 코랄→핑크 액센트, 라운드 확대. 3안 중 이동 거리가 가장 짧아 리스크 최소.

**어울리는 이유**: 현 구현과 액센트 색상이 연속적이라 사용자가 봐도 "같은 앱이 예뻐졌다"로 인지된다. 이모지 UI(☀️🌆🌙🏠)와 가장 자연스럽게 어울리고, 핫플/로맨틱 무드의 주 타깃 톤이다.

| 토큰 | 값 | 비고 |
|---|---|---|
| `--color-bg` | `#fdf5f6` | 옅은 핑크 틴트 |
| `--color-surface` | `#ffffff` | |
| `--color-surface-sub` | `#faeef1` | |
| `--color-border` | `#f3dde3` | |
| `--color-text` | `#27191e` | 대비 ≈ 15:1 |
| `--color-text-sub` | `#7c6770` | 대비 ≈ 5:1 |
| `--color-text-faint` | `#b09aa4` | 장식·라벨 전용 |
| `--color-accent` | `#ef4b6d` | 코랄 (fill, 현행 근사) |
| `--color-accent-text` | `#c22550` | 텍스트용, 대비 ≈ 5.5:1 |
| `--color-accent-soft` | `rgba(239, 75, 109, 0.1)` | |
| `--color-on-accent` | `#ffffff` | |
| `--color-backdrop` | `rgba(39, 25, 30, 0.45)` | |
| `--radius-sm/md/lg` | `10px / 14px / 20px` | 곡선 확대 |
| `--shadow-card` | `0 2px 8px rgba(194, 37, 80, 0.05)` | 색 있는 그림자 |
| `--shadow-float` | `0 -8px 30px rgba(39, 25, 30, 0.18)` | |

**타이포**: Pretendard 단독 유지. `--font-xl: 1.35rem`, `.app-title`에 `color: var(--color-accent-text)`로 브랜드 컬러 헤딩(선택). 스케일 나머지 현행 유지.

> **참고**: fill 액센트(#ef4b6d) 위 흰 글자는 3.3:1로 WCAG AA 일반 텍스트 기준엔 못 미친다. `.btn-primary`는 bold + 0.95rem이라 실사용 문제는 작지만, 엄격히 가려면 `--color-accent`를 `#e13a60`(3.9:1) 또는 `#d6336c`(4.8:1)까지 내리는 선택지가 있다 — 6장 결정 사항.

---

## 3. 공통 강화 항목 (어느 안이든 적용)

### 3.1 컴포넌트 폴리시 — 시각 위계

모두 CSS만으로 가능, 마크업 변경 없음.

- **슬롯 토글**: 켠 상태에 `box-shadow: 0 0 0 1px var(--color-accent) inset` 추가로 "선택됨"을 두 겹으로. 끈 상태 이모지 grayscale은 유지(잘 작동 중).
- **pill**: active pill을 fill(`--color-accent`) 유지하되, 지역처럼 **다중 선택** pill은 체크 느낌이 나도록 active 시 `font-weight: 700` + 미세 스케일. 비active pill의 배경을 `--color-surface`로 올려 카드 안에서 한 층 뜨게.
- **스텝 카드**: 슬롯 뱃지(`.step-slot`)를 카드의 유일한 컬러 포인트로 유지하고, `.step-summary`(킬링 포인트 한 줄)에 왼쪽 2px 액센트 보더를 줘 "추천 이유"로 격상. `.step-name`이 최상위, location/price는 sub/faint로 현행 유지.
- **타임라인 연결선**: `.step-list`의 카드 사이를 세로 점선으로 연결 — `.step-card:not(:last-child)::after`(높이 12px 점선, 카드 밖 왼쪽 정렬)로 구현. 코스가 "한 줄 동선"임을 시각화하는 이 프로젝트 최대 효율의 폴리시. 마크업 무변경.
- **토스트**: `backdrop-filter: blur(8px)` + 반투명 배경으로 층 분리 (지원 안 되는 브라우저는 현행 불투명 폴백).
- **오버레이(저장한 코스 시트)**: 시트 상단에 grabber(가운데 36×4px 라운드 바)를 `.overlay-head::before`로 추가 — 바텀시트 관용 표현. backdrop에 `backdrop-filter: blur(2px)` 선택 적용.

### 3.2 마이크로 인터랙션 (CSS 전환 위주, JS 최소)

- **코스 생성 시 스텝 카드 스태거 등장**: `.step-card`에 `animation: step-in 0.35s ease both` (translateY(12px)+fade), `nth-child(1~4)`에 0/60/120/180ms 지연. 스텝이 최대 4개라 순수 CSS로 끝. 결과가 즉시 계산되는 앱이라 이 등장 모션이 곧 "생성됐다"는 피드백을 겸한다.
- **교체(🔄) 시 카드 전환**: 현 구조는 `renderResults()` 전체 재렌더라 교체해도 스태거가 전부 재생된다. 두 옵션:
  - **옵션 1 (JS 0줄)**: 전체 스태거 재생을 그대로 수용 — "다시 뽑았다"는 느낌으로 자연스러움.
  - **옵션 2 (JS ~5줄)**: `swapStep()`에서 해당 카드 DOM만 교체하고 `swap-in` 클래스(fade+scale 0.97→1)를 부여 — 바뀐 카드만 반응. 권장.
- **버튼 프레스 피드백**: `.btn-primary:active, .slot-toggle:active, .pill:active { transform: scale(0.97); }` + `transition: transform 0.1s`. 전 버튼 공통.
- **전제**: `@media (prefers-reduced-motion: reduce)`에서 모든 animation/transition 해제 블록 1개 추가.

### 3.3 다크모드 — 토큰 이중화 전략

- 구조: `:root { …라이트 토큰… }` + `@media (prefers-color-scheme: dark) { :root { …다크 오버라이드… } }`. 컴포넌트 CSS는 전부 토큰만 참조하므로 **오버라이드 블록 하나로 완결** — 이것이 틀 위주 설계의 배당금.
- 안별 전략:
  - **B안 선택 시**: 앱 자체가 다크. 대응 불필요(라이트 역대응은 백로그).
  - **A/C안 선택 시**: 다크 팔레트 1벌 추가 제작. C안의 다크는 B안 팔레트를 액센트만 코랄로 바꿔 재활용 가능(제작비 거의 0). A안의 다크(따뜻한 다크 브라운)는 난도가 있어 후순위 권장.
- 주의점 2곳: 토스트(text/surface 반전 사용)와 슬롯 이모지 grayscale은 다크에서도 성립하는지 확인 — 둘 다 토큰 기반이라 문제없을 것으로 예상되나 QA 항목에 포함.

### 3.4 빈 상태 · 로딩 상태

- **초기 빈 상태**(`.results-empty`): 현재 텍스트 2줄뿐. 큰 이모지(💌) + 카피 + 아래로 향하는 미세 bounce 화살표(CSS) 3층 구성으로. "코스 만들기" 버튼이 위에 있으므로 화살표는 **위**를 가리키게.
- **후보 없음 카드**(`.step-card.empty`): dashed 보더 유지 + 이모지(🤔) 추가, "조건을 넓혀보세요" 서브 카피로 다음 행동 유도.
- **로딩 상태**: 코스 생성은 로컬 JSON 필터링이라 **로딩이 존재하지 않는다**. 스켈레톤 UI는 만들지 않는다(가짜 로딩 금지). 유일한 실제 대기는 폰트 로드 — `font-display: swap` 확인만.

### 3.5 앱 아이콘 · 파비콘 · OG 이미지

현재 `index.html`에 파비콘·OG 메타가 전무 — **카톡 공유가 핵심 플로우이므로 체감 효과가 가장 큰 저비용 항목**.

- **파비콘**: SVG 파비콘 1개 (`public/favicon.svg`) — 선택한 스킨의 accent 배경 라운드 사각형 + 이모지/이니셜. 코드로 제작, 에셋 비용 0.
- **앱 아이콘**: `apple-touch-icon` 180×180 PNG 1장 (홈 화면 추가용). SVG에서 변환.
- **OG 이미지**: `public/og.png` 1200×630 정적 1장 — 스킨 배경색 + 앱 타이틀 + "조건만 고르면 데이트 코스 완성" 카피. HTML→스크린샷으로 제작(무료). 카톡은 `og:title/description/image`를 읽는다.
- **메타 태그** (index.html `<head>` 추가분):
  ```html
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta property="og:title" content="오늘 데이트" />
  <meta property="og:description" content="조건만 고르면 시간대별 데이트 코스 완성" />
  <meta property="og:image" content="https://<배포도메인>/og.png" />
  <meta name="theme-color" content="<스킨의 --color-bg 값>" />
  ```
- 주의: `og:image`는 **절대 URL 필수**(배포 후 확정), 카톡 캐시는 수정 후 카카오 디벨로퍼스 캐시 초기화 도구로 갱신.

---

## 4. 접근성 최소선

| 항목 | 기준 | 현황 및 조치 |
|---|---|---|
| 터치 타깃 | 44×44px | `.btn-swap`(🔄)이 미달 — `min-width/min-height: 44px` 지정. `.overlay-close`(✕), `.saved-item-delete`(🗑)도 동일 조치. 나머지는 충족 |
| 텍스트 대비 | 4.5:1 | 2장 각 안의 text/text-sub/accent-text가 기준 충족값으로 설계됨. `--color-text-faint`는 **장식·라벨 전용**으로 역할 제한(정보성 텍스트 금지) — 현재 `.step-price`가 faint를 쓰고 있어 sub로 승격 필요 |
| pill 스크롤 힌트 | 잘림 인지 | `.pill-scroll`에 `mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent)` — 오른쪽 끝 페이드로 "더 있음"을 표시. 스크롤 끝 감지 JS 불필요(마스크는 항상 적용해도 마지막 pill에 여백 padding이 있어 무해) |
| 모션 | 전정 배려 | `prefers-reduced-motion: reduce` 블록 (3.2절) |
| 포커스 | 키보드 | `:focus-visible { outline: 2px solid var(--color-accent-text); outline-offset: 2px }` 전역 1줄 |

---

## 5. 적용 로드맵

| 단계 | 내용 | 작업량 (예상) | 산출 |
|---|---|---|---|
| **D1. 토큰 스킨 교체** | 선택된 안의 `:root` 블록 교체 + `--color-accent-text`/`--font-display` 토큰 도입 + 4곳 색 참조 변경 + (A안 시) 세리프 폰트 링크 1줄 | **~1시간, 1커밋** | 스킨 전환 완료 |
| **D2. 컴포넌트 폴리시** | 3.1 위계 강화 + 4장 접근성(터치 타깃·faint 역할 정리·포커스·pill 마스크) | ~2시간, 1~2커밋 | CSS만 수정 |
| **D3. 인터랙션 · 다크모드** | 3.2 스태거/프레스/reduced-motion (+옵션 2 시 JS ~5줄) + 3.3 다크 토큰 블록(B안이면 생략) | ~2시간, 1~2커밋 | |
| **D4. OG · 아이콘** | favicon.svg / apple-touch-icon / og.png 제작 + index.html 메타 추가 + 카톡 미리보기 검증 | ~1.5시간, 1커밋 | 배포 도메인 확정 후 |

각 단계는 독립 배포 가능. D1만 해도 인상이 바뀌고, D4는 배포(M3)와 묶는 것이 효율적.

## 6. 결정 필요 사항 (사용자 선택)

1. **방향 안**: A(감성 매거진) / B(다크 프리미엄) / C(프레시 데이팅) — 최우선 결정
2. **다크모드 우선순위**: C안 선택 시 다크 대응을 D3에 포함할지 백로그로 미룰지 (A안이면 백로그 권장, B안이면 해당 없음)
3. **C안 액센트 대비 수위**: 현행 톤 유지(#ef4b6d, 버튼 흰 글자 3.3:1) vs 엄격 준수(#d6336c, 4.8:1) — 색감과 접근성의 트레이드오프
4. **A안 세리프 폰트**: MaruBuri(네이버, 개성 강함) vs Noto Serif KR(구글, 무난) — A안 선택 시에만
5. **교체 애니메이션 범위**: 옵션 1(전체 스태거 재생, JS 0줄) vs 옵션 2(바뀐 카드만, JS ~5줄) — 권장은 옵션 2
6. **OG 이미지 카피**: "조건만 고르면 데이트 코스 완성" 기본안 승인 여부 + 배포 도메인 확정 시점
