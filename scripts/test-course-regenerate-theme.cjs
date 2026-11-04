// 다시 추천 테마 칩 시험(P-289): node scripts/test-course-regenerate-theme.cjs
// regenerateCourse와 courseTitle을 src/main.ts에서 떼어 TypeScript로 변환해 실행한다.
// 화면의 테마 칩을 바꾼 뒤 다시 추천해도 generateCourse에 넘기는 테마(앵커 칸 테마)와 제목이
// 지난 코스 스냅숏(courseConditions.categoryKey)의 칩을 따르는지 본다
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

// regenerateCourse는 부르는 함수를 모두 가짜로 넣고 generateCourse에 넘긴 인자를 기록한다
assert.ok(decls.has('regenerateCourse'), 'regenerateCourse가 없다');
const STUBS = ['state', 'spotById', 'buildAnchorCourse', 'addRecentSpotIds', 'courseSpotIds', 'renderResults', 'generateCourse', 'spots', 'recentSpotIdSet', 'notifyRelaxedSlots', 'markResultsEngaged'];
const makeRegenerate = new Function(...STUBS, `${toJs(decls.get('regenerateCourse'))}\nreturn regenerateCourse;`);

const run = (conditions, screenCategory) => {
  const calls = [];
  const state = {
    course: [{ slot: 'lunch', spotId: 1 }, { slot: 'cafe', spotId: 2 }],
    courseConditions: conditions,
    courseCategory: screenCategory,
    moodPreset: null,
  };
  const generateCourse = (...args) => {
    calls.push(args);
    return state.course;
  };
  const noop = () => {};
  makeRegenerate(state, new Map(), noop, noop, () => [], noop, generateCourse, [], () => new Set(), noop, noop)();
  assert.strictEqual(calls.length, 1, 'generateCourse를 한 번 부르지 않았다');
  return { opts: calls[0][4], title: courseTitle(state.courseConditions, state.course) };
};

const base = { regions: ['SEOUL'], subZones: [], mood: 'ALL', searchQuery: '' };

// 카페 칩으로 짠 코스에서 화면 칩을 와인으로 바꾸고 다시 추천: 테마와 제목 모두 카페
const cafe = run({ ...base, categoryKey: 'CAFE' }, 'WINE');
assert.strictEqual(cafe.opts.categoryKey, 'CAFE', '다시 추천이 화면 칩으로 짠다');
assert.match(cafe.title, /카페/, `제목이 지난 칩을 따르지 않는다: ${cafe.title}`);

// 칩을 끈 코스에서 화면 칩을 켜고 다시 추천: 테마 없이 짜고 제목에도 칩이 없다
const none = run({ ...base, categoryKey: 'ALL' }, 'NIGHT');
assert.strictEqual(none.opts.categoryKey, 'ALL', '칩을 끈 코스의 다시 추천이 화면 칩으로 짠다');
assert.strictEqual(none.title, '서울', '칩을 끈 코스 제목');

// 테마 칩이 없는 스냅숏(오늘 추천, 찜 코스, 저장 코스 불러오기)은 화면 칩과 무관하게 테마 없이 짠다
const daily = run({ ...base, mood: 'romantic' }, 'CAFE');
assert.strictEqual(daily.opts.categoryKey, undefined, '테마 없는 스냅숏이 화면 칩으로 짠다');
assert.ok(!daily.title.includes('카페'), '테마 없는 스냅숏 제목에 화면 칩이 붙는다');

// 상황 칩은 이번 범위에서 화면 값을 그대로 쓴다(P-289 승인 (나))
const src2 = decls.get('regenerateCourse').getText();
assert.match(src2, /moodPreset:\s*state\.moodPreset/, '상황 칩을 화면 값에서 읽지 않는다');

console.log('test-course-regenerate-theme: 통과');
