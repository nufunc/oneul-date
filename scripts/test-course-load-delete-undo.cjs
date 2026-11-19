// 불러온 저장 코스를 지운 뒤 다른 저장 코스를 열어도 ↩ 이전이 미저장 코스를 되찾는지 시험(P-480): node scripts/test-course-load-delete-undo.cjs
// restoreCourse와 보관·복원 함수를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다
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

const names = ['SLOT_ORDER', 'normalizeRegionCond', 'courseSpotIds', 'prevCourse', 'snapshotPrevCourse', 'undoCourse', 'MOOD_PRESETS', 'knownMoodPreset', 'knownBudgetFilter', 'loadedCourse', 'restoreCourse'];
const body = names.map((n) => { assert.ok(decls.has(n), `${n}이 없다`); return toJs(decls.get(n)); }).join('\n');
const RS = ['state', 'isCourseSaved', 'updateModeView', 'renderConditions', 'renderResults', 'document', 'cancelOverlayFocusReturn', 'markResultsEngaged', 'announce', 'scrollMotion'];
const make = new Function(...RS, `${body}\nreturn { restoreCourse, undoCourse, snapshotPrevCourse, get prev() { return prevCourse; } };`);

const ids = (course) => course.map((s) => s.spotId);
const mk = (a, b) => [{ slot: 'day', spotId: a }, { slot: 'evening', spotId: b }];
const key = (arr) => [...arr].sort((a, b) => a - b).join(',');
const noop = () => {};
const doc = { getElementById: () => null, querySelector: () => null };
const S = { conditions: { region: ['GYEONGNAM'], subZones: [], mood: 'ALL', slots: ['day', 'evening'], categoryKey: 'CAFE' } };
const T = { conditions: { region: ['JEJU'], subZones: [], mood: 'ALL', slots: ['day', 'evening'], categoryKey: 'DINING' } };

const setup = () => {
  const state = {
    mainMode: 'course', regions: ['SEOUL'], subZones: [], slots: { day: true, evening: true, night: false, stay: false },
    course: mk(1, 2), courseConditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL' },
    courseCategory: 'ALL', indoorOnly: false, budgetFilter: 'ALL', moodPreset: null, searchQuery: '', mood: 'ALL',
  };
  const saved = new Set([key([9, 10]), key([20, 21])]); // S와 T만 저장돼 있다
  const api = make(state, (a) => saved.has(key(a)), noop, noop, noop, doc, noop, noop, noop, () => 'auto');
  return { api, state, saved };
};

// 시나리오 C: U → S 불러오기 → S 삭제 → T 불러오기 → ↩ 이전이면 U와 서울 칩이 돌아온다
{
  const { api, state, saved } = setup();
  api.restoreCourse(S, mk(9, 10));
  saved.delete(key([9, 10])); // 보던 S를 지운다
  api.restoreCourse(T, mk(20, 21));
  assert.deepStrictEqual(ids(state.course), [20, 21]);
  assert.ok(api.prev && api.prev.chips, 'S를 지운 뒤 T를 열자 U의 보관분이 사라졌다');
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [1, 2], '↩ 이전이 U가 아니다(지운 S가 남았다)');
  assert.deepStrictEqual(state.regions, ['SEOUL'], '↩ 이전 뒤 지역 칩이 U의 서울이 아니다');
  assert.strictEqual(state.courseCategory, 'ALL', '↩ 이전 뒤 테마 칩이 U의 값이 아니다');
  assert.strictEqual(api.prev, null);
}

// 불러온 S를 지운 뒤 🔄·다시 추천·⚡처럼 칩 없는 보관분으로 바뀌면 동일성이 끊겨 지금 규칙대로 미저장 코스를 새로 보관한다
{
  const { api, state, saved } = setup();
  api.restoreCourse(S, mk(9, 10));
  saved.delete(key([9, 10]));
  api.snapshotPrevCourse(); // 🔄 칸 교체: 보관 뒤 제자리에서 바꾼다
  state.course[1] = { slot: 'evening', spotId: 11 };
  api.restoreCourse(T, mk(20, 21));
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [9, 11], '코스가 바뀐 뒤에는 바뀐 미저장 코스를 보관해야 한다');
}

// 다시 추천처럼 코스 객체가 통째로 바뀐 경우도 지금 규칙이다
{
  const { api, state, saved } = setup();
  api.restoreCourse(S, mk(9, 10));
  saved.delete(key([9, 10]));
  api.snapshotPrevCourse();
  state.course = mk(30, 31);
  api.restoreCourse(T, mk(20, 21));
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [30, 31]);
}

// 시나리오 A 불변: U → S 불러오기 → S 삭제 → ↩ 이전이면 U가 돌아온다
{
  const { api, state, saved } = setup();
  api.restoreCourse(S, mk(9, 10));
  saved.delete(key([9, 10]));
  api.undoCourse();
  assert.deepStrictEqual(ids(state.course), [1, 2]);
}

console.log('test-course-load-delete-undo: ok');
