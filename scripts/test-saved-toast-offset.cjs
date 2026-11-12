// 저장한 코스 패널 위로 토스트를 올리는지 시험(P-272): node scripts/test-saved-toast-offset.cjs
// showToast와 closeOverlay를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 작은 가짜 DOM에서 실행한다.
// 패널이 열린 동안만 토스트 아래 여백이 패널 높이 + 8px이고, 패널을 닫으면 올린 토스트만 감추는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const code = [
  // showToast가 부르는 낭독은 이 시험의 대상이 아니다
  'function announce() {}',
  cut('let toastTimer', '\n'),
  cut('function showToast', '\n}\n'),
  cut('let isClosingOverlay', '\n'),
  cut('function closeOverlay', '\n}\n'),
].join('\n');

const el = (cls) => {
  const set = new Set(cls ? [cls] : []);
  return {
    style: {},
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    setAttribute() {},
    set className(v) { set.clear(); set.add(v); },
  };
};
const dom = { toast: null, panel: null, backdrop: null };
const timers = [];
const document = {
  body: { appendChild: (t) => { dom.toast = t; } },
  createElement: () => el(),
  querySelector: (sel) => {
    if (sel === '.toast-msg') return dom.toast;
    if (sel === '#overlay-root .overlay-panel') return dom.panel;
    throw new Error(`시험이 모르는 선택자: ${sel}`);
  },
  getElementById: (id) => (id === 'overlay-root'
    ? { querySelector: (sel) => (sel === '.overlay-backdrop' ? dom.backdrop : dom.panel) }
    : null),
};
const window = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} };
const state = { savedOpen: false, regionSheetOpen: false, spotDetailId: null, mainMode: 'course' };
const stubs = { document, window, state, renderOverlay() { dom.panel = null; dom.backdrop = null; }, renderConditions() {}, renderSpotDiscovery() {} };
const { showToast, closeOverlay } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { showToast, closeOverlay };`,
)(...Object.values(stubs));

const openPanel = (h) => {
  state.savedOpen = true;
  dom.panel = el('overlay-panel');
  dom.panel.offsetHeight = h;
  dom.backdrop = el('overlay-backdrop');
};
const shown = () => dom.toast.classList.contains('show');

// 1. 패널이 없는 화면은 CSS 위치(아래 28px, 받은 코스 84px)를 그대로 쓴다
showToast('홈');
assert.strictEqual(dom.toast.style.bottom ?? '', '', '패널이 없는데 토스트 bottom을 정했다');
assert.ok(shown());

// 2. 패널이 열린 동안 패널 위쪽 끝 8px 위
openPanel(412);
showToast('📋 코스가 복사되었어요');
assert.strictEqual(dom.toast.style.bottom, '420px', '토스트가 저장한 코스 패널 위쪽 끝 8px 위가 아니다');

// 3. 목록이 줄어 패널이 낮아지면 다음 토스트가 새 높이를 쓴다(삭제 뒤 빈 상태)
dom.panel.offsetHeight = 230;
showToast('삭제했어요');
assert.strictEqual(dom.toast.style.bottom, '238px');

// 4. 올린 토스트가 뜬 채 패널을 닫으면 닫기 애니메이션과 함께 감춘다
closeOverlay();
assert.ok(!shown(), '패널을 닫았는데 올린 토스트가 빈 자리 위에 남는다');
timers.splice(0).forEach((fn) => fn());

// 5. 닫힘 콜백이 띄운 토스트(코스를 불러왔어요)는 패널이 사라진 뒤라 원래 자리에 뜬다
openPanel(412);
showToast('📋 코스가 복사되었어요');
closeOverlay(() => showToast('코스를 불러왔어요'));
timers.splice(0).forEach((fn) => fn());
assert.ok(shown());
assert.strictEqual(dom.toast.style.bottom ?? '', '', '패널을 닫은 뒤 토스트가 올라간 채로 떴다');

// 6. 올리지 않은 토스트(다른 시트에서 띄운 것)는 시트를 닫아도 감추지 않는다
state.spotDetailId = 1;
dom.backdrop = el('overlay-backdrop');
dom.panel = null;
closeOverlay();
assert.ok(shown(), '올리지 않은 토스트까지 감췄다');

// 7. 패널 없이 닫는 경로(백드롭이나 패널을 찾지 못함)에서도 올린 토스트를 감춘다
openPanel(412);
showToast('🔗 공유 링크가 복사되었어요');
dom.backdrop = null;
closeOverlay();
assert.ok(!shown(), '빠른 닫기 경로에서 올린 토스트가 남는다');

console.log('test-saved-toast-offset: 통과');
