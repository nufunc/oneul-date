// 받은 링크 자리표시 회귀 테스트: node scripts/test-receiver-loading.cjs
// receiverLoadingHtml을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function receiverLoadingHtml');
const end = src.indexOf('\n}\n', start) + 3;
const html = new Function(
  'state',
  'getThemeModeLabel',
  'getThemeModeHtml',
  `${ts.transpile(src.slice(start, end), { target: 'es2022' })};return receiverLoadingHtml();`,
)({ themeMode: 'light' }, () => '낮', () => '☀️');

// 자리표시는 낭독기에 알리고 문구를 보인다
assert.ok(html.includes('id="receiver-loading"'), '자리표시 id가 없다');
assert.ok(/role="status"[^>]*aria-live="polite"/.test(html), 'role=status와 aria-live가 없다');
assert.ok(html.includes('공유받은 코스를 불러오는 중'), '불러오는 중 문구가 없다');
assert.ok(html.includes('공유받은 데이트 코스'), '수신자 머리 카드가 없다');
// 데이터가 오기 전에는 코스를 만들거나 홈으로 갈 길이 없어야 받은 코스를 잃지 않는다
for (const banned of ['btn-generate', 'conditions-area', 'main-mode-nav', 'btn-make-own', 'href=', 'aria-busy']) {
  assert.ok(!html.includes(banned), `${banned}가 자리표시에 있다`);
}
console.log('ok receiver-loading');
