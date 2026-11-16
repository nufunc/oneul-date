// 저장소에서 읽은 moodPreset·budgetFilter를 아는 값만 받는지 시험(P-481): node scripts/test-course-stored-mood.cjs
// 저장 코스 불러오기(restoreCourse)와 새로 고침 복원(applyDailyCourseIfEmpty)을 src/main.ts에서 떼어 실행한다
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
const js = (names) => names.map((n) => { assert.ok(decls.has(n), `${n}이 없다`); return toJs(decls.get(n)); }).join('\n');
const noop = () => {};
const doc = { getElementById: () => null, querySelector: () => null };

// 1) 저장 코스 불러오기
const RS = ['state', 'isCourseSaved', 'updateModeView', 'renderConditions', 'renderResults', 'document', 'cancelOverlayFocusReturn', 'markResultsEngaged', 'announce', 'scrollMotion'];
const makeRestore = new Function(...RS, `${js(['SLOT_ORDER', 'normalizeRegionCond', 'courseSpotIds', 'prevCourse', 'snapshotPrevCourse', 'courseCandidates', 'candidateIndex', 'candidatePrev', 'inCandidateMode', 'MOOD_PRESETS', 'knownMoodPreset', 'knownBudgetFilter', 'loadedCourse', 'restoreCourse'])}\nreturn restoreCourse;`);
const restore = (cond) => {
  const state = { mainMode: 'course', regions: [], subZones: [], slots: {}, course: null, courseConditions: null, courseCategory: 'ALL', indoorOnly: false, budgetFilter: 'LUXURY', moodPreset: 'BLIND_DATE', searchQuery: '' };
  const item = JSON.parse(JSON.stringify({ conditions: { region: ['GYEONGNAM'], subZones: [], mood: 'ALL', slots: ['day'], ...cond } }));
  makeRestore(state, () => false, noop, noop, noop, doc, noop, noop, noop, () => 'auto')(item, [{ slot: 'day', spotId: 5 }]);
  return state;
};
{
  const state = restore({ moodPreset: 'unknown-x', budgetFilter: 'unknown-y' });
  assert.strictEqual(state.moodPreset, null, '모르는 분위기 키가 칩 상태로 들어갔다');
  assert.strictEqual(state.budgetFilter, 'ALL', '모르는 예산 값이 칩 상태로 들어갔다');
  assert.strictEqual(state.courseConditions.moodPreset ?? null, null, '모르는 분위기 키가 코스 조건(저장·새로 고침 복원 원천)에 남았다');
  assert.strictEqual(state.courseConditions.budgetFilter ?? 'ALL', 'ALL');
}
for (const m of ['BLIND_DATE', 'ANNIVERSARY', 'NIGHT_LIFE']) {
  const state = restore({ moodPreset: m, budgetFilter: 'BUDGET' });
  assert.strictEqual(state.moodPreset, m, `아는 분위기 키 ${m}를 버렸다`);
  assert.strictEqual(state.courseConditions.moodPreset, m);
  assert.strictEqual(state.budgetFilter, 'BUDGET');
  assert.strictEqual(state.courseConditions.budgetFilter, 'BUDGET');
}
{
  const state = restore({}); // 과거 저장분: 필드 없음
  assert.strictEqual(state.moodPreset, null);
  assert.strictEqual(state.budgetFilter, 'ALL');
}

// 2) 새로 고침 복원(sessionStorage)
const AS = ['state', 'location', 'spots', 'sessionStorage', 'LAST_COURSE_STORAGE_KEY', 'loadedRegionKeys', 'buildSharedSteps', 'renderConditions', 'renderResults'];
const makeApply = new Function(...AS, `let prevCourse = null;\n${js(['MOOD_PRESETS', 'knownMoodPreset', 'knownBudgetFilter', 'applyDailyCourseIfEmpty'])}\nreturn applyDailyCourseIfEmpty;`);
const refresh = (cond) => {
  const state = { course: null, courseConditions: null, regions: [], subZones: [], slots: {}, budgetFilter: 'ALL', moodPreset: null, searchQuery: '' };
  const last = { ids: [5], conditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL', ...cond } };
  const ss = { getItem: () => JSON.stringify(last), removeItem: noop };
  makeApply(state, { hash: '' }, [{}], ss, 'k', new Set(['ALL']), (idsArr) => idsArr.map((id) => ({ slot: 'day', spotId: id })), noop, noop)();
  assert.deepStrictEqual(state.course, [{ slot: 'day', spotId: 5 }], '새로 고침 복원 경로를 타지 않았다');
  return state;
};
{
  const state = refresh({ moodPreset: 'unknown-x', budgetFilter: 'unknown-y' });
  assert.strictEqual(state.moodPreset, null, '새로 고침 복원이 모르는 분위기 키를 받았다');
  assert.strictEqual(state.budgetFilter, 'ALL');
  assert.strictEqual(state.courseConditions.moodPreset ?? null, null, '새로 고침 복원 코스 조건에 모르는 키가 남아 다시 전파된다');
  assert.strictEqual(state.courseConditions.budgetFilter ?? 'ALL', 'ALL');
}
{
  const state = refresh({ moodPreset: 'ANNIVERSARY', budgetFilter: 'LUXURY' });
  assert.strictEqual(state.moodPreset, 'ANNIVERSARY');
  assert.strictEqual(state.budgetFilter, 'LUXURY');
  assert.strictEqual(state.courseConditions.moodPreset, 'ANNIVERSARY');
}

console.log('test-course-stored-mood: ok');
