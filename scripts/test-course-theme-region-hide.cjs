// 서울 단독일 때 맞춤 코스 탭 🌊 칩 제외 시험(P-288): node scripts/test-course-theme-region-hide.cjs
// renderConditions를 src/main.ts에서 떼어 화면 함수만 흉내 내고 돌린다.
// 지역이 서울 하나면 칩 줄에 OCEAN이 없고, 켜져 있던 OCEAN은 ALL로 돌아오는지 본다. 다른 지역 조합은 칩 9개 그대로다
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
const code = ['SPOT_EXPLORE_CATEGORIES', 'getCuratedThemeChips', 'renderConditions']
  .map((n) => {
    assert.ok(decls.has(n), `${n} 선언이 없다`);
    return decls.get(n).getText(sf).replace(/^export /, '');
  })
  .join('\n');
const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// renderConditions가 부르는 화면 함수는 빈 동작으로 둔다
const stubs = {
  focusSelectorFor: () => null,
  getRegionSelectorLabel: () => ({ title: '', subtitle: '', isSelected: false }),
  loadedRegionKeys: new Set(['ALL']),
  visibleSavedSpotCount: () => 0,
  getDynamicSearchPlaceholder: () => '',
  escapeHtml: (s) => String(s),
  renderQuickRegionChips: () => '',
  SLOT_ORDER: [],
  SLOT_META: {},
  courseWaitingForSpots: false,
  spotsWaitLabel: () => '',
  bindConditionEvents: () => {},
  paintSpotsProgress: () => {},
  restoreFocusIn: () => {},
};
const area = { innerHTML: '', contains: () => false };
const state = { regions: [], courseCategory: 'ALL', searchQuery: '', savedSpotIds: new Set(), slots: {} };
const document = { getElementById: (id) => (id === 'conditions-area' ? area : null), activeElement: null };
const renderConditions = new Function('state', 'document', ...Object.keys(stubs), `${js}\nreturn renderConditions;`)(
  state,
  document,
  ...Object.values(stubs),
);

const render = (regions, category) => {
  state.regions = regions;
  state.courseCategory = category;
  renderConditions();
  return [...area.innerHTML.matchAll(/data-cat-key="(\w+)"/g)].map((x) => x[1]);
};
const NINE = ['ALL', 'CAFE', 'DINING', 'WINE', 'PUB', 'NIGHT', 'OCEAN', 'CULTURE', 'HEALING', 'SPA'];
const EIGHT = NINE.filter((k) => k !== 'OCEAN');

// 1. 서울 단독이면 칩 8개이고 🌊이 없다. 나머지 경우는 칩 9개 그대로다
assert.deepStrictEqual(render(['SEOUL'], 'ALL'), EIGHT, '서울 단독인데 칩 줄이 8개(🌊 제외)가 아니다');
for (const regions of [[], ['SEOUL', 'GYEONGGI'], ['GYEONGGI', 'SEOUL'], ['GYEONGGI'], ['GANGWON'], ['CHUNGCHEONG'], ['YEONGNAM'], ['HONAM'], ['JEJU']]) {
  assert.deepStrictEqual(render(regions, 'ALL'), NINE, `${JSON.stringify(regions)}에서 칩 9개가 그대로가 아니다`);
}

// 2. 🌊이 켜진 채 서울 단독이 되면 ALL로 돌아와 ✨ 칩이 켜진다
render(['SEOUL'], 'OCEAN');
assert.strictEqual(state.courseCategory, 'ALL', '서울 단독인데 courseCategory가 OCEAN으로 남았다');
assert.match(area.innerHTML, /is-active" data-cat-key="ALL"/, '되돌린 뒤 ✨ 칩이 켜지지 않았다');

// 3. 줄에 있는 칩은 되돌리지 않는다
render(['SEOUL'], 'CAFE');
assert.strictEqual(state.courseCategory, 'CAFE', '서울 단독에서 ☕가 꺼졌다');
for (const regions of [[], ['SEOUL', 'GYEONGGI'], ['JEJU']]) {
  render(regions, 'OCEAN');
  assert.strictEqual(state.courseCategory, 'OCEAN', `${JSON.stringify(regions)}에서 🌊이 꺼졌다`);
}

console.log('test-course-theme-region-hide: 통과');
