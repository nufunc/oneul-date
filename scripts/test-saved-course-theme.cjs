// 저장한 코스 테마 칩 시험(P-291): node scripts/test-saved-course-theme.cjs
// 저장 버튼의 SavedCourse 리터럴, restoreCourse, regenerateCourse, courseTitle을 src/main.ts에서 떼어 실행한다.
// 칩을 켜고 만든 코스를 저장하고 화면 칩을 바꾼 뒤 불러오면 제목과 다시 추천이 저장 때 칩을 따르는지,
// 칸이 없는 옛 저장 항목은 칩 없음으로 불러오는지 본다
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

// courseTitle과 그 함수가 부르는 선언을 모은다. spotById는 앵커와 찜 제목에서만 쓰므로 빈 Map으로 넣는다
assert.ok(decls.has('courseTitle'), 'courseTitle이 없다');
const need = new Set();
const queue = ['courseTitle'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text) && n.text !== 'spotById') queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const titleJs = [...new Set([...need].map((n) => decls.get(n)))].sort((a, b) => a.pos - b.pos).map(toJs).join('\n');
const courseTitle = new Function('spotById', `${titleJs}\nreturn courseTitle;`)(new Map());

assert.ok(decls.has('regenerateCourse'), 'regenerateCourse가 없다');
const STUBS = ['state', 'spotById', 'buildAnchorCourse', 'addRecentSpotIds', 'courseSpotIds', 'renderResults', 'generateCourse', 'spots', 'recentSpotIdSet', 'notifyRelaxedSlots', 'markResultsEngaged', 'announceCourse', 'zoneRelaxedSlots', 'announceZoneRelaxed'];
const makeRegenerate = new Function(...STUBS, `${['prevCourse', 'snapshotPrevCourse', 'regenerateCourse'].map((n) => toJs(decls.get(n))).join('\n')}\nreturn regenerateCourse;`);

// 저장 버튼(#btn-save)이 만드는 SavedCourse 리터럴을 떼어 같은 state로 평가한다
const saveBlock = src.slice(src.indexOf("'#btn-save')"));
const lit = saveBlock.match(/const item: SavedCourse = (\{[\s\S]*?\n    \});/);
assert.ok(lit, '저장 버튼의 SavedCourse 리터럴이 없다');
const litJs = ts.transpileModule(`return (${lit[1]});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const makeItem = new Function('state', 'ids', 'courseTitle', litJs);

const restoreJs = ['SLOT_ORDER', 'normalizeRegionCond', 'prevCourse', 'restoreCourse'].map((n) => toJs(decls.get(n))).join('\n');
const RSTUBS = ['state', 'updateModeView', 'renderConditions', 'renderResults', 'document', 'cancelOverlayFocusReturn', 'markResultsEngaged'];
const makeRestore = new Function(...RSTUBS, `${restoreJs}\nreturn restoreCourse;`);

const noop = () => {};
const fakeDoc = { getElementById: () => null, querySelector: () => null };
const steps = [{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }];

// 저장한 항목을 JSON으로 거쳐(localStorage와 같게) 불러오고, 제목과 다시 추천 테마를 돌려준다
const restoreThenRegenerate = (item, screenCategory) => {
  const state = { mainMode: 'course', regions: [], subZones: [], slots: {}, course: null, courseConditions: null, courseCategory: screenCategory, moodPreset: null };
  makeRestore(state, noop, noop, noop, fakeDoc, noop, noop)(JSON.parse(JSON.stringify(item)), steps.map((s) => ({ ...s })));
  const title = courseTitle(state.courseConditions, state.course);
  const calls = [];
  const generateCourse = (...args) => {
    calls.push(args);
    return state.course;
  };
  makeRegenerate(state, new Map(), noop, noop, () => [], noop, generateCourse, [], () => new Set(), noop, noop, noop, () => [], noop)();
  assert.strictEqual(calls.length, 1, 'generateCourse를 한 번 부르지 않았다');
  assert.strictEqual(state.courseCategory, screenCategory, '불러오기가 화면 칩을 바꿨다');
  return { title, categoryKey: calls[0][4].categoryKey };
};

// 서울 카페 칩으로 만든 코스를 저장 → 화면 칩을 와인으로 바꿈 → 불러오기
const saveState = {
  course: steps,
  courseConditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL', searchQuery: '', categoryKey: 'CAFE' },
};
const saved = makeItem(saveState, [1, 2], courseTitle);
assert.strictEqual(saved.conditions.categoryKey, 'CAFE', '저장 항목에 테마 칩이 없다');
const cafe = restoreThenRegenerate(saved, 'WINE');
assert.match(cafe.title, /카페/, `불러온 코스 제목이 저장 때 칩을 따르지 않는다: ${cafe.title}`);
assert.strictEqual(cafe.categoryKey, 'CAFE', '불러온 코스의 다시 추천이 저장 때 칩으로 짜지 않는다');

// 칸이 없는 옛 저장 항목: 오류 없이 칩 없음으로 불러온다
const old = { id: 'old', createdAt: '2026-10-01T00:00:00.000Z', conditions: { region: 'SEOUL', mood: 'ALL', slots: ['day', 'evening'] }, spotIds: [1, 2] };
const legacy = restoreThenRegenerate(old, 'WINE');
assert.strictEqual(legacy.title, '서울', `옛 저장 코스 제목: ${legacy.title}`);
assert.strictEqual(legacy.categoryKey, undefined, '옛 저장 코스의 다시 추천이 화면 칩으로 짠다');

console.log('test-saved-course-theme: 통과');
