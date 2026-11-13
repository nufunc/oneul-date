// 받은 링크 실패 카드의 홈 경로 시험: node scripts/test-receiver-failed-home.cjs
// receiverLoadingHtml과 renderReceiverLoading을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(P-413)
// 실패 카드에만 홈 링크와 홈으로 단추가 있고, 누르면 해시를 지우고 홈을 그리며 샘플 폴백이면 실패 띠를 띄우는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (marker) => {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker}가 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const code = ts.transpile(`${cut('function receiverLoadingHtml')}\n${cut('function renderReceiverLoading')}`, { target: 'es2022' });

function run(failed, fellBack) {
  const calls = [];
  const listeners = {};
  const app = { innerHTML: '' };
  const document = {
    getElementById: (id) => (app.innerHTML.includes(`id="${id}"`) ? { addEventListener: (type, fn) => { listeners[id] = fn; } } : null),
  };
  new Function(
    'state', 'getThemeModeLabel', 'getThemeModeHtml', 'applyTheme', 'setSharedCourseView', 'app', 'document', 'cycleThemeMode', 'location',
    'clearCourseHash', 'renderShell', 'spotsFellBackToSample', 'showSpotsFailedBanner', 'spots', 'isCourseEligible',
    `${code};renderReceiverLoading(${failed});`,
  )(
    { themeMode: 'light' }, () => '낮', () => '☀️', () => {}, () => {}, app, document, () => {}, { reload: () => calls.push('reload') },
    () => calls.push('clearCourseHash'), () => calls.push('renderShell'), fellBack, (n) => calls.push(`banner:${n}`),
    [{ is_closed: false }, { is_closed: true }, { is_closed: false }], () => true,
  );
  return { html: app.innerHTML, listeners, calls };
}

// 대기 카드에는 홈 경로가 없어야 홈으로 간 뒤 도착한 데이터가 받은 코스를 그리는 경로와 겹치지 않는다
const waiting = run(false, false);
assert.ok(!waiting.html.includes('btn-receiver-home'), '대기 카드에 홈으로 단추가 있다');
assert.ok(!waiting.html.includes('receiver-home-link'), '대기 카드에 홈 링크가 있다');
assert.ok(!waiting.html.includes('href='), '대기 카드에 링크가 있다');

const failed = run(true, true);
assert.ok(/<h1 class="app-title"><a href="#" class="app-title-link" id="receiver-home-link"[^>]*>오늘 데이트<\/a><\/h1>/.test(failed.html), '실패 카드 머리 제목이 홈 링크가 아니다');
assert.ok(/id="btn-receiver-retry">다시 불러오기<\/button>\s*<button type="button" class="btn-secondary" id="btn-receiver-home">홈으로<\/button>/.test(failed.html), '다시 불러오기 옆에 홈으로 단추가 없다');
for (const id of ['btn-receiver-home', 'receiver-home-link']) {
  assert.ok(failed.listeners[id], `${id}에 클릭 처리가 없다`);
  failed.calls.length = 0;
  let prevented = false;
  failed.listeners[id]({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented, `${id}가 기본 동작을 막지 않는다`);
  assert.deepStrictEqual(failed.calls, ['clearCourseHash', 'renderShell', 'banner:2'], `${id} 처리 순서가 다르다: ${failed.calls}`);
}

// 샘플로 떨어지지 않았으면 띠를 띄우지 않는다
const notFellBack = run(true, false);
notFellBack.listeners['btn-receiver-home']({ preventDefault() {} });
assert.deepStrictEqual(notFellBack.calls, ['clearCourseHash', 'renderShell'], '샘플 폴백이 아닌데 띠를 띄운다');
console.log('ok receiver-failed-home');
