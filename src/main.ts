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

const STORAGE_KEY = 'oneul_saved_courses';

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

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
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
function pickNearRandom(candidates: Spot[], anchorArea: string | null): Spot | undefined {
  if (anchorArea !== null) {
    const near = pickRandom(candidates.filter((s) => spotArea(s) === anchorArea));
    if (near) return near;
  }
  return pickRandom(candidates);
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

/**
 * 앵커 기반 근접 코스 생성.
 * 1) 켠 슬롯 중 후보 수가 가장 적은(단, 1개 이상) 슬롯을 앵커로 먼저 랜덤 선택
 * 2) 나머지 슬롯은 앵커의 area 기준 ① 같은 area → ② 권역 전체 폴백으로 랜덤 선택
 * 후보 0건 슬롯은 spotId: null. area 데이터가 전무하면 전부 ②폴백 = 기존 동작과 동일.
 */
function generateCourse(
  all: Spot[],
  slotsOn: SlotKey[],
  regionKeys: string[],
  moodKey: string,
): CourseStep[] {
  // 앵커 슬롯: 후보가 1개 이상인 슬롯 중 후보 수 최소 (동률은 슬롯 순서 선착순)
  let anchorSlot: SlotKey | null = null;
  let anchorPool: Spot[] = [];
  for (const slot of slotsOn) {
    const candidates = getCandidates(all, slot, regionKeys, moodKey, []);
    if (candidates.length > 0 && (anchorSlot === null || candidates.length < anchorPool.length)) {
      anchorSlot = slot;
      anchorPool = candidates;
    }
  }

  const picked: number[] = [];
  let anchorArea: string | null = null;
  let anchorSpotId: number | null = null;
  if (anchorSlot !== null) {
    const anchor = pickRandom(anchorPool);
    if (anchor) {
      picked.push(anchor.id);
      anchorSpotId = anchor.id;
      anchorArea = spotArea(anchor);
    }
  }

  return slotsOn.map((slot) => {
    if (slot === anchorSlot) return { slot, spotId: anchorSpotId };
    const candidates = getCandidates(all, slot, regionKeys, moodKey, picked);
    const chosen = pickNearRandom(candidates, anchorArea);
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

/** 스폿의 네이버 지도 검색 URL (스폿명 + 위치로 검색) */
function naverMapUrl(spot: Spot): string {
  return `https://map.naver.com/v5/search/${encodeURIComponent(`${spot.name} ${spot.location}`)}`;
}

/** 텍스트 복사 포맷 — 장소별 네이버 지도 링크 포함 */
function formatCourseText(
  steps: CourseStep[],
  spotById: Map<number, Spot>,
  regionKeys: string[],
  moodKey: string,
): string {
  const lines: string[] = [];
  lines.push(`[✨ 데이트 코스 — ${regionsLabel(regionKeys)} · ${moodLabel(moodKey)}]`);
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  for (const step of filled) {
    const spot = spotById.get(step.spotId);
    if (!spot) continue;
    const meta = SLOT_META[step.slot];
    lines.push(`${meta.emoji} ${meta.label}: ${spot.name} (${spot.location})`);
    lines.push(naverMapUrl(spot));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

interface AppState {
  slots: Record<SlotKey, boolean>;
  /** 선택된 지역 키 다중 선택 — 빈 배열이면 '전체' */
  regions: string[];
  mood: string;
  course: CourseStep[] | null;
  /** 코스 생성 시점의 조건 스냅샷 — 교체 후보·저장·복사가 이 조건 기준으로 동작 */
  courseConditions: { regions: string[]; mood: string } | null;
  savedOpen: boolean;
}

const state: AppState = {
  slots: { day: true, evening: true, night: false, stay: false },
  regions: [],
  mood: 'ALL',
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
// localStorage — 저장한 코스
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
// 렌더 — 영역별 분할 (앱 셸은 1회, 조건/결과/시트/오버레이는 개별 재렌더)
// ---------------------------------------------------------------------------

const app = document.getElementById('app')!;

function renderShell(): void {
  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title">오늘 데이트</h1>
      <button class="btn-saved" id="btn-open-saved">저장한 코스</button>
    </header>
    <section class="conditions" id="conditions-area"></section>
    <section class="results" id="results-area"></section>
    <div class="overlay-root" id="overlay-root"></div>
  `;
  document.getElementById('btn-open-saved')!.addEventListener('click', () => {
    state.savedOpen = true;
    renderOverlay();
  });
  renderConditions();
  renderResults();
  renderOverlay();
}

// --- 조건 영역 -------------------------------------------------------------

function renderConditions(): void {
  const area = document.getElementById('conditions-area')!;
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
        ${MOODS.map(
          (m) =>
            `<button class="pill ${state.mood === m.key ? 'active' : ''}" data-mood="${m.key}">${m.emoji ? `${m.emoji} ` : ''}${m.label}</button>`,
        ).join('')}
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
  area.querySelectorAll<HTMLButtonElement>('#mood-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mood = btn.dataset.mood || 'ALL';
      renderConditions();
    });
  });
  area.querySelector('#btn-generate')!.addEventListener('click', () => {
    const slotsOn = activeSlots();
    if (slotsOn.length === 0) {
      showToast('시간대를 하나 이상 켜주세요');
      return;
    }
    state.course = generateCourse(spots, slotsOn, state.regions, state.mood);
    state.courseConditions = { regions: [...state.regions], mood: state.mood };
    renderResults();
  });
}

// --- 결과 영역 -------------------------------------------------------------

function renderResults(): void {
  const area = document.getElementById('results-area')!;
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
    <div class="result-actions">
      <button class="btn-secondary" id="btn-copy">📋 텍스트 복사</button>
      <button class="btn-primary" id="btn-save">💾 코스 저장</button>
    </div>
  `;
  bindResultEvents(area);
}

function renderStepCard(step: CourseStep, index: number): string {
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
  return `
    <article class="step-card">
      <div class="step-card-head">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        <button class="btn-swap" data-step-index="${index}" aria-label="${meta.label} 스텝 랜덤 교체">🔄</button>
      </div>
      <h3 class="step-name">${escapeHtml(spot.name)}</h3>
      <p class="step-location">📍 ${escapeHtml(spot.location)}</p>
      ${spot.summary ? `<p class="step-summary">${escapeHtml(spot.summary)}</p>` : ''}
      ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
      <a class="step-map-link" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer">지도 ↗</a>
    </article>
  `;
}

/**
 * 스텝 하나를 조건 스냅샷 내 후보에서 랜덤 교체 (현재 코스 스폿·자기 자신 제외).
 * 다른 스텝들의 최빈 area 기준 ① 같은 area → ② 권역 전체 폴백으로 근접 선택.
 */
function swapStep(index: number): void {
  if (!state.course || !state.courseConditions) return;
  const step = state.course[index];
  if (!step) return;
  const cond = state.courseConditions;
  const candidates = getCandidates(spots, step.slot, cond.regions, cond.mood, courseSpotIds());
  const anchorArea = dominantArea(state.course, spotById, index);
  const chosen = pickNearRandom(candidates, anchorArea);
  if (!chosen) {
    showToast('이 조건엔 다른 후보가 없어요');
    return;
  }
  state.course[index] = { slot: step.slot, spotId: chosen.id };
  renderResults();
}

/** 동일 조건 스냅샷으로 모든 스텝 재생성 */
function regenerateCourse(): void {
  if (!state.course || !state.courseConditions) return;
  const cond = state.courseConditions;
  const slotsOn = state.course.map((st) => st.slot);
  state.course = generateCourse(spots, slotsOn, cond.regions, cond.mood);
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

// --- 저장한 코스 오버레이 ------------------------------------------------------

function savedCourseSummary(item: SavedCourse): string {
  const names = item.spotIds
    .map((id) => spotById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(' → ') : '(스폿 정보 없음)';
}

function renderOverlay(): void {
  const root = document.getElementById('overlay-root')!;
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
// 시작
// ---------------------------------------------------------------------------

renderShell();
