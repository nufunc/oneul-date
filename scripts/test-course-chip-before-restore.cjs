// 받기 전 지역 칩과 마지막 코스 복원 시험(P-514): node scripts/test-course-chip-before-restore.cjs
// 「다시 받기」(새로 고침) 직후 데이터가 오기 전에 누른 지역 칩을 이 탭 마지막 코스의 지역이 덮지 않는지 본다.
// applyDailyCourseIfEmpty를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function applyDailyCourseIfEmpty(');
assert.ok(start > 0, 'applyDailyCourseIfEmpty가 없다');
const code = ts.transpile(src.slice(start, src.indexOf('\n}\n', start) + 3), { target: 'es2022' });

function run({ regions, subZones = [], entryRegion = null }) {
  const last = { ids: [1, 2], conditions: { regions: ['YEONGNAM'], subZones: [], mood: 'ALL', searchQuery: '', indoorOnly: false } };
  const store = { oneul_last_course: JSON.stringify(last) };
  const state = { course: null, regions: [...regions], subZones: [...subZones], searchQuery: '', slots: {} };
  const env = {
    state,
    location: { hash: '' },
    spots: [{ id: 1 }, { id: 2 }],
    sessionStorage: { getItem: (k) => store[k] ?? null, removeItem: (k) => { delete store[k]; } },
    LAST_COURSE_STORAGE_KEY: 'oneul_last_course',
    buildSharedSteps: (ids) => ids.map((id) => ({ spotId: id, slot: 'day' })),
    loadedRegionKeys: new Set(['ALL']),
    entryArea: { region: entryRegion, slot: null },
    ensureSpotsForRegions: () => Promise.resolve(),
    knownBudgetFilter: () => null,
    knownMoodPreset: () => null,
    renderConditions: () => {},
    renderResults: () => {},
    regionsLoaded: () => true,
    dailyPick: () => ({ pickedRegion: 'YEONGNAM' }),
    buildDailyRecommendedCourse: () => ({ steps: [{ spotId: 3, slot: 'day' }], regionKey: 'YEONGNAM', moodKey: 'ALL' }),
  };
  new Function(...Object.keys(env), `let prevCourse; ${code}; applyDailyCourseIfEmpty();`)(...Object.values(env));
  return { state, stored: 'oneul_last_course' in store };
}

// 아무것도 고르지 않았으면 마지막 코스를 그 조건과 함께 되살린다
{
  const { state } = run({ regions: [] });
  assert.deepStrictEqual(state.regions, ['YEONGNAM'], '고르지 않은 상태에서 마지막 코스 지역을 되살리지 않는다');
  assert.deepStrictEqual(state.course.map((s) => s.spotId), [1, 2]);
}
// 데이터가 오기 전에 서울 칩을 눌렀으면 그 선택이 남고, 마지막 코스는 지우지 않는다
{
  const { state, stored } = run({ regions: ['SEOUL'] });
  assert.deepStrictEqual(state.regions, ['SEOUL'], '받기 전에 누른 서울 칩이 마지막 코스 지역으로 덮였다');
  assert.ok(stored, '건너뛴 마지막 코스를 지웠다');
}
// 전국 칩도 같다: 랜딩 지역으로 들어와 전국을 고르면 랜딩 지역으로 돌아가지 않는다
{
  const { state } = run({ regions: [], entryRegion: 'YEONGNAM' });
  assert.deepStrictEqual(state.regions, [], '받기 전에 고른 전국이 마지막 코스 지역으로 덮였다');
}
// 랜딩 지역 그대로면 되살린다
{
  const { state } = run({ regions: ['YEONGNAM'], entryRegion: 'YEONGNAM' });
  assert.deepStrictEqual(state.course.map((s) => s.spotId), [1, 2], '랜딩 지역 그대로인데 마지막 코스를 되살리지 않는다');
}

console.log('test-course-chip-before-restore: 통과');
