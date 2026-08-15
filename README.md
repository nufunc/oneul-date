# 오늘 데이트 (oneul-date)

시간대 슬롯(☀️낮 → 🌆저녁 → 🌙밤 → 🏠숙박) 기반 데이트 코스 자동 생성기.
지역·분위기를 고르면 코스가 나오고, 마음에 안 드는 스텝만 교체한 뒤 텍스트로 복사해 공유한다.

**Live**: https://nufunc.github.io/oneul-date/

## 스택

- Vite + TypeScript, 프레임워크 없음 (순수 DOM)
- 서버·DB·계정 없음 — 정적 페이지 + localStorage
- 배포: GitHub Actions → GitHub Pages (`main` 푸시 시 자동)

## 데이터 파이프라인

인터넷/유튜브 조사 → Obsidian 문서 (`D:\git\obsidianVault\sources\*.md`)
→ `scripts/build_spots_json.py` (슬롯/분위기 휴리스틱 분류)
→ `src/data/spots.json`

```sh
python scripts/build_spots_json.py   # 데이터 재생성
npm run dev                          # 로컬 개발
npm run build                        # 타입체크 + 빌드
```

## 문서

- 기획서: [docs/PLAN.md](docs/PLAN.md) — 제품 정의, IA, 스키마 v2, 마일스톤, 백로그
