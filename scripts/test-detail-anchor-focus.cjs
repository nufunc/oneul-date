// 상세 시트 '맞춤 코스 짜기' 뒤 화면과 초점 시험(P-416): node scripts/test-detail-anchor-focus.cjs
// renderOverlayContent의 #btn-detail-build-anchor 처리를 src/main.ts에서 그대로 떼어 실행한다
// 저장 코스 불러오기와 같이 결과로 스크롤하고, 닫힘 초점 복귀를 취소하고, 첫 상호명에 화면을 움직이지 않는 초점을 주는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const marker = "root.querySelector('#btn-detail-build-anchor')?.addEventListener('click', () => {";
const start = src.indexOf(marker);
assert.ok(start >= 0, '#btn-detail-build-anchor 처리가 없다');
const handlerSrc = src.slice(start, src.indexOf('\n    });', start) + 8);
assert.ok(!handlerSrc.includes('app.scrollIntoView'), '맨 위로 올리는 app.scrollIntoView가 남아 있다');

const code = ts.transpile(handlerSrc, { target: 'es2022' });

function run(hash) {
  const calls = [];
  let handler = null;
  const root = { querySelector: () => ({ addEventListener: (type, fn) => { handler = fn; } }) };
  const results = { scrollIntoView: (opts) => calls.push(`scroll:results:${JSON.stringify(opts)}`) };
  const firstName = { focus: (opts) => calls.push(`focus:first:${JSON.stringify(opts)}`) };
  const document = {
    getElementById: (id) => (id === 'results-area' ? results : null),
    querySelector: (sel) => (sel === '#results-area .step-name-link' ? firstName : null),
  };
  const app = { scrollIntoView: () => calls.push('scroll:app') };
  const state = { regions: ['SEOUL'], subZones: [], mood: null, mainMode: 'spot' };
  new Function(
    'root', 'location', 'overlayHistoryPushed', 'closeOverlay', 'clearCourseHash', 'renderShell', 'buildAnchorCourse', 'prevCourse',
    'state', 'updateModeView', 'document', 'app', 'scrollMotion', 'cancelOverlayFocusReturn', 'showToast', 'spot', code,
  )(
    root, { hash }, true, (cb) => { calls.push('closeOverlay'); cb(); }, () => calls.push('clearCourseHash'), () => calls.push('renderShell'),
    () => ['step'], null, state, () => calls.push('updateModeView'), document, app, () => 'smooth',
    () => calls.push('cancelOverlayFocusReturn'), () => calls.push('toast'), { id: 7, name: '테스트 장소' },
  );
  assert.ok(handler, '클릭 처리가 등록되지 않았다');
  handler();
  return { calls, state };
}

for (const hash of ['', '#c=1.2.3']) {
  const { calls, state } = run(hash);
  assert.strictEqual(state.mainMode, 'course', '코스 탭으로 옮기지 않았다');
  assert.ok(!calls.includes('scroll:app'), '화면을 맨 위로 올린다');
  const iScroll = calls.indexOf('scroll:results:{"behavior":"smooth","block":"start"}');
  const iCancel = calls.indexOf('cancelOverlayFocusReturn');
  const iFocus = calls.indexOf('focus:first:{"preventScroll":true}');
  assert.ok(iScroll > calls.indexOf('updateModeView'), `결과를 그린 뒤 결과로 스크롤하지 않는다: ${calls}`);
  assert.ok(iCancel > iScroll, `닫힘 초점 복귀를 취소하지 않는다: ${calls}`);
  assert.ok(iFocus > iCancel, `첫 상호명에 preventScroll 초점을 주지 않는다: ${calls}`);
  if (hash) assert.ok(calls.indexOf('renderShell') < calls.indexOf('updateModeView'), '받은 링크에서 홈 셸을 먼저 그리지 않는다');
}

// 저장 코스 불러오기와 같은 선택자와 순서를 쓴다
const loadSeq = "document.getElementById('results-area')?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });";
const focusSeq = "document.querySelector<HTMLElement>('#results-area .step-name-link')?.focus({ preventScroll: true });";
assert.ok(src.split(loadSeq).length - 1 >= 2 && src.split(focusSeq).length - 1 >= 2, '불러오기와 같은 선택자를 쓰지 않는다');
console.log('ok detail-anchor-focus');
