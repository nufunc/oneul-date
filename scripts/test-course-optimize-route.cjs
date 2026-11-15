// ⚡ 최적 동선 시험(P-447, P-448): node scripts/test-course-optimize-route.cjs
// optimizeCourseRoute와 판정·거리·영업시간 함수를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다.
// 칸 이름이 자리에 고정되는지, 옮긴 장소가 새 칸 시각에 열려 있는지, 숙박 칸이 끝에 남는지, 빈 칸 코스에 단추가 없는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);

const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const toJs = (st) => ts.transpileModule(st.getText().replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const NAMES = [
  'routeOptimizableSteps', 'optimizeCourseRoute', 'calculateCourseTotalDistance', 'getDistanceBetweenSpots', 'getDistanceKm',
  'KOREAN_DAY_NAMES', 'SLOT_CLOCK_MIN', 'SLOT_CLOSE_MARGIN_MIN', 'slotClockOpenCache', 'isOpenAtSlotClock', 'HOURS_RANGE_RE', 'parseOpenAtClock',
];
for (const name of NAMES) assert.ok(decls.has(name), `${name}이 없다`);

// 단추 조건이 같은 판정을 쓰는지 소스에서 확인한다
assert.ok(/\$\{routeOptimizableSteps\(state\.course\) \? `\s*<button class="btn-optimize-route"/.test(src), '⚡ 단추 조건이 routeOptimizableSteps를 쓰지 않는다');

const STUBS = ['state', 'spotById', 'showToast', 'snapshotPrevCourse', 'renderResults', 'getSpotGenre', 'getSpotCoordinates'];
const body = ['courseCandidates', 'candidateIndex', 'inCandidateMode', 'replaceCourseKeepingCandidate', ...NAMES].map((n) => toJs(decls.get(n))).join('\n'); // 후보 유지(P-469)
const make = new Function(...STUBS, `${body}\nreturn { routeOptimizableSteps, optimizeCourseRoute };`);

// 경도를 고정하고 위도만 달리해 거리를 정한다. 0.01도는 약 1.1km
const SPOTS = [
  { id: 1, name: '낮 공원', lat: 37.52, lng: 127, business_hours: { 영업시간: '매일 10:00 ~ 23:00' } },
  { id: 2, name: '저녁 식당', lat: 37.5, lng: 127, business_hours: { 영업시간: '매일 17:00 ~ 23:30' } },
  { id: 3, name: '밤 라운지', lat: 37.51, lng: 127, business_hours: { 영업시간: '매일 10:00 ~ 24:00' } },
  { id: 4, name: '숙소', lat: 37.53, lng: 127, slot: 'stay' },
  { id: 5, name: '늦은 바', lat: 37.51, lng: 127, business_hours: { 영업시간: '매일 20:30 ~ 02:00' } },
];

const setup = (course) => {
  const log = { toast: [], render: 0, snapshot: 0 };
  const state = { course: course.map((s) => ({ ...s })) };
  const api = make(
    state,
    new Map(SPOTS.map((s) => [s.id, s])),
    (t) => log.toast.push(t),
    () => { log.snapshot += 1; },
    () => { log.render += 1; },
    (s) => s.genre || 'SIGHT',
    (s) => ({ lat: s.lat, lng: s.lng }),
  );
  return { api, state, log };
};
const BASE = [{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }, { slot: 'night', spotId: 3 }];
const byId = new Map(SPOTS.map((s) => [s.id, s]));

// 1) 3칸: 순서가 바뀌어도 칸 이름은 자리 기준 낮·저녁·밤 그대로이고, 옮긴 장소는 새 칸 시각에 열려 있다
{
  const { api, state, log } = setup(BASE);
  assert.strictEqual(api.optimizeCourseRoute(), true, log.toast.join(' | '));
  assert.deepStrictEqual(state.course.map((s) => s.slot), ['day', 'evening', 'night']);
  // 저녁 식당(낮에 닫힘)은 낮 자리로 가지 않고, 가장 짧은 열린 순열 1 → 3 → 2가 된다
  assert.deepStrictEqual(state.course.map((s) => s.spotId), [1, 3, 2]);
  assert.strictEqual(log.snapshot, 1);
  assert.strictEqual(log.render, 1);
}

// 2) 가장 짧은 순열이 새 칸 시각에 닫힌 장소를 옮기면 받지 않는다: 늦은 바는 저녁 19시에 닫혀 있다
{
  const { api, state } = setup([{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }, { slot: 'night', spotId: 5 }]);
  assert.strictEqual(api.optimizeCourseRoute(), false);
  assert.deepStrictEqual(state.course.map((s) => s.spotId), [1, 2, 5]);
}

// 3) 숙박 4칸: 결과 길이 4, 마지막 칸 stay, 숙박 id 그대로
{
  const { api, state } = setup([...BASE, { slot: 'stay', spotId: 4 }]);
  assert.ok(api.routeOptimizableSteps(state.course), '숙박 4칸 코스는 단추 판정이 참이어야 한다');
  assert.strictEqual(api.optimizeCourseRoute(), true);
  assert.strictEqual(state.course.length, 4);
  assert.strictEqual(state.course[3].slot, 'stay');
  assert.strictEqual(state.course[3].spotId, 4);
  assert.deepStrictEqual(state.course.map((s) => s.slot), ['day', 'evening', 'night', 'stay']);
}

// 4) 빈 칸이 섞인 코스와 숙박 아닌 칸이 3개가 아닌 코스는 단추 판정이 거짓이고 코스를 바꾸지 않는다
{
  const withEmpty = [{ slot: 'day', spotId: null }, { slot: 'evening', spotId: 2 }, { slot: 'night', spotId: 3 }, { slot: 'stay', spotId: 4 }];
  const { api, state, log } = setup(withEmpty);
  assert.strictEqual(api.routeOptimizableSteps(state.course), null);
  assert.strictEqual(api.optimizeCourseRoute(), false);
  assert.deepStrictEqual(state.course, withEmpty);
  assert.strictEqual(log.snapshot, 0);
  assert.strictEqual(api.routeOptimizableSteps([{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }, { slot: 'stay', spotId: 4 }]), null);
  assert.strictEqual(api.routeOptimizableSteps([{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 99 }, { slot: 'night', spotId: 3 }]), null);
}

console.log('test-course-optimize-route: 4건 통과');
