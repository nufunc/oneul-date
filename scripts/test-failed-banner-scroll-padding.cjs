// 실패 띠 초점 가림 회귀 테스트: node scripts/test-failed-banner-scroll-padding.cjs
// P-493이 막은 결함: 장소 정보 실패 띠(position:fixed)가 떠 있을 때 Tab으로 「완성하기」 버튼에 초점이 가도
// 문서가 띠 높이만큼 스크롤하지 않아 버튼 아랫단이 띠에 가렸다(WCAG 2.4.11)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const rule = (sel) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `${sel} 규칙이 없다`);
  return css.slice(i, css.indexOf('}', i));
};

// 1. 띠가 있는 동안만 초점 이동 스크롤을 띠 높이만큼 띄운다. :has라서 ✕로 띠를 지우면 함께 없어진다
const pad = rule('html:has(.data-failed-banner)');
const sp = pad.match(/scroll-padding-bottom:\s*([^;]+);/);
assert.ok(sp, '띠가 있을 때 html scroll-padding-bottom이 없다');

// 2. 스크롤 끝 여백(#app padding-bottom)과 같은 값이어야 초점 위치와 끝 위치가 함께 띠를 비킨다
const app = rule('body:has(.data-failed-banner) #app').match(/padding-bottom:\s*([^;]+);/);
assert.ok(app, '띠가 있을 때 #app 아래 여백이 없다');
assert.strictEqual(sp[1].trim(), app[1].trim(), '초점 여백과 스크롤 끝 여백이 다르다');

// 3. 여백은 띠의 bottom(76px)과 띠 높이를 덮어야 한다
const bottom = Number(rule('.data-failed-banner').match(/bottom:\s*calc\((\d+)px/)[1]);
const px = Number(sp[1].match(/(\d+)px/)[1]);
assert.ok(px >= bottom + 44, `여백 ${px}px가 띠 bottom ${bottom}px와 최소 띠 높이 44px보다 작다`);

// 4. 정상 로드 화면은 불변: 띠와 무관한 scroll-padding을 html에 두지 않는다
assert.ok(!/(^|\n)html\s*\{[^}]*scroll-padding/.test(css), '띠가 없을 때도 html scroll-padding이 걸린다');

console.log('test-failed-banner-scroll-padding: ok');
