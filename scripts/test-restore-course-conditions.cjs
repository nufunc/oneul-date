// 마지막 코스 복원이 입력 상태를 맞추는지 보는 회귀 시험: node scripts/test-restore-course-conditions.cjs
// applyDailyCourseIfEmpty의 복원 분기를 src/main.ts에서 떼어 실행해, 복원 뒤 state의 칩 값이 코스 조건과 같은지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.search(/^function applyDailyCourseIfEmpty\(/m);
assert.ok(start >= 0, 'applyDailyCourseIfEmpty 없음');
const code = ts.transpile(src.slice(start, src.indexOf('\n}\n', start) + 3), { target: 'es2022' });

function run(conditions, ids, slotsOf) {
  const state = {
    course: null, courseConditions: null, searchQuery: '', subZones: [], regions: [], mood: 'ALL', courseCategory: 'ALL',
    indoorOnly: false, budgetFilter: 'ALL', slots: { day: true, evening: true, night: true, stay: false },
  };
  const store = { k: JSON.stringify({ ids, conditions }) };
  const steps = ids.map((id, i) => ({ slot: slotsOf[i], spotId: id }));
  const env = {
    state, spots: [1], location: { hash: '' }, sessionStorage: { getItem: (k) => store[k], removeItem() {} },
    LAST_COURSE_STORAGE_KEY: 'k', loadedRegionKeys: new Set(['ALL']), buildSharedSteps: () => steps,
    renderConditions() {}, renderResults() {}, buildDailyRecommendedCourse: () => null,
  };
  const names = Object.keys(env);
  new Function(...names, `${code};applyDailyCourseIfEmpty();`)(...names.map((n) => env[n]));
  return state;
}

// 서울 감성카페 저녁·밤: 칩이 코스 조건과 같아야 🚀가 같은 지역으로 짠다
let s = run({ regions: ['SEOUL'], subZones: [], mood: 'ALL', categoryKey: 'CAFE' }, [1, 2], ['evening', 'night']);
assert.deepStrictEqual(s.regions, ['SEOUL']);
assert.strictEqual(s.courseCategory, 'CAFE');
assert.deepStrictEqual(s.slots, { day: false, evening: true, night: true, stay: false });
// 실내, 가성비, 검색어, 세부 동네
s = run({ regions: ['SEOUL'], subZones: ['SEONGSU'], mood: 'ALL', searchQuery: '성수 카페', indoorOnly: true, budgetFilter: 'BUDGET' }, [1], ['day']);
assert.deepStrictEqual([s.indoorOnly, s.budgetFilter, s.searchQuery, s.subZones], [true, 'BUDGET', '성수 카페', ['SEONGSU']]);
// 검색어에서 얻은 동네는 상태에 넣지 않는다
s = run({ regions: [], subZones: ['SEONGSU'], mood: 'ALL', searchQuery: '성수', zoneFromQuery: true }, [1], ['day']);
assert.deepStrictEqual(s.subZones, []);
// 예전 저장분(필드 없음)은 처음 값으로 둔다
s = run({ regions: ['JEJU'], subZones: [], mood: 'ALL' }, [1], ['stay']);
assert.deepStrictEqual([s.courseCategory, s.budgetFilter, s.indoorOnly, s.searchQuery], ['ALL', 'ALL', false, '']);
assert.deepStrictEqual(s.slots, { day: false, evening: false, night: false, stay: true });
// 오늘의 코스의 숨은 분위기는 입력 상태로 옮기지 않는다: 이 탭에는 지울 입력이 없다
s = run({ regions: [], subZones: [], mood: 'active' }, [1], ['day']);
assert.strictEqual(s.mood, 'ALL');
console.log('ok 5');
