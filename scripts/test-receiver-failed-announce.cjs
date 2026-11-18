// 공유 링크 실패 알림 회귀 테스트: node scripts/test-receiver-failed-announce.cjs
// P-494가 막은 결함: 받은 링크 실패 카드는 글자를 담은 채 삽입한 role=alert 문단뿐이라 #sr-announce가 비어 있었고
// 낭독기에 따라 실패가 전달되지 않았다(WCAG 4.1.3). 홈 실패 띠(P-423)와 같은 방식으로 #sr-announce에 알린다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = main.indexOf(from);
  assert.ok(start >= 0, `${from}을 찾지 못했다`);
  return main.slice(start, main.indexOf(to, start) + to.length);
};
const TEXT = '연결이 끊겨 코스를 불러오지 못했어요. 링크는 그대로예요.';

const run = (failed) => {
  const env = { announced: [], listeners: {}, reloads: 0 };
  const app = { innerHTML: '' };
  const document = {
    getElementById: (id) => (app.innerHTML.includes(`id="${id}"`)
      ? { addEventListener: (t, fn) => { env.listeners[id] = fn; }, focus() {} }
      : null),
    querySelector: (sel) => {
      assert.strictEqual(sel, '#receiver-loading .receiver-hero-desc');
      const m = app.innerHTML.match(/id="receiver-loading"[\s\S]*?<p class="receiver-hero-desc"[^>]*>([\s\S]*?)<\/p>/);
      return m ? { textContent: m[1].replace(/<[^>]+>/g, '') } : null;
    },
  };
  const fn = new Function(
    'app', 'document', 'state', 'location', 'announce', 'getThemeModeLabel', 'getThemeModeHtml',
    'applyTheme', 'setSharedCourseView', 'cycleThemeMode', 'clearCourseHash', 'renderShell',
    'spotsFellBackToSample', 'showSpotsFailedBanner', 'spots', 'isCourseEligible',
    `${ts.transpile(cut('function receiverLoadingHtml', '\n}\n'), { target: 'es2022' })}
     ${ts.transpile(cut('function renderReceiverLoading(', '\n}\n'), { target: 'es2022' })}
     return renderReceiverLoading;`,
  )(
    app, document, { themeMode: 'light' }, { reload: () => { env.reloads++; } }, (t) => env.announced.push(t),
    () => '낮', () => '☀️', () => {}, () => {}, () => {}, () => { env.home = (env.home || 0) + 1; }, () => {},
    false, () => {}, [], () => true,
  );
  fn(failed);
  return { env, html: app.innerHTML };
};

// 1. 실패하면 실패 문장을 #sr-announce로 정확히 한 번 알린다
const f = run(true);
assert.deepStrictEqual(f.env.announced, [TEXT], '실패 문장을 한 번 알리지 않는다');
// 2. 카드 문단에는 라이브 영역 role을 두지 않는다(중복 낭독 방지)
assert.ok(f.html.includes(TEXT), '실패 문장이 카드에서 사라졌다');
assert.ok(!/role="(alert|status)"/.test(f.html), '실패 카드에 라이브 영역 role이 남았다');
// 3. 「다시 불러오기」·「홈으로」 동작 불변
f.env.listeners['btn-receiver-retry']();
assert.strictEqual(f.env.reloads, 1, '다시 불러오기가 새로 고침이 아니다');
f.env.listeners['btn-receiver-home']({ preventDefault() {} });
assert.strictEqual(f.env.home, 1, '홈으로가 받은 링크 해시를 지우지 않는다');
// 4. 불러오는 중 자리표시는 알리지 않는다(자리표시 문단의 polite status가 맡는다)
const l = run(false);
assert.deepStrictEqual(l.env.announced, [], '불러오는 중에 실패 알림을 냈다');
assert.ok(l.html.includes('role="status"'), '불러오는 중 status가 바뀌었다');

console.log('test-receiver-failed-announce: ok');
