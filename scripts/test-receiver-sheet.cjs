// 받은 코스 화면 상세 시트 회귀 테스트: node scripts/test-receiver-sheet.cjs
// 시트 열고 닫기(closeOverlay~renderOverlay)와 상호명 클릭 처리를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다.
// 8e1d4b5가 막은 결함: 시트 자리가 없는 화면에서 상호명을 누르면 상태만 세워져, 홈으로 가면 시트가 저절로 떴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${from}을 찾지 못했다`);
  const end = src.indexOf(to, start);
  assert.ok(end > start, `${from} 뒤에서 ${to}를 찾지 못했다`);
  return src.slice(start, end + to.length);
};
const fnBody = (name) => cut(`function ${name}(`, '\n}\n');

// 화면 구성: 받은 코스와 홈 셸 모두 시트 자리를 두고, 받은 코스 카드 상호명도 버튼이다
assert.ok(fnBody('renderReceiverView').includes('id="overlay-root"'), '받은 코스 화면에 #overlay-root가 없다');
assert.ok(fnBody('renderShell').includes('id="overlay-root"'), '홈 셸에 #overlay-root가 없다');
assert.ok(/renderOverlay\(\);\n}\n$/.test(fnBody('renderShell')), 'renderShell이 renderOverlay()로 끝나지 않는다');
assert.ok(/<h3 class="step-name">\s*<button type="button" class="step-name-link"/.test(fnBody('renderStepCard')),
  'renderStepCard 상호명이 버튼이 아니다');

// 시트 열고 닫기를 가짜 DOM과 history로 돌린다
const overlayCode = cut('let isClosingOverlay = false;', '\nfunction renderOverlayContent(').replace(/\nfunction renderOverlayContent\($/, '');
const clickCode = cut("  document.addEventListener('click', (e) => {", '\n  });\n');

const run = new Function(
  'env',
  `const { state, document, window, history, queueMicrotask, renderOverlayContent, renderConditions, renderSpotDiscovery, focusSelectorFor } = env;
  ${ts.transpile(overlayCode + '\n' + clickCode, { target: 'es2022' })}
  return { closeOverlay, renderOverlay, isOverlayOpen };`,
);

function makeEnv() {
  const state = { savedOpen: false, regionSheetOpen: false, spotDetailId: null, mainMode: 'course' };
  const listeners = { doc: {}, win: {} };
  const pendingPop = [];
  const env = {
    root: null,
    state,
    document: {
      activeElement: null,
      getElementById: (id) => (id === 'overlay-root' ? env.root : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (t, fn) => (listeners.doc[t] = fn),
    },
    window: { addEventListener: (t, fn) => (listeners.win[t] = fn) },
    history: {
      depth: 1,
      pushState() { this.depth++; },
      back() { this.depth--; pendingPop.push(1); },
      replaceState() {},
    },
    queueMicrotask: (fn) => fn(),
    // 실제 함수처럼 상태를 보고 자리에 시트를 그린다
    renderOverlayContent: () => {
      if (env.root) env.root.innerHTML = state.spotDetailId ? `sheet:${state.spotDetailId}` : '';
    },
    renderConditions: () => {},
    renderSpotDiscovery: () => {},
    focusSelectorFor: () => null,
  };
  env.api = run(env);
  env.clickName = (id) => listeners.doc.click({ target: { closest: () => ({ dataset: { detailSpotId: String(id) } }) } });
  env.flushPop = () => { while (pendingPop.length) { pendingPop.pop(); listeners.win.popstate(); } };
  env.makeRoot = () => (env.root = { innerHTML: '', querySelector: () => null });
  // 홈으로 가기: 받은 코스의 goHome은 clearCourseHash 뒤 renderShell이고, renderShell은 새 자리를 두고 renderOverlay()로 끝난다
  env.goHome = () => { env.makeRoot(); env.api.renderOverlay(); };
  // 상태와 화면이 어긋나면(상태만 열림) 그 상태가 홈에서 시트로 나타난다
  env.consistent = () => Boolean(state.spotDetailId) === Boolean(env.root && env.root.innerHTML.startsWith('sheet:'));
  return env;
}

// 1. 받은 코스: 상호명을 누르면 그 자리에서 시트가 열리고, 닫은 뒤 홈으로 가면 시트가 없다
{
  const env = makeEnv();
  env.makeRoot();
  env.clickName(42);
  assert.strictEqual(env.root.innerHTML, 'sheet:42', '받은 코스에서 상호명을 눌러도 시트가 열리지 않는다');
  assert.ok(env.consistent());
  env.api.closeOverlay();
  env.flushPop();
  assert.strictEqual(env.state.spotDetailId, null, '시트를 닫았는데 상태가 남았다');
  env.goHome();
  assert.strictEqual(env.root.innerHTML, '', '닫은 뒤 홈으로 가면 시트가 저절로 뜬다');
  assert.strictEqual(env.history.depth, 1, '시트 history 항목이 남았다');
}

// 2. 받은 코스: 뒤로 가기로 시트를 닫은 뒤 홈으로 가도 시트가 없다
{
  const env = makeEnv();
  env.makeRoot();
  env.clickName(7);
  env.history.back();
  env.flushPop();
  assert.strictEqual(env.state.spotDetailId, null, '뒤로 가기로 닫았는데 상태가 남았다');
  env.goHome();
  assert.strictEqual(env.root.innerHTML, '', '뒤로 가기로 닫은 뒤 홈으로 가면 시트가 저절로 뜬다');
}

// 3. 시트 자리가 없는 화면(받은 링크 자리표시): 눌러도 상태를 세우지 않아 홈에서 시트가 뜨지 않는다(8e1d4b5의 원래 결함)
{
  const env = makeEnv();
  env.clickName(42);
  assert.strictEqual(env.state.spotDetailId, null, '시트 자리가 없는데 상태가 세워졌다');
  env.goHome();
  assert.strictEqual(env.root.innerHTML, '', '자리 없는 화면에서 누른 뒤 홈으로 가면 시트가 저절로 뜬다');
}

// 4. 홈: 기존대로 열리고 닫힌다
{
  const env = makeEnv();
  env.makeRoot();
  env.clickName(3);
  assert.strictEqual(env.root.innerHTML, 'sheet:3');
  env.api.closeOverlay();
  env.flushPop();
  assert.strictEqual(env.root.innerHTML, '');
  assert.ok(env.consistent());
}

console.log('ok receiver-sheet');
