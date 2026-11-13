// 받은 코스에서 홈으로 갈 때 초점 시험(P-415): node scripts/test-receiver-home-focus.cjs
// renderReceiverView와 renderReceiverLoading의 goHome을 src/main.ts에서 그대로 떼어 실행한다
// 홈을 그린 뒤 초점이 BODY로 떨어지지 않고 #main-content로 가며 화면은 움직이지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fnBody = (marker) => {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker}가 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const goHomeOf = (fn) => {
  const body = fnBody(fn);
  const start = body.indexOf('const goHome = (e: Event) => {');
  assert.ok(start >= 0, `${fn}에 goHome이 없다`);
  return { body, goHome: body.slice(start, body.indexOf('\n  };', start) + 5) };
};

function run(goHomeSrc) {
  const calls = [];
  const document = {
    getElementById: (id) => (id === 'main-content'
      ? { focus: (opts) => calls.push(`focus:${id}:${JSON.stringify(opts)}`) }
      : null),
  };
  const code = ts.transpile(`${goHomeSrc}\nreturn goHome;`, { target: 'es2022' });
  const goHome = new Function(
    'document', 'clearCourseHash', 'renderShell', 'spotsFellBackToSample', 'showSpotsFailedBanner', 'spots', 'isCourseEligible', code,
  )(document, () => calls.push('clearCourseHash'), () => calls.push('renderShell'), false, () => calls.push('banner'), [], () => true);
  let prevented = false;
  goHome({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented, '기본 동작을 막지 않는다');
  return calls;
}

const focusCall = 'focus:main-content:{"preventScroll":true}';
for (const fn of ['function renderReceiverView', 'function renderReceiverLoading']) {
  const { body, goHome } = goHomeOf(fn);
  const calls = run(goHome);
  assert.strictEqual(calls[calls.length - 1], focusCall, `${fn}: 홈을 그린 뒤 #main-content에 초점을 주지 않는다: ${calls}`);
  assert.ok(calls.indexOf('renderShell') < calls.indexOf(focusCall), `${fn}: 초점이 renderShell보다 먼저다`);
  // 머리 제목 홈 링크도 같은 goHome을 쓴다
  assert.ok(body.includes("getElementById('receiver-home-link')?.addEventListener('click', goHome)"), `${fn}: 홈 링크가 goHome을 쓰지 않는다`);
}

// 받은 코스의 '나도 이런 코스 만들기'와 '나만의 코스 만들기'는 makeOwn을 거쳐 같은 goHome으로 간다
const view = goHomeOf('function renderReceiverView').body;
assert.ok(/const makeOwn = \(e: Event\) => \{[\s\S]*?goHome\(e\);\n {2}\};/.test(view), 'makeOwn이 goHome을 부르지 않는다');
for (const id of ['btn-make-own', 'btn-make-own-hero']) {
  assert.ok(view.includes(`getElementById('${id}')?.addEventListener('click', makeOwn)`), `${id}가 makeOwn을 쓰지 않는다`);
}
// 실패 카드의 홈으로 단추도 같은 goHome
assert.ok(goHomeOf('function renderReceiverLoading').body.includes("getElementById('btn-receiver-home')?.addEventListener('click', goHome)"), '홈으로 단추가 goHome을 쓰지 않는다');

// 초점 대상은 초점을 받을 수 있는 main이어야 한다
assert.ok(src.includes('<main id="main-content" tabindex="-1">'), '#main-content에 tabindex=-1이 없다');
console.log('ok receiver-home-focus');
