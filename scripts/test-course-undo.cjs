// ↩ 이전 한 단계 되돌리기 시험(P-363): node scripts/test-course-undo.cjs
// 보관과 복원 함수를 src/main.ts에서 떼어 TypeScript로 변환해 실행하고,
// 코스를 통째로 바꾸는 모든 대입이 보관분을 비우는지 소스를 훑어 확인한다
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

for (const name of ['prevCourse', 'snapshotPrevCourse', 'undoCourse', 'bindUndoButton', 'regenerateCourse', 'UNDO_COURSE_BTN_HTML']) {
  assert.ok(decls.has(name), `${name}이 없다`);
}

// 보관·복원·다시 추천을 한 범위에 넣고 나머지 의존은 가짜로 둔다. 코스 대입이 일어나는 generateCourse 가짜는 새 id를 돌려준다
const STUBS = ['state', 'announce', 'renderResults', 'announceCourse', 'markResultsEngaged', 'spotById', 'buildAnchorCourse', 'addRecentSpotIds', 'courseSpotIds', 'generateCourse', 'spots', 'recentSpotIdSet', 'notifyRelaxedSlots', 'zoneRelaxedSlots', 'announceZoneRelaxed'];
const body = ['prevCourse', 'snapshotPrevCourse', 'undoCourse', 'bindUndoButton', 'UNDO_COURSE_BTN_HTML', 'regenerateCourse'].map((n) => toJs(decls.get(n))).join('\n');
const make = new Function(...STUBS, `${body}\nreturn { snapshotPrevCourse, undoCourse, regenerateCourse, bindUndoButton, get prev() { return prevCourse; }, clear() { prevCourse = null; } };`);

const setup = () => {
  const log = { announce: [], render: 0, listeners: [] };
  const state = {
    course: [{ slot: 'lunch', spotId: 1 }, { slot: 'cafe', spotId: 2 }, { slot: 'dinner', spotId: 3 }],
    courseConditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL', fromSaved: true },
    moodPreset: null,
  };
  const api = make(
    state,
    (t) => log.announce.push(t),
    () => { log.render += 1; },
    () => {},
    () => {},
    new Map(),
    () => [],
    () => {},
    () => [],
    () => [{ slot: 'lunch', spotId: 11 }, { slot: 'cafe', spotId: 12 }, { slot: 'dinner', spotId: 13 }],
    [],
    () => new Set(),
    () => {},
    () => [],
    () => {},
  );
  return { api, state, log };
};
const ids = (course) => course.map((s) => s.spotId);

// 1) 칸 교체: swapStep은 state.course[index]를 제자리에서 바꾼다. 보관분은 복사본이라 영향받지 않고 복원은 교체 전 id와 같다
{
  const { api, state, log } = setup();
  const before = ids(state.course);
  const condBefore = state.courseConditions;
  api.snapshotPrevCourse();
  state.course[1] = { slot: 'cafe', spotId: 99 };
  assert.deepStrictEqual(ids(state.course), [1, 99, 3]);
  assert.deepStrictEqual(ids(api.prev.course), before, '보관분이 제자리 교체에 딸려 바뀜');
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), before, '교체 뒤 되돌리기가 id를 복원하지 못함');
  assert.strictEqual(state.courseConditions, condBefore);
  assert.strictEqual(api.prev, null, '되돌린 뒤에는 보관분이 비어야 한다');
  assert.strictEqual(log.render, 1);
  assert.deepStrictEqual(log.announce, ['이전 코스로 되돌렸어요.']);
}

// 2) 다시 추천: 코스와 함께 fromSaved 같은 코스 조건도 되돌아와야 한다
{
  const { api, state } = setup();
  const before = ids(state.course);
  const condBefore = state.courseConditions;
  api.regenerateCourse();
  assert.deepStrictEqual(ids(state.course), [11, 12, 13]);
  assert.strictEqual(state.courseConditions.fromSaved, false, '다시 추천이 fromSaved를 끄지 않음(전제 변경)');
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), before);
  assert.strictEqual(state.courseConditions, condBefore);
  assert.strictEqual(state.courseConditions.fromSaved, true, '조건 스냅숏이 함께 복원되지 않음');
}

// 3) 연달아 바꾸면 가장 최근 직전 코스 한 단계만 남는다
{
  const { api, state } = setup();
  api.regenerateCourse();
  api.snapshotPrevCourse();
  state.course[0] = { slot: 'lunch', spotId: 77 };
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [11, 12, 13]);
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [11, 12, 13], '보관분이 없을 때 되돌리기가 코스를 바꿈');
}

// 4) 소스 훑기: state.course를 통째로 대입하는 자리는 보관 세 동작이 아니면 같은 함수 앞쪽에서 prevCourse를 비워야 한다
const SNAPSHOTTING = new Set(['regenerateCourse', 'optimizeCourseRoute', 'undoCourse']);
const fnOf = (node) => {
  for (let n = node.parent; n; n = n.parent) if (ts.isFunctionLike(n)) return n;
  return null;
};
const fnName = (fn) => (fn && fn.name ? fn.name.text : null);
const assigns = [];
const clears = [];
const walk = (n) => {
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const l = n.left.getText();
    if (l === 'state.course') assigns.push(n);
    if (l === 'prevCourse') clears.push(n);
  }
  ts.forEachChild(n, walk);
};
walk(sf);
assert.ok(assigns.length >= 10, `state.course 대입 ${assigns.length}곳: 훑기가 너무 적게 찾음`);
let guarded = 0;
for (const a of assigns) {
  const fn = fnOf(a);
  if (SNAPSHOTTING.has(fnName(fn))) continue;
  const hit = clears.some((c) => c.right.getText() === 'null' && fnOf(c) === fn && c.getStart() < a.getStart());
  const line = sf.getLineAndCharacterOfPosition(a.getStart()).line + 1;
  assert.ok(hit, `main.ts ${line}행: 코스를 통째로 대입하는데 prevCourse를 비우지 않음(저장한 코스를 연 뒤 엉뚱한 코스로 돌아간다)`);
  guarded += 1;
}
assert.ok(guarded >= 7, `비우는 자리 ${guarded}곳: 저장 열기, 받은 코스, 앵커, 🚀가 모두 들어 있어야 한다`);

// 5) 보관은 세 동작에서 코스를 바꾸기 전에 일어난다
for (const [name, marker] of [['swapStep', 'state.course[index] ='], ['regenerateCourse', 'state.course = '], ['optimizeCourseRoute', 'state.course = [']]) {
  const text = decls.get(name).getText();
  const snap = text.indexOf('snapshotPrevCourse()');
  const change = text.indexOf(marker);
  assert.ok(snap >= 0 && change >= 0 && snap < change, `${name}: 코스를 바꾸기 전에 snapshotPrevCourse()가 없다`);
}

// 6) 머리 줄은 보관분이 있을 때만 버튼을 그린다
assert.ok(/\$\{prevCourse \? UNDO_COURSE_BTN_HTML : ''\}/.test(src), '머리 줄 버튼이 보관분 조건부가 아님');
assert.ok(/id="btn-undo-course"/.test(src) && /↩ 이전/.test(src));

// 이름이 보이는 글자로 시작하고 화살표는 낭독에서 숨긴다(P-397, WCAG 2.5.3)
assert.ok(src.includes('aria-label="이전 코스로 되돌리기"><span aria-hidden="true">↩</span> 이전</button>'), '되돌리기 단추 이름이 보이는 글자 「이전」으로 시작하지 않음');

console.log('test-course-undo: 통과');
