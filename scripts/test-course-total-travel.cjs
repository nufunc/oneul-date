// 코스 머리 총 이동 줄 시험(P-534): node scripts/test-course-total-travel.cjs
// courseTravelSummary와 거리·이동 표기 함수를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다.
// 구간 띠와 같은 도보·차량 판정으로 더하는지, 좌표 없는 장소나 장소 하나뿐인 코스에서 줄이 빠지는지,
// 결과 화면·칸 교체·복사 글·받은 코스가 같은 함수를 부르는지 본다
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
const NAMES = [
  'WALK_MAX_KM', 'describeTransit', 'formatTransitMinutes', 'getDistanceKm', 'getDistanceBetweenSpots',
  'calculateCourseTotalDistance', 'courseTravelSummary', 'courseTravelLineHtml', 'escapeHtml',
];
for (const n of NAMES) assert.ok(decls.has(n), `${n}이 없다`);
const body = NAMES.map((n) => ts.transpileModule(decls.get(n).getText(), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).join('\n');

let estimated = 0;
const make = (spots) => new Function('spotById', 'getSpotCoordinates', `${body}\nreturn { courseTravelSummary, courseTravelLineHtml, describeTransit, getDistanceKm };`)(
  new Map(spots.map((s) => [s.id, s])),
  () => { estimated += 1; return { lat: 37.5, lng: 127 }; },
);

// 경도를 고정하고 위도만 달리한다. 0.01도는 약 1.11km(도보), 0.03도는 약 3.34km(차량)
const SPOTS = [
  { id: 1, name: '카페', lat: 37.50, lng: 127 },
  { id: 2, name: '식당', lat: 37.51, lng: 127 },
  { id: 3, name: '바', lat: 37.54, lng: 127 },
  { id: 4, name: '좌표 없음', lat: null, lng: null, area: '성수' },
  { id: 5, name: '옆 카페', lat: 37.505, lng: 127 },
];
const api = make(SPOTS);
const course = (...ids) => ids.map((id, i) => ({ slot: ['day', 'evening', 'night', 'stay'][i] || 'day', spotId: id }));

// 1) 도보 구간과 차량 구간이 섞이면 두 시간을 +로 잇고, 거리는 구간 띠 거리의 합이다
{
  const leg1 = api.describeTransit(api.getDistanceKm(37.50, 127, 37.51, 127));
  const leg2 = api.describeTransit(api.getDistanceKm(37.51, 127, 37.54, 127));
  assert.strictEqual(leg1.mode, 'walk');
  assert.strictEqual(leg2.mode, 'transit');
  const total = api.describeTransit(api.getDistanceKm(37.50, 127, 37.51, 127) + api.getDistanceKm(37.51, 127, 37.54, 127)).distanceText;
  const line = api.courseTravelSummary(course(1, 2, 3));
  assert.strictEqual(line, `총 ${total} · 도보 약 ${leg1.minutes}분 + 차량 약 ${leg2.minutes}분`);
  assert.strictEqual(line, '총 4.4km · 도보 약 17분 + 차량 약 11분');
}

// 2) 도보만이면 차량을 적지 않고, 1km 미만 합계는 m로 적는다
assert.strictEqual(api.courseTravelSummary(course(1, 5)), '총 556m · 도보 약 8분');
// 3) 차량만이면 도보를 적지 않는다
assert.strictEqual(api.courseTravelSummary(course(2, 3)), '총 3.3km · 차량 약 11분');

// 4) 좌표 없는 장소가 하나라도 있으면 추정 좌표 합계를 내지 않고 줄을 뺀다
estimated = 0;
assert.strictEqual(api.courseTravelSummary(course(1, 4, 3)), '');
assert.strictEqual(api.courseTravelLineHtml(course(1, 4, 3)), '');
assert.strictEqual(estimated, 0, '좌표 없는 코스에서 추정 좌표를 불렀다');

// 5) 장소가 하나뿐이거나 빈 칸만 남으면 줄이 없다. 빈 칸은 건너뛰고 남은 장소끼리 잇는다(복사 글 이동 줄과 같다)
assert.strictEqual(api.courseTravelSummary(course(1)), '');
assert.strictEqual(api.courseTravelSummary([{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: null }]), '');
assert.strictEqual(
  api.courseTravelSummary([{ slot: 'day', spotId: 2 }, { slot: 'evening', spotId: null }, { slot: 'night', spotId: 3 }]),
  '총 3.3km · 차량 약 11분',
);

// 6) 화면 줄은 보조 문구 단락 하나다
assert.strictEqual(api.courseTravelLineHtml(course(1, 5)), '<p class="course-travel">총 556m · 도보 약 8분</p>');

// 7) 합친 시간이 60분을 넘으면 구간 띠와 같은 시간 표기
const FAR = [{ id: 1, name: 'A', lat: 37.0, lng: 127 }, { id: 2, name: 'B', lat: 37.5, lng: 127 }, { id: 3, name: 'C', lat: 38.0, lng: 127 }];
assert.strictEqual(make(FAR).courseTravelSummary(course(1, 2, 3)), '총 111km · 차량 약 3시간 22분');

// 8) 모든 갱신 경로가 같은 함수를 부르는지 소스에서 본다
const fnText = (name) => decls.get(name).getText();
assert.ok(fnText('renderResultsContent').includes('${courseTravelLineHtml(state.course)}'), '결과 화면 머리가 총 이동 줄을 그리지 않는다');
assert.ok(/class="course-head-main">\s*<span class="course-title">[^\n]*\n\s*\$\{courseTravelLineHtml/.test(fnText('renderResultsContent')), '총 이동 줄이 제목 바로 아래가 아니다');
assert.ok(fnText('refreshTransitDividers').includes('courseTravelLineHtml(course)'), '칸 교체 뒤 총 이동 줄을 다시 쓰지 않는다');
assert.ok(fnText('swapStep').includes('refreshTransitDividers()'), '칸 교체가 refreshTransitDividers를 부르지 않는다');
assert.ok(fnText('formatCourseTextAsync').includes('courseTravelSummary(steps)'), '복사 글 머리가 총 이동 줄을 쓰지 않는다');
assert.ok(fnText('renderReceiverView').includes('courseTravelSummary(steps)'), '받은 코스 머리가 총 이동 줄을 쓰지 않는다');
// 최적 동선과 되돌리기는 결과 영역을 통째로 다시 그린다
assert.ok(fnText('renderResults').includes('renderResultsContent()'), 'renderResults가 renderResultsContent를 부르지 않는다');
assert.ok(fnText('optimizeCourseRoute').includes('renderResults()'), '최적 동선이 다시 그리지 않는다');

console.log('test-course-total-travel: 통과');
