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
  mood: string[]; // 'romantic' | 'healing' | 'luxury' | 'gourmet'
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
  conditions: { region: string; mood: string; slots: SlotKey[] };
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

const MOODS: { key: string; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'romantic', label: '로맨틱' },
  { key: 'healing', label: '힐링' },
  { key: 'luxury', label: '럭셔리' },
  { key: 'gourmet', label: '미식' },
];

const STORAGE_KEY = 'oneul_saved_courses';

const spots: Spot[] = rawSpotsData as unknown as Spot[];

// ---------------------------------------------------------------------------
// 순수 함수 — 필터 · 후보 계산 · 랜덤 픽 · 코스 생성 · 텍스트 포맷 (상태/DOM 없음)
// ---------------------------------------------------------------------------

function isValidSlot(value: unknown): value is SlotKey {
  return value === 'day' || value === 'evening' || value === 'night' || value === 'stay';
}

function matchesRegion(spot: Spot, regionKey: string): boolean {
  if (regionKey === 'ALL') return true;
  if (spot.region === '전국') return true;
  const region = REGIONS.find((r) => r.key === regionKey);
  if (!region) return true;
  return region.match.includes(spot.region);
}

function matchesMood(spot: Spot, moodKey: string): boolean {
  if (moodKey === 'ALL') return true;
  return Array.isArray(spot.mood) && spot.mood.includes(moodKey);
}

/** 슬롯 + 지역 + 분위기 조건에 맞는 후보 목록 (excludeIds 제외) */
function getCandidates(
  all: Spot[],
  slot: SlotKey,
  regionKey: string,
  moodKey: string,
  excludeIds: number[],
): Spot[] {
  return all.filter(
    (s) =>
      isValidSlot(s.slot) &&
      s.slot === slot &&
      matchesRegion(s, regionKey) &&
      matchesMood(s, moodKey) &&
      !excludeIds.includes(s.id),
  );
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 켠 슬롯마다 후보에서 랜덤 1개 (이미 뽑힌 스폿 제외). 후보 0건이면 spotId: null */
function generateCourse(
  all: Spot[],
  slotsOn: SlotKey[],
  regionKey: string,
  moodKey: string,
): CourseStep[] {
  const picked: number[] = [];
  return slotsOn.map((slot) => {
    const candidates = getCandidates(all, slot, regionKey, moodKey, picked);
    const chosen = pickRandom(candidates);
    if (chosen) picked.push(chosen.id);
    return { slot, spotId: chosen ? chosen.id : null };
  });
}

function regionLabel(regionKey: string): string {
  if (regionKey === 'ALL') return '전국';
  return REGIONS.find((r) => r.key === regionKey)?.label ?? regionKey;
}

function moodLabel(moodKey: string): string {
  if (moodKey === 'ALL') return '전체';
  return MOODS.find((m) => m.key === moodKey)?.label ?? moodKey;
}

/** 텍스트 복사 포맷 (기획서 3절) */
function formatCourseText(
  steps: CourseStep[],
  spotById: Map<number, Spot>,
  regionKey: string,
  moodKey: string,
): string {
  const lines: string[] = [];
  lines.push(`[✨ 데이트 코스 — ${regionLabel(regionKey)} · ${moodLabel(moodKey)}]`);
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  for (const step of filled) {
    const spot = spotById.get(step.spotId);
    if (!spot) continue;
    const meta = SLOT_META[step.slot];
    lines.push(`${meta.emoji} ${meta.label}: ${spot.name} (${spot.location})`);
  }
  const first = filled.length > 0 ? spotById.get(filled[0].spotId) : undefined;
  if (first) {
    lines.push(`지도: https://map.naver.com/v5/search/${encodeURIComponent(first.name)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

interface AppState {
  slots: Record<SlotKey, boolean>;
  region: string;
  mood: string;
  course: CourseStep[] | null;
  /** 코스 생성 시점의 조건 스냅샷 — 교체 후보·저장·복사가 이 조건 기준으로 동작 */
  courseConditions: { region: string; mood: string } | null;
  sheetStepIndex: number | null; // 교체 바텀시트가 열린 스텝
  savedOpen: boolean;
}

const state: AppState = {
  slots: { day: true, evening: true, night: false, stay: false },
  region: 'ALL',
  mood: 'ALL',
  course: null,
  courseConditions: null,
  sheetStepIndex: null,
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
    <div class="sheet-root" id="sheet-root"></div>
    <div class="overlay-root" id="overlay-root"></div>
  `;
  document.getElementById('btn-open-saved')!.addEventListener('click', () => {
    state.savedOpen = true;
    renderOverlay();
  });
  renderConditions();
  renderResults();
  renderSheet();
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
        ${REGIONS.map(
          (r) =>
            `<button class="pill ${state.region === r.key ? 'active' : ''}" data-region="${r.key}">${r.label}</button>`,
        ).join('')}
      </div>
    </div>

    <div class="filter-row">
      <span class="filter-label">분위기</span>
      <div class="pill-scroll" id="mood-pills">
        ${MOODS.map(
          (m) =>
            `<button class="pill ${state.mood === m.key ? 'active' : ''}" data-mood="${m.key}">${m.label}</button>`,
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
      state.region = btn.dataset.region || 'ALL';
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
    state.course = generateCourse(spots, slotsOn, state.region, state.mood);
    state.courseConditions = { region: state.region, mood: state.mood };
    state.sheetStepIndex = null;
    renderResults();
    renderSheet();
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
      <span class="course-title">✨ ${escapeHtml(regionLabel(cond.region))} · ${escapeHtml(moodLabel(cond.mood))} 코스</span>
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
        <button class="btn-swap" data-step-index="${index}" aria-label="${meta.label} 스텝 교체">🔄</button>
      </div>
      <h3 class="step-name">${escapeHtml(spot.name)}</h3>
      <p class="step-location">📍 ${escapeHtml(spot.location)}</p>
      ${spot.summary ? `<p class="step-summary">${escapeHtml(spot.summary)}</p>` : ''}
      ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
    </article>
  `;
}

function bindResultEvents(area: HTMLElement): void {
  area.querySelectorAll<HTMLButtonElement>('.btn-swap').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sheetStepIndex = Number(btn.dataset.stepIndex);
      renderSheet();
    });
  });
  area.querySelector('#btn-copy')?.addEventListener('click', () => {
    if (!state.course || !state.courseConditions) return;
    const text = formatCourseText(
      state.course,
      spotById,
      state.courseConditions.region,
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
        region: state.courseConditions.region,
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

// --- 교체 바텀시트 -----------------------------------------------------------

function renderSheet(): void {
  const root = document.getElementById('sheet-root')!;
  if (state.sheetStepIndex === null || !state.course || !state.courseConditions) {
    root.innerHTML = '';
    return;
  }
  const step = state.course[state.sheetStepIndex];
  const meta = SLOT_META[step.slot];
  const cond = state.courseConditions;
  const candidates = getCandidates(spots, step.slot, cond.region, cond.mood, courseSpotIds());

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-label="${meta.label} 후보 선택">
      <div class="sheet-head">
        <span class="sheet-title">${meta.emoji} ${meta.label} 후보 <span class="sheet-count">${candidates.length}곳</span></span>
        <button class="sheet-close" id="sheet-close" aria-label="닫기">✕</button>
      </div>
      <div class="sheet-body">
        ${
          candidates.length === 0
            ? `<div class="sheet-empty">이 조건의 후보를 다 보셨어요</div>`
            : candidates
                .map(
                  (c) => `
            <button class="sheet-item" data-spot-id="${c.id}">
              <span class="sheet-item-name">${escapeHtml(c.name)}</span>
              <span class="sheet-item-location">📍 ${escapeHtml(c.location)}</span>
              ${c.summary ? `<span class="sheet-item-summary">${escapeHtml(c.summary)}</span>` : ''}
            </button>`,
                )
                .join('')
        }
      </div>
    </div>
  `;

  const close = () => {
    state.sheetStepIndex = null;
    renderSheet();
  };
  root.querySelector('#sheet-backdrop')!.addEventListener('click', close);
  root.querySelector('#sheet-close')!.addEventListener('click', close);
  root.querySelectorAll<HTMLButtonElement>('.sheet-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spotId = Number(btn.dataset.spotId);
      if (state.course && state.sheetStepIndex !== null) {
        state.course[state.sheetStepIndex] = { slot: step.slot, spotId };
      }
      state.sheetStepIndex = null;
      renderResults();
      renderSheet();
    });
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
                  <span class="saved-item-meta">${dateStr} · ${escapeHtml(regionLabel(item.conditions.region))} · ${escapeHtml(moodLabel(item.conditions.mood))}</span>
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

  state.region = item.conditions.region;
  state.mood = item.conditions.mood;
  for (const k of SLOT_ORDER) {
    state.slots[k] = item.conditions.slots.includes(k);
  }
  state.course = steps;
  state.courseConditions = { region: item.conditions.region, mood: item.conditions.mood };
  state.sheetStepIndex = null;

  renderConditions();
  renderResults();
  renderSheet();
}

// ---------------------------------------------------------------------------
// 시작
// ---------------------------------------------------------------------------

renderShell();
