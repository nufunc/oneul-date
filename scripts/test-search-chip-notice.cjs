// 검색 경로 칩 완화 알림 시험(P-435): node scripts/test-search-chip-notice.cjs
// notifyRelaxedSlots를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다. 검색 토스트 뒤에 칩 완화 문구가 한 토스트로 붙는지,
// 칩 둘을 켠 칸은 켠 칩을 모두 적는지, P-431 존 완화 띠가 말하는 칸은 다시 적지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
}
const toJs = (n) => ts.transpileModule(decls.get(n).getText(), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const STUBS = ['state', 'spotById', 'showToast', 'SLOT_META', 'MOOD_PRESETS', 'isSpecialDiningSpot', 'isBudgetSpot', 'strictMoodPresetFilter'];
const make = new Function(...STUBS, `${toJs('notifyRelaxedSlots')}\nreturn notifyRelaxedSlots;`);

const SLOT_META = { day: { label: '낮' }, evening: { label: '저녁' }, night: { label: '밤' } };
const MOOD_PRESETS = [{ key: 'NIGHT_LIFE', label: '심야' }];
// 1: 스페셜·심야 모두 맞음, 2: 심야만 맞음, 3: 둘 다 아님
const spotById = new Map([1, 2, 3].map((id) => [id, { id }]));
const special = (s) => s.id === 1;
const night = (list) => list.filter((s) => s.id !== 3);
const run = (course, budget, preset, lead, zoneRelaxed) => {
  const toasts = [];
  const state = { course, courseConditions: { zoneRelaxed } };
  make(state, spotById, (m) => toasts.push(m), SLOT_META, MOOD_PRESETS, special, () => true, night)(budget, preset, lead);
  return toasts;
};
const course = [{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }, { slot: 'night', spotId: 1 }];

// 검색 토스트 뒤에 한 토스트로 붙는다
const lead = "'성수' 중심 맞춤 코스를 추천했어요";
assert.deepStrictEqual(run(course, 'LUXURY', null, lead), [`${lead}. 저녁 칸은 스페셜에 맞는 곳이 없어 조건을 풀어 골랐어요`]);
// 칩 둘을 켰으면 예산만 풀린 칸도 켠 칩을 모두 적는다
assert.deepStrictEqual(run(course, 'LUXURY', 'NIGHT_LIFE', lead), [`${lead}. 저녁 칸은 스페셜·심야에 함께 맞는 곳이 없어 조건을 풀어 골랐어요`]);
// 칩 밖 칸이 없거나 칩을 켜지 않았으면 검색 토스트만 낸다
assert.deepStrictEqual(run([{ slot: 'day', spotId: 1 }], 'LUXURY', 'NIGHT_LIFE', lead), [lead]);
assert.deepStrictEqual(run(course, 'ALL', null, lead), [lead]);
// 검색어가 없는 코스는 칩 문구만, 알릴 것이 없으면 토스트를 내지 않는다
assert.deepStrictEqual(run(course, 'LUXURY', null), ['저녁 칸은 스페셜에 맞는 곳이 없어 조건을 풀어 골랐어요']);
assert.deepStrictEqual(run(course, 'ALL', null), []);
// 존 완화 띠가 말하는 칸은 토스트에 다시 적지 않는다
assert.deepStrictEqual(run(course, 'LUXURY', null, lead, ['evening']), [lead]);
const c3 = [{ slot: 'day', spotId: 3 }, { slot: 'evening', spotId: 3 }];
assert.deepStrictEqual(run(c3, 'LUXURY', null, undefined, ['day']), ['저녁 칸은 스페셜에 맞는 곳이 없어 조건을 풀어 골랐어요']);

// 배선: 검색 경로의 토스트가 모두 notifyRelaxedSlots를 거친다
const trig = decls.get('triggerCourseGeneration').getText();
const searchBranch = trig.slice(trig.indexOf('if (state.searchQuery) {\n    //'), trig.lastIndexOf('} else {'));
assert.ok(searchBranch.length > 0, '검색 분기를 찾지 못했다');
assert.ok(!/showToast\(/.test(searchBranch), '검색 분기가 칩 문구 없이 showToast를 부른다');
assert.strictEqual((searchBranch.match(/notifyRelaxedSlots\(state\.budgetFilter, state\.moodPreset, /g) || []).length, 4, '검색 토스트 넷이 칩 문구를 붙이지 않는다');

console.log('test-search-chip-notice: 통과');
