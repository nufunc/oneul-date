# DB 운영 가이드 — 주기적 데이터 강화

> 2026-08-16. **주기적으로 DB를 강화해야 이 콘텐츠가 살아남는다** — 스폿은 폐업하고 트렌드는 이동한다.
> 절차 상세: `.claude/skills/live-spot-research/SKILL.md` / 데이터 방향: `docs/PLAN.md` 4절

## 1. 다른 세션에서 실행하는 DB 강화 명령문 (붙여넣기용)

아무 Claude 세션(이 repo 체크아웃 또는 Orca 워크트리)에서 아래를 붙여넣으면 됨:

```
이 세션은 oneul-date 데이터(DB) 강화 전용이다. docs/PLAN.md 4절, docs/RESEARCH-2026-08.md 6절,
.claude/skills/live-spot-research/SKILL.md 를 먼저 읽어라.

임무 (하이쿠 에이전트 15~20팀을 Workflow로 병렬 가동):
1. 트렌드 신규 스폿 수집 — 우선순위: 무알코올 밤(야간개장·야경 산책·심야 카페), 팝업 성지
   상설 공간, 러닝·산책, 근교 반나절 + src/data/spots.json에서 region×slot 최약 조합을 직접
   계산해 타겟. 출처 URL 필수, 2024년 이후 언급만, 기존 이름 제외, 가격 적극 수집.
2. 기존 스폿 검증 — verified 아닌 day/evening/night 스폿 100~150건 폐업/영업 확인 + price 수집.
3. 반영: 신규 → D:\git\obsidianVault\sources\Live_Research_<YYYY-MM-DD>_<라벨>.md (기존 파일 형식),
   검증 → scripts/overrides.json 이름 키 패치 (폐업=exclude, open+출처=verified).
4. python scripts/build_spots_json.py 재실행, 통계 확인. 미매칭 WARNING은 퍼지 매칭으로 키 보정.
5. 커밋 (data/parser 파일만). 금지: push·PR·배포(Actions 워크플로우 켜지 말 것)·앱 코드 수정.
   쿼터 오류 시 확보분만 반영하고 잔여를 커밋 메시지에 기록.
```

## 2. Orca로 독립 세션 띄우기 (메인 세션에서)

```text
orca worktree create --repo id:4bb7d81b-9063-45f8-9c4d-b0add75caf6c \
  --name db-reinforce-<MMDD> --no-parent --agent claude --prompt "<위 명령문>" --json
```

- 워크트리라 메인 체크아웃과 격리됨 (파서 출력 경로 상대화 완료 — 자기 체크아웃에 씀)
- obsidianVault는 공유지만 md 추가는 append-only라 안전
- 완료 후 병합: `git fetch origin && git merge origin/nufunc/db-reinforce-<MMDD>` → 파서 재실행 → 검증

## 3. 운영 주기 제안

| 주기 | 작업 | 규모 |
|---|---|---|
| 주 1회 | 수집 10팀 + 검증 10팀 웨이브 (§1 명령문) | 신규 ~60건, 검증 ~80건 |
| 월 1회 | 적절성 검토 (검색 없이 slot/mood 오분류·부적합 스캔) | 전체 훑기 |
| 분기 1회 | verified 스폿 재검증 (검증도 낡는다) | verified 전수 |

- 쿼터 노트: 하이쿠 웨이브 ~50팀 연속이면 WebSearch 쿼터 소진, ~25분 후 회복 패턴

## 4. DB 분리 로드맵 (최종: 별도 데이터베이스화)

현재: obsidianVault md → 파서 → `src/data/spots.json` → **JS 번들에 인라인** (2MB)

| 단계 | 내용 | 효과 | 시점 |
|---|---|---|---|
| D1 | spots.json을 번들에서 분리, 앱이 `fetch()` 로딩 | 데이터 갱신 ≠ 앱 재빌드. 번들 90% 감소 | 다음 앱 작업 때 (main.ts 소규모 수정) |
| D2 | 데이터 전용 repo(예: oneul-date-db) 분리, 앱은 그 repo의 Pages/CDN URL에서 fetch | 데이터 커밋·배포가 앱과 완전 독립 — 강화 세션이 앱 repo를 건드릴 필요 없어짐 | 주기 운영 정착 후 |
| D3 (선택) | SQLite/서버리스 DB (Supabase 등) | 서버 필요 — "서버 없음" 원칙과 트레이드오프. 검색·통계·운영도구가 필요해질 때만 | 보류 |

권장: **D1 → D2 순으로 충분**. D3는 취미 범위를 넘으므로 필요가 증명될 때까지 보류.
