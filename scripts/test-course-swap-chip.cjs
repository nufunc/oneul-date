// 칸 교체 칩 시험(P-436): node scripts/test-course-swap-chip.cjs
// swapStep을 src/main.ts에서 떼어 TypeScript로 변환하고, 후보와 화면 동작은 가짜로 넣어 실행한다.
// 예산 칩을 코스 조건이 아니라 화면 칩에서 읽는지, 칩 맞는 후보가 모두 최근 노출 이력에 들어도
// 칩 밖 장소로 넘어가지 않고 소진 알림(P-431)을 내는지 본다
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
const toJs = (st) => ts.transpileModule(st.getText(), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
assert.ok(decls.has('swapStep'), 'swapStep이 없다');

// 실제 선언을 쓰는 것: 칩 거르기와 최근 노출 처리. 나머지 참조는 아래 가짜로 채운다
const REAL = ['filterByBudget', 'excludeRecent', 'isRecentExhausted', 'SWAP_EXHAUSTED_MSG'];
const refs = new Set();
const walk = (n) => {
  if (ts.isIdentifier(n) && decls.has(n.text) && n.text !== 'swapStep') refs.add(n.text);
  ts.forEachChild(n, walk);
};
walk(decls.get('swapStep'));
REAL.forEach((n) => walk(decls.get(n)));

const spot = (id, special) => ({ id, special, lat: null, lng: null });
const run = ({ pool, recentIds, courseBudget, screenBudget, swaps }) => {
  const recent = new Set(recentIds);
  const toasts = [];
  const state = {
    course: [{ slot: 'evening', spotId: 1 }],
    courseConditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL', searchQuery: '', budgetFilter: courseBudget },
    budgetFilter: screenBudget,
    moodPreset: null,
  };
  const byId = new Map(pool.map((s) => [s.id, s]));
  const fakes = {
    state,
    spots: pool,
    spotById: byId,
    document: { querySelectorAll: () => [], querySelector: () => null },
    getCandidates: (all, slot, r, m, exclude) => all.filter((s) => !exclude.includes(s.id)),
    filterByMoodPreset: (c) => c,
    isSpecialDiningSpot: (s) => s.special,
    isBudgetSpot: () => false,
    diversifyByGenre: (c) => c,
    pickNearRandom: (c) => c[0] ?? null,
    recentSpotIdSet: () => new Set(recent),
    addRecentSpotIds: (ids) => ids.forEach((i) => recent.add(i)),
    forgetRecentSpotIds: (ids) => ids.forEach((i) => recent.delete(i)),
    courseSpotIds: () => state.course.map((s) => s.spotId),
    showToast: (m) => toasts.push(m),
    SPOT_EXPLORE_CATEGORIES: [],
  };
  const names = [...refs].filter((n) => !REAL.includes(n)).concat(['document']);
  const args = names.map((n) => (n in fakes ? fakes[n] : () => {}));
  const swapStep = new Function(...names, `${REAL.map((n) => toJs(decls.get(n))).join('\n')}\n${toJs(decls.get('swapStep'))}\nreturn swapStep;`)(...args);
  const picked = [];
  for (let i = 0; i < swaps; i++) {
    swapStep(0);
    picked.push(state.course[0].spotId);
  }
  return { picked: picked.map((id) => byId.get(id)), toasts };
};

// 스페셜 후보 2곳(10, 11)과 아닌 곳 3곳(20~22). 1은 지금 칸 장소
const pool = [spot(1, false), spot(20, false), spot(10, true), spot(21, false), spot(11, true), spot(22, false)];

// 칩을 끈 채 만든 코스에서 스페셜을 켜고 교체: 코스 조건은 ALL이지만 스페셜만 나온다
const on = run({ pool, recentIds: [1], courseBudget: 'ALL', screenBudget: 'LUXURY', swaps: 2 });
assert.ok(on.picked.every((s) => s.special), `켠 스페셜 칩이 교체에 걸리지 않는다: ${on.picked.map((s) => s.id)}`);

// 스페셜 후보가 모두 이력에 들어도 이력 밖 스페셜 아닌 곳으로 넘어가지 않고 소진 알림을 낸다
const wrap = run({ pool, recentIds: [1, 10, 11], courseBudget: 'ALL', screenBudget: 'LUXURY', swaps: 1 });
assert.ok(wrap.picked[0].special, `이력이 스페셜을 덮자 칩 밖 장소가 나왔다: ${wrap.picked[0].id}`);
assert.strictEqual(wrap.toasts.length, 1, '스페셜 후보를 다 보인 교체에 소진 알림이 없다');

// 스페셜로 짠 코스에서 칩을 끄고 교체: 코스 조건은 LUXURY지만 스페셜을 강제하지 않는다
const off = run({ pool, recentIds: [1], courseBudget: 'LUXURY', screenBudget: 'ALL', swaps: 1 });
assert.ok(!off.picked[0].special, '끈 스페셜 칩이 교체에 계속 걸린다');

// 칩을 끈 채 교체: 소진 전까지 알림 없이 후보 순서대로 바꾼다
const plain = run({ pool, recentIds: [1], courseBudget: 'ALL', screenBudget: 'ALL', swaps: 2 });
assert.deepStrictEqual(plain.picked.map((s) => s.id), [20, 10], '칩을 끈 교체 후보 순서');
assert.strictEqual(plain.toasts.length, 0, '칩을 끈 교체에 알림이 떴다');

console.log('test-course-swap-chip: 통과');
