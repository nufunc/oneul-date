import './style.css';
import rawSpotsData from './data/spots.json';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SlotKey = 'day' | 'evening' | 'night' | 'stay';

interface Spot {
  id: number;
  name: string;
  slot: SlotKey | null;
  region: string;
  mood: string[]; // 'romantic' | 'healing' | 'luxury' | 'gourmet' | 'active' | 'view' | 'retro' | 'trendy'
  /** 시·군·구 단위 근접 지역 (파서가 병렬 추가 중 — 필드 부재/null 허용, spotArea()로만 접근) */
  area?: string | null;
  location: string;
  price: string | null;
  summary: string;
  source: { type: string; url: string | null; note: string };
  verified: boolean;
}

interface CourseStep {
  slot: SlotKey;
  spotId: number | null; // null = 후보 없음
}

interface SavedCourse {
  id: string;
  createdAt: string; // ISO
  /** region: 현재 포맷은 배열(다중 선택), 과거 저장분은 문자열 — normalizeRegionCond로 복원 */
  conditions: { region: string[] | string; mood: string; slots: SlotKey[] };
  spotIds: number[];
}

const SLOT_ORDER: SlotKey[] = ['day', 'evening', 'night', 'stay'];

const SLOT_META: Record<SlotKey, { emoji: string; label: string }> = {
  day: { emoji: '☀️', label: '낮' },
  evening: { emoji: '🌆', label: '저녁' },
  night: { emoji: '🌙', label: '밤' },
  stay: { emoji: '🏠', label: '숙박' },
};

// 지역 필터: key → 매칭되는 데이터 region 값 목록 ('전국' region은 항상 포함)
const REGIONS: { key: string; label: string; match: string[] }[] = [
  { key: 'ALL', label: '전체', match: [] },
  { key: 'SEOUL', label: '서울', match: ['서울'] },
  { key: 'GYEONGGI', label: '경기·인천', match: ['경기', '인천'] },
  { key: 'GANGWON', label: '강원', match: ['강원'] },
  { key: 'CHUNGCHEONG', label: '충청', match: ['충청'] },
  { key: 'YEONGNAM', label: '영남', match: ['영남'] },
  { key: 'HONAM', label: '호남', match: ['호남'] },
  { key: 'JEJU', label: '제주', match: ['제주'] },
];

const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: 'ALL', emoji: '', label: '전체' },
  { key: 'romantic', emoji: '✨', label: '로맨틱' },
  { key: 'healing', emoji: '🌲', label: '힐링' },
  { key: 'luxury', emoji: '👑', label: '럭셔리' },
  { key: 'gourmet', emoji: '🍷', label: '미식' },
  { key: 'active', emoji: '🛶', label: '액티비티' },
  { key: 'view', emoji: '🌅', label: '뷰·전망' },
  { key: 'retro', emoji: '🏮', label: '레트로·전통' },
  { key: 'trendy', emoji: '🔥', label: '핫플' },
];

/** '⋯ 더보기'로 접어두는 분위기 4종 — 데이터는 8종 유지, UI만 접기 (PLAN.md 3절) */
const EXTRA_MOOD_KEYS = ['luxury', 'active', 'view', 'retro'];

const STORAGE_KEY = 'oneul_saved_courses';
const RECENT_KEY = 'oneul_recent_spots';
const RECENT_MAX = 100;

const spots: Spot[] = rawSpotsData as unknown as Spot[];

// ---------------------------------------------------------------------------
// 순수 함수 — 필터 · 후보 계산 · 랜덤 픽 · 코스 생성 · 텍스트 포맷 (상태/DOM 없음)
// ---------------------------------------------------------------------------

function isValidSlot(value: unknown): value is SlotKey {
  return value === 'day' || value === 'evening' || value === 'night' || value === 'stay';
}

/** 선택된 지역 키들의 합집합으로 매칭. 빈 배열 = 전체 */
function matchesRegion(spot: Spot, regionKeys: string[]): boolean {
  if (regionKeys.length === 0) return true;
  if (spot.region === '전국') return true;
  return regionKeys.some((key) => {
    const region = REGIONS.find((r) => r.key === key);
    return region ? region.match.includes(spot.region) : false;
  });
}

function matchesMood(spot: Spot, moodKey: string): boolean {
  if (moodKey === 'ALL') return true;
  return Array.isArray(spot.mood) && spot.mood.includes(moodKey);
}

/** 슬롯 + 지역 + 분위기 조건에 맞는 후보 목록 (excludeIds 제외) */
function getCandidates(
  all: Spot[],
  slot: SlotKey,
  regionKeys: string[],
  moodKey: string,
  excludeIds: number[],
): Spot[] {
  return all.filter(
    (s) =>
      isValidSlot(s.slot) &&
      s.slot === slot &&
      matchesRegion(s, regionKeys) &&
      matchesMood(s, moodKey) &&
      !excludeIds.includes(s.id),
  );
}

/**
 * 체감 랜덤 보정 — 최근 노출 이력 스폿을 소프트 제외.
 * 제외하면 후보가 0이 되는 경우 이력을 무시하고 원본 반환 (기능이 후보를 굶기면 안 됨).
 */
function excludeRecent(candidates: Spot[], recentIds: ReadonlySet<number>): Spot[] {
  if (recentIds.size === 0) return candidates;
  const filtered = candidates.filter((s) => !recentIds.has(s.id));
  return filtered.length > 0 ? filtered : candidates;
}

/** rng 주입 가능 랜덤 픽 — 오늘의 코스(시드 PRNG)와 일반 생성(Math.random)이 공유 */
function pickRandom<T>(arr: T[], rng: () => number = Math.random): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** 스폿의 area 안전 접근 — 필드 부재·null·빈 문자열은 모두 null 취급 */
function spotArea(spot: Spot | undefined): string | null {
  if (!spot) return null;
  return typeof spot.area === 'string' && spot.area.length > 0 ? spot.area : null;
}

/**
 * 앵커 area 기준 근접 랜덤 선택.
 * ① anchorArea와 같은 area 후보에서 랜덤 (area가 null인 스폿 제외)
 * ② 없으면 전체 후보(=같은 권역 조건 통과분, area null 포함)에서 랜덤 폴백
 */
function pickNearRandom(
  candidates: Spot[],
  anchorArea: string | null,
  rng: () => number = Math.random,
): Spot | undefined {
  if (anchorArea !== null) {
    const near = pickRandom(candidates.filter((s) => spotArea(s) === anchorArea), rng);
    if (near) return near;
  }
  return pickRandom(candidates, rng);
}

/** 스텝 목록에서 excludeIndex를 제외한 스폿들의 최빈 area (null 제외, 동률은 선착순) */
function dominantArea(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  excludeIndex: number,
): string | null {
  const counts = new Map<string, number>();
  steps.forEach((st, i) => {
    if (i === excludeIndex || st.spotId === null) return;
    const area = spotArea(byId.get(st.spotId));
    if (area !== null) counts.set(area, (counts.get(area) ?? 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  for (const [area, count] of counts) {
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  }
  return best;
}

interface GenerateOptions {
  /** 시드 PRNG 주입 (오늘의 코스). 미지정 시 Math.random */
  rng?: () => number;
  /** 체감 랜덤 보정 — 소프트 제외할 최근 노출 스폿 ID (오늘의 코스는 미적용) */
  avoidIds?: ReadonlySet<number>;
}

/**
 * 앵커 기반 근접 코스 생성.
 * 1) 켠 슬롯 중 후보 수가 가장 적은(단, 1개 이상) 슬롯을 앵커로 먼저 랜덤 선택
 * 2) 나머지 슬롯은 앵커의 area 기준 ① 같은 area → ② 권역 전체 폴백으로 랜덤 선택
 * 후보 0건 슬롯은 spotId: null. area 데이터가 전무하면 전부 ②폴백 = 기존 동작과 동일.
 * avoidIds(최근 노출 이력)는 슬롯별 소프트 제외 — 제외 후 0건이면 이력 무시.
 */
function generateCourse(
  all: Spot[],
  slotsOn: SlotKey[],
  regionKeys: string[],
  moodKey: string,
  opts: GenerateOptions = {},
): CourseStep[] {
  const rng = opts.rng ?? Math.random;
  const avoid = opts.avoidIds ?? new Set<number>();

  // 앵커 슬롯: 후보가 1개 이상인 슬롯 중 후보 수 최소 (동률은 슬롯 순서 선착순)
  let anchorSlot: SlotKey | null = null;
  let anchorPool: Spot[] = [];
  for (const slot of slotsOn) {
    const candidates = excludeRecent(getCandidates(all, slot, regionKeys, moodKey, []), avoid);
    if (candidates.length > 0 && (anchorSlot === null || candidates.length < anchorPool.length)) {
      anchorSlot = slot;
      anchorPool = candidates;
    }
  }

  const picked: number[] = [];
  let anchorArea: string | null = null;
  let anchorSpotId: number | null = null;
  if (anchorSlot !== null) {
    const anchor = pickRandom(anchorPool, rng);
    if (anchor) {
      picked.push(anchor.id);
      anchorSpotId = anchor.id;
      anchorArea = spotArea(anchor);
    }
  }

  return slotsOn.map((slot) => {
    if (slot === anchorSlot) return { slot, spotId: anchorSpotId };
    const candidates = excludeRecent(
      getCandidates(all, slot, regionKeys, moodKey, picked),
      avoid,
    );
    const chosen = pickNearRandom(candidates, anchorArea, rng);
    if (chosen) picked.push(chosen.id);
    return { slot, spotId: chosen ? chosen.id : null };
  });
}

/** 선택 지역 라벨을 '·'로 연결. 빈 배열(전체)이면 '전국' */
function regionsLabel(regionKeys: string[]): string {
  if (regionKeys.length === 0) return '전국';
  return regionKeys
    .map((key) => REGIONS.find((r) => r.key === key)?.label ?? key)
    .join('·');
}

/** 저장 포맷 하위호환 — 과거 문자열 region('ALL' 포함)을 배열로 정규화 */
function normalizeRegionCond(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.filter((k) => k !== 'ALL');
  if (typeof value === 'string' && value !== 'ALL') return [value];
  return [];
}

function moodLabel(moodKey: string): string {
  if (moodKey === 'ALL') return '전체';
  return MOODS.find((m) => m.key === moodKey)?.label ?? moodKey;
}

/** 스폿 mood 키 → 한글 라벨 1~2개 (스텝 카드 신뢰 장치용) */
function moodTagLabels(spot: Spot): string[] {
  if (!Array.isArray(spot.mood)) return [];
  return spot.mood
    .map((key) => MOODS.find((m) => m.key === key)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
}

/**
 * 네이버 지도 검색어 정제.
 * - 이름에서 `[전남 여수]` 같은 대괄호 접두어, `(Yeosu ...)`·`（...）` 괄호 병기를 제거하고 공백 정리
 * - 정제 후 이름이 비면 원래 이름으로 폴백
 * - 지역 부착: area(시·군·구) 우선, 없으면 region(단, '전국'이면 이름만)
 * 네이버 지도 검색은 "상호명 + 동네" 수준의 짧은 질의에서 잘 동작하므로 도로명 주소는 쓰지 않는다.
 */
function mapQuery(spot: Spot): string {
  let name = spot.name
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length === 0) name = spot.name.replace(/\s+/g, ' ').trim();

  const area = spotArea(spot);
  if (area !== null) return `${name} ${area}`;
  if (spot.region && spot.region !== '전국') return `${name} ${spot.region}`;
  return name;
}

/** 스폿의 네이버 지도 검색 URL — 정제된 "상호명 + 동네" 질의로 검색 */
function naverMapUrl(spot: Spot): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(mapQuery(spot))}`;
}

/**
 * 텍스트 복사 포맷 v2 (PLAN.md 3절) — 카톡에 붙였을 때 그대로 예쁜 정형 포맷.
 * 헤더(✨/📍) + 슬롯 블록(슬롯 이모지 · 스폿명 / 전각 들여쓰기 위치 — 이유 / 지도 링크)
 */
function formatCourseText(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  regionKeys: string[],
  moodKey: string,
): string {
  const blocks: string[] = [];
  blocks.push(`✨ 데이트 코스\n📍 ${regionsLabel(regionKeys)} · ${moodLabel(moodKey)}`);
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  for (const step of filled) {
    const spot = byId.get(step.spotId);
    if (!spot) continue;
    const meta = SLOT_META[step.slot];
    const lines: string[] = [];
    lines.push(`${meta.emoji} ${meta.label} · ${spot.name}`);
    lines.push(`　${spot.location}${spot.summary ? ` — ${spot.summary}` : ''}`);
    lines.push(`　🗺️ ${naverMapUrl(spot)}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

// --- 날짜 시드 PRNG (오늘의 코스 전용) ------------------------------------------

/** 문자열 → 32비트 해시 (시드 생성용) */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 시드 PRNG — 같은 시드면 같은 수열 (같은 날 누가 열어도 같은 코스) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 오늘의 코스 — YYYY-MM-DD 시드 결정적 생성.
 * 낮+저녁+밤 3슬롯 · 지역 전체 · 분위기 전체, 근접 자동 로직 재사용.
 * 체감 랜덤 보정(최근 이력 제외)은 결정성 유지를 위해 미적용.
 */
function buildTodayCourse(now: Date = new Date()): { dateLabel: string; steps: CourseStep[] } {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rng = mulberry32(hashString(`${yyyy}-${mm}-${dd}`));
  const steps = generateCourse(spots, ['day', 'evening', 'night'], [], 'ALL', { rng });
  return { dateLabel: `${now.getMonth() + 1}/${now.getDate()}`, steps };
}

// --- URL 링크 공유 (코스 = 스폿 ID 배열 → 해시 인코딩) -----------------------------

/** 현재 코스의 공유 URL — 배포 base는 location 기반 동적 생성 (로컬에서도 동작) */
function buildShareUrl(spotIds: number[]): string {
  return `${location.origin}${location.pathname}${location.search}#c=${spotIds.join('.')}`;
}

/** hash에서 공유 코스 ID 배열 파싱. `#c=` 형태가 아니면 null */
function parseCourseHash(hash: string): number[] | null {
  const match = hash.match(/^#c=([0-9.]+)$/);
  if (!match) return null;
  return match[1]
    .split('.')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

interface AppState {
  slots: Record<SlotKey, boolean>;
  /** 선택된 지역 키 다중 선택 — 빈 배열이면 '전체' */
  regions: string[];
  mood: string;
  /** 분위기 pill '⋯ 더보기' 펼침 여부 (숨김 mood 선택 시엔 강제 펼침) */
  moodExpanded: boolean;
  course: CourseStep[] | null;
  /** 코스 생성 시점의 조건 스냅샷 — 교체 후보·저장·복사가 이 조건 기준으로 동작 */
  courseConditions: { regions: string[]; mood: string } | null;
  savedOpen: boolean;
}

const state: AppState = {
  slots: { day: true, evening: true, night: false, stay: false },
  regions: [],
  mood: 'ALL',
  moodExpanded: false,
  course: null,
  courseConditions: null,
  savedOpen: false,
};

const spotById = new Map<number, Spot>(spots.filter((s) => typeof s.id === 'number').map((s) => [s.id, s]));

function activeSlots(): SlotKey[] {
  return SLOT_ORDER.filter((k) => state.slots[k]);
}

function courseSpotIds(): number[] {
  if (!state.course) return [];
  return state.course.filter((st) => st.spotId !== null).map((st) => st.spotId as number);
}

// ---------------------------------------------------------------------------
// localStorage — 저장한 코스 · 최근 노출 이력
// ---------------------------------------------------------------------------

function loadSavedCourses(): SavedCourse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as SavedCourse[]) : [];
  } catch {
    return [];
  }
}

function persistSavedCourses(list: SavedCourse[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** 최근 노출 스폿 ID 이력 (오래된 순 → 최신 순, 최대 RECENT_MAX개 FIFO) */
function loadRecentSpotIds(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

/** 노출된 스폿을 이력 맨 뒤에 추가 (중복은 최신 위치로 이동), RECENT_MAX 초과분은 앞에서 제거 */
function addRecentSpotIds(ids: number[]): void {
  if (ids.length === 0) return;
  const merged = [...loadRecentSpotIds().filter((id) => !ids.includes(id)), ...ids];
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged.slice(-RECENT_MAX)));
  } catch {
    // 저장 실패(용량 등)는 무시 — 보정 기능은 있으면 좋고 없어도 동작
  }
}

function recentSpotIdSet(): ReadonlySet<number> {
  return new Set(loadRecentSpotIds());
}

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg: string): void {
  let toast = document.querySelector('.toast-msg') as HTMLElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  window.setTimeout(() => toast?.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------
// 렌더 — 영역별 분할 (앱 셸은 1회, 오늘의코스/조건/결과/오버레이는 개별 재렌더)
// ---------------------------------------------------------------------------

const app = document.getElementById('app')!;

function renderShell(): void {
  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title">오늘 데이트</h1>
      <button class="btn-saved" id="btn-open-saved">저장한 코스</button>
    </header>
    <section class="today-course-area" id="today-area"></section>
    <section class="conditions" id="conditions-area"></section>
    <section class="results" id="results-area"></section>
    <div class="overlay-root" id="overlay-root"></div>
  `;
  document.getElementById('btn-open-saved')!.addEventListener('click', () => {
    state.savedOpen = true;
    renderOverlay();
  });
  renderTodayCourse();
  renderConditions();
  renderResults();
  renderOverlay();
}

// --- 오늘의 코스 (S1) -----------------------------------------------------------

function renderTodayCourse(): void {
  const area = document.getElementById('today-area');
  if (!area) return;
  const today = buildTodayCourse();
  const filled = today.steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  const parts = filled
    .map((st) => {
      const spot = spotById.get(st.spotId);
      return spot ? `${SLOT_META[st.slot].emoji} ${escapeHtml(spot.name)}` : null;
    })
    .filter((p): p is string => p !== null);

  if (parts.length === 0) {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <button class="today-course" id="btn-today-course" aria-label="오늘의 코스를 결과 영역에 펼치기">
      <span class="today-course-title">✨ 오늘 ${today.dateLabel}의 코스</span>
      <span class="today-course-strip">${parts.join(' → ')}</span>
    </button>
  `;
  document.getElementById('btn-today-course')!.addEventListener('click', () => {
    // 오늘의 코스를 결과 영역에 로드 — 이후 교체·복사·저장은 일반 코스와 동일하게 동작
    state.slots = { day: true, evening: true, night: true, stay: false };
    state.regions = [];
    state.mood = 'ALL';
    state.course = today.steps.map((st) => ({ ...st }));
    state.courseConditions = { regions: [], mood: 'ALL' };
    renderConditions();
    renderResults();
  });
}

// --- 조건 영역 -------------------------------------------------------------

function renderConditions(): void {
  const area = document.getElementById('conditions-area');
  if (!area) return;

  // 숨겨진 mood가 선택돼 있으면 강제 펼침 유지 (접기 버튼도 숨김)
  const forcedOpen = EXTRA_MOOD_KEYS.includes(state.mood);
  const expanded = state.moodExpanded || forcedOpen;
  const visibleMoods = expanded ? MOODS : MOODS.filter((m) => !EXTRA_MOOD_KEYS.includes(m.key));

  area.innerHTML = `
    <div class="slot-toggles" role="group" aria-label="시간대 선택">
      ${SLOT_ORDER.map((k) => {
        const meta = SLOT_META[k];
        return `
          <button class="slot-toggle ${state.slots[k] ? 'on' : ''}" data-slot="${k}" aria-pressed="${state.slots[k]}">
            <span class="slot-emoji">${meta.emoji}</span>
            <span class="slot-label">${meta.label}</span>
          </button>`;
      }).join('')}
    </div>

    <div class="filter-row">
      <span class="filter-label">지역</span>
      <div class="pill-scroll" id="region-pills">
        ${REGIONS.map((r) => {
          const active = r.key === 'ALL' ? state.regions.length === 0 : state.regions.includes(r.key);
          return `<button class="pill ${active ? 'active' : ''}" data-region="${r.key}" aria-pressed="${active}">${r.label}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="filter-row">
      <span class="filter-label">분위기</span>
      <div class="pill-scroll" id="mood-pills">
        ${visibleMoods
          .map(
            (m) =>
              `<button class="pill ${state.mood === m.key ? 'active' : ''}" data-mood="${m.key}">${m.emoji ? `${m.emoji} ` : ''}${m.label}</button>`,
          )
          .join('')}
        ${
          expanded
            ? forcedOpen
              ? ''
              : `<button class="pill pill-more" data-mood-expand="0" aria-expanded="true">접기</button>`
            : `<button class="pill pill-more" data-mood-expand="1" aria-expanded="false">⋯ 더보기</button>`
        }
      </div>
    </div>

    <button class="btn-primary btn-generate" id="btn-generate">코스 만들기</button>
  `;
  bindConditionEvents(area);
}

function bindConditionEvents(area: HTMLElement): void {
  area.querySelectorAll<HTMLButtonElement>('.slot-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot as SlotKey;
      state.slots[slot] = !state.slots[slot];
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#region-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.region || 'ALL';
      if (key === 'ALL') {
        // 전체: 모든 개별 선택 해제
        state.regions = [];
      } else {
        const next = new Set(state.regions);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        // REGIONS 정의 순서 유지 — 모두 끄면 빈 배열이 되어 자동으로 '전체' 복귀
        state.regions = REGIONS.filter((r) => next.has(r.key)).map((r) => r.key);
      }
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#mood-pills .pill[data-mood]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mood = btn.dataset.mood || 'ALL';
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#mood-pills .pill[data-mood-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.moodExpanded = btn.dataset.moodExpand === '1';
      renderConditions();
    });
  });
  area.querySelector('#btn-generate')!.addEventListener('click', () => {
    const slotsOn = activeSlots();
    if (slotsOn.length === 0) {
      showToast('시간대를 하나 이상 켜주세요');
      return;
    }
    state.course = generateCourse(spots, slotsOn, state.regions, state.mood, {
      avoidIds: recentSpotIdSet(),
    });
    state.courseConditions = { regions: [...state.regions], mood: state.mood };
    addRecentSpotIds(courseSpotIds());
    renderResults();
  });
}

// --- 결과 영역 -------------------------------------------------------------

function renderResults(): void {
  const area = document.getElementById('results-area');
  if (!area) return;
  if (!state.course || !state.courseConditions) {
    area.innerHTML = `
      <div class="results-empty">
        시간대와 조건을 고르고<br /><strong>코스 만들기</strong>를 눌러보세요
      </div>
    `;
    return;
  }

  const cond = state.courseConditions;
  area.innerHTML = `
    <div class="course-head">
      <span class="course-title">✨ ${escapeHtml(regionsLabel(cond.regions))} · ${escapeHtml(moodLabel(cond.mood))} 코스</span>
      <button class="btn-regenerate" id="btn-regenerate">🔄 전체 다시 뽑기</button>
    </div>
    <div class="step-list">
      ${state.course.map((step, i) => renderStepCard(step, i)).join('')}
    </div>
    <div class="result-actions result-actions-3">
      <button class="btn-secondary" id="btn-copy">📋 복사</button>
      <button class="btn-secondary" id="btn-share-link">🔗 링크</button>
      <button class="btn-primary" id="btn-save">💾 저장</button>
    </div>
  `;
  bindResultEvents(area);
}

function renderStepCard(
  step: CourseStep,
  index: number,
  opts: { swappable?: boolean } = {},
): string {
  const swappable = opts.swappable !== false;
  const meta = SLOT_META[step.slot];
  if (step.spotId === null) {
    return `
      <article class="step-card empty">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        <p class="step-empty-msg">이 조건에 맞는 후보가 없어요</p>
      </article>
    `;
  }
  const spot = spotById.get(step.spotId);
  if (!spot) {
    return `
      <article class="step-card empty">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        <p class="step-empty-msg">스폿 정보를 찾을 수 없어요</p>
      </article>
    `;
  }
  const moodTags = moodTagLabels(spot);
  const metaRow =
    spot.verified || moodTags.length > 0
      ? `
      <div class="step-meta">
        ${spot.verified ? `<span class="badge-verified">✓ 실존 검증</span>` : ''}
        ${moodTags.length > 0 ? `<span class="step-mood-tags">${escapeHtml(moodTags.join(' · '))}</span>` : ''}
      </div>`
      : '';
  return `
    <article class="step-card">
      <div class="step-card-head">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        ${swappable ? `<button class="btn-swap" data-step-index="${index}" aria-label="${meta.label} 스텝 랜덤 교체">🔄</button>` : ''}
      </div>
      <h3 class="step-name">${escapeHtml(spot.name)}</h3>
      <p class="step-location">📍 ${escapeHtml(spot.location)}</p>
      ${metaRow}
      ${spot.summary ? `<blockquote class="step-quote">“${escapeHtml(spot.summary)}”</blockquote>` : ''}
      ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
      <a class="step-map-link" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer">지도 ↗</a>
    </article>
  `;
}

/**
 * 스텝 하나를 조건 스냅샷 내 후보에서 랜덤 교체 (현재 코스 스폿·자기 자신 제외).
 * 다른 스텝들의 최빈 area 기준 ① 같은 area → ② 권역 전체 폴백으로 근접 선택.
 * 최근 노출 이력은 소프트 제외 (제외 후 0건이면 이력 무시).
 */
function swapStep(index: number): void {
  if (!state.course || !state.courseConditions) return;
  const step = state.course[index];
  if (!step) return;
  const cond = state.courseConditions;
  const candidates = excludeRecent(
    getCandidates(spots, step.slot, cond.regions, cond.mood, courseSpotIds()),
    recentSpotIdSet(),
  );
  const anchorArea = dominantArea(state.course, spotById, index);
  const chosen = pickNearRandom(candidates, anchorArea);
  if (!chosen) {
    showToast('이 조건엔 다른 후보가 없어요');
    return;
  }
  state.course[index] = { slot: step.slot, spotId: chosen.id };
  addRecentSpotIds([chosen.id]);
  renderResults();
}

/** 동일 조건 스냅샷으로 모든 스텝 재생성 (체감 랜덤 보정 적용) */
function regenerateCourse(): void {
  if (!state.course || !state.courseConditions) return;
  const cond = state.courseConditions;
  const slotsOn = state.course.map((st) => st.slot);
  state.course = generateCourse(spots, slotsOn, cond.regions, cond.mood, {
    avoidIds: recentSpotIdSet(),
  });
  addRecentSpotIds(courseSpotIds());
  renderResults();
}

function bindResultEvents(area: HTMLElement): void {
  area.querySelectorAll<HTMLButtonElement>('.btn-swap').forEach((btn) => {
    btn.addEventListener('click', () => {
      swapStep(Number(btn.dataset.stepIndex));
    });
  });
  area.querySelector('#btn-regenerate')?.addEventListener('click', () => {
    regenerateCourse();
  });
  area.querySelector('#btn-copy')?.addEventListener('click', () => {
    if (!state.course || !state.courseConditions) return;
    const text = formatCourseText(
      state.course,
      spotById,
      state.courseConditions.regions,
      state.courseConditions.mood,
    );
    navigator.clipboard
      .writeText(text)
      .then(() => showToast('📋 코스가 복사되었어요'))
      .catch(() => showToast('복사에 실패했어요'));
  });
  area.querySelector('#btn-share-link')?.addEventListener('click', () => {
    const ids = courseSpotIds();
    if (ids.length === 0) {
      showToast('공유할 스폿이 없어요');
      return;
    }
    navigator.clipboard
      .writeText(buildShareUrl(ids))
      .then(() => showToast('🔗 공유 링크가 복사되었어요'))
      .catch(() => showToast('복사에 실패했어요'));
  });
  area.querySelector('#btn-save')?.addEventListener('click', () => {
    if (!state.course || !state.courseConditions) return;
    const ids = courseSpotIds();
    if (ids.length === 0) {
      showToast('저장할 스폿이 없어요');
      return;
    }
    const list = loadSavedCourses();
    const item: SavedCourse = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      conditions: {
        region: [...state.courseConditions.regions],
        mood: state.courseConditions.mood,
        slots: state.course.map((st) => st.slot),
      },
      spotIds: ids,
    };
    list.unshift(item);
    persistSavedCourses(list);
    showToast('💾 코스를 저장했어요');
  });
}

// --- 수신자 뷰 (S5 — 링크로 열었을 때) ---------------------------------------------

/** 공유 ID 배열 → 스텝 목록 (존재하지 않는 스폿·slot 없는 스폿은 건너뜀, 슬롯 순 정렬) */
function buildSharedSteps(ids: number[]): CourseStep[] {
  const steps: CourseStep[] = [];
  for (const id of ids) {
    const spot = spotById.get(id);
    if (spot && isValidSlot(spot.slot)) {
      steps.push({ slot: spot.slot, spotId: id });
    }
  }
  steps.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return steps;
}

/** URL에서 코스 hash 제거 (히스토리 오염 없이) */
function clearCourseHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

/** 조건 영역·오늘의코스·교체 없이 코스 카드만 + [나도 코스 만들기] CTA 하나 */
function renderReceiverView(steps: CourseStep[]): void {
  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title">오늘 데이트</h1>
    </header>
    <section class="receiver-view">
      <p class="receiver-title">✨ 친구가 보낸 데이트 코스</p>
      <div class="step-list">
        ${steps.map((step, i) => renderStepCard(step, i, { swappable: false })).join('')}
      </div>
      <button class="btn-primary btn-make-own" id="btn-make-own">나도 코스 만들기 →</button>
    </section>
  `;
  document.getElementById('btn-make-own')!.addEventListener('click', () => {
    clearCourseHash();
    renderShell();
  });
}

// --- 저장한 코스 오버레이 ------------------------------------------------------

function savedCourseSummary(item: SavedCourse): string {
  const names = item.spotIds
    .map((id) => spotById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(' → ') : '(스폿 정보 없음)';
}

function renderOverlay(): void {
  const root = document.getElementById('overlay-root');
  if (!root) return;
  if (!state.savedOpen) {
    root.innerHTML = '';
    return;
  }
  const list = loadSavedCourses();
  root.innerHTML = `
    <div class="overlay-backdrop" id="overlay-backdrop"></div>
    <div class="overlay-panel" role="dialog" aria-label="저장한 코스">
      <div class="overlay-head">
        <span class="overlay-title">저장한 코스 <span class="overlay-count">${list.length}</span></span>
        <button class="overlay-close" id="overlay-close" aria-label="닫기">✕</button>
      </div>
      <div class="overlay-body">
        ${
          list.length === 0
            ? `<div class="overlay-empty">아직 저장한 코스가 없어요</div>`
            : list
                .map((item) => {
                  const date = new Date(item.createdAt);
                  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
                  return `
              <div class="saved-item">
                <button class="saved-item-main" data-course-id="${escapeHtml(item.id)}">
                  <span class="saved-item-meta">${dateStr} · ${escapeHtml(regionsLabel(normalizeRegionCond(item.conditions.region)))} · ${escapeHtml(moodLabel(item.conditions.mood))}</span>
                  <span class="saved-item-spots">${escapeHtml(savedCourseSummary(item))}</span>
                </button>
                <button class="saved-item-delete" data-delete-id="${escapeHtml(item.id)}" aria-label="삭제">🗑</button>
              </div>`;
                })
                .join('')
        }
      </div>
    </div>
  `;

  const close = () => {
    state.savedOpen = false;
    renderOverlay();
  };
  root.querySelector('#overlay-backdrop')!.addEventListener('click', close);
  root.querySelector('#overlay-close')!.addEventListener('click', close);

  root.querySelectorAll<HTMLButtonElement>('.saved-item-main').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = loadSavedCourses().find((c) => c.id === btn.dataset.courseId);
      if (!item) return;
      restoreCourse(item);
      state.savedOpen = false;
      renderOverlay();
      showToast('코스를 불러왔어요');
    });
  });
  root.querySelectorAll<HTMLButtonElement>('.saved-item-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = loadSavedCourses().filter((c) => c.id !== btn.dataset.deleteId);
      persistSavedCourses(next);
      renderOverlay();
      showToast('삭제했어요');
    });
  });
}

/** 저장한 코스를 결과 영역에 복원 (조건 상태도 함께 복원) */
function restoreCourse(item: SavedCourse): void {
  // spotId → 해당 스폿의 slot으로 스텝 재구성 (스폿 데이터가 사라진 ID는 건너뜀)
  const steps: CourseStep[] = [];
  for (const id of item.spotIds) {
    const spot = spotById.get(id);
    if (spot && isValidSlot(spot.slot)) {
      steps.push({ slot: spot.slot, spotId: id });
    }
  }
  steps.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  // 하위호환: 과거 저장분은 region이 문자열 — 배열로 정규화해 복원
  const regions = normalizeRegionCond(item.conditions.region);
  state.regions = regions;
  state.mood = item.conditions.mood;
  for (const k of SLOT_ORDER) {
    state.slots[k] = item.conditions.slots.includes(k);
  }
  state.course = steps;
  state.courseConditions = { regions: [...regions], mood: item.conditions.mood };

  renderConditions();
  renderResults();
}

// ---------------------------------------------------------------------------
// 시작 — hash에 공유 코스(#c=)가 있으면 수신자 뷰, 아니면 홈
// ---------------------------------------------------------------------------

function init(): void {
  const sharedIds = parseCourseHash(location.hash);
  if (sharedIds !== null) {
    const steps = buildSharedSteps(sharedIds);
    if (steps.length > 0) {
      renderReceiverView(steps);
      return;
    }
    // 전부 무효 ID → 안내 후 홈으로
    clearCourseHash();
    showToast('링크의 코스를 찾을 수 없어요');
  }
  renderShell();
}

init();
