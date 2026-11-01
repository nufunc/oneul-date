// 시트·패널이 열린 동안 뒤 페이지 스크롤 잠금 시험(P-252): node scripts/test-overlay-scroll-lock.cjs
// style.css에 잠금 규칙과 스크롤 본문 넷의 overscroll-behavior가 있고, main.ts의 renderOverlay가
// renderOverlayContent 뒤의 열림 상태로 잠금과 스크롤바 폭 보정을 켜고 끄는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

const lock = css.match(/^html\.overlay-locked,\nhtml\.overlay-locked body \{([^}]*)\}/m);
assert.ok(lock, 'html.overlay-locked 잠금 규칙이 없다');
assert.match(lock[1], /overflow:\s*hidden/);

for (const sel of ['.overlay-body', '.location-regions', '.location-subzones', '.spot-detail-body']) {
  const esc = sel.replace(/[.]/g, '\\.');
  const rule = css.match(new RegExp(`^${esc} \\{([^}]*)\\}`, 'm'));
  assert.ok(rule, `${sel} 규칙이 없다`);
  assert.match(rule[1], /overscroll-behavior:\s*contain/, `${sel}에 overscroll-behavior: contain이 없다`);
}

const fn = src.match(/\nfunction renderOverlay\(\): void \{([\s\S]*?)\n\}\n/);
assert.ok(fn, 'renderOverlay가 없다');
const body = fn[1];
const content = body.indexOf('renderOverlayContent();');
const toggle = body.indexOf("classList.toggle('overlay-locked'");
assert.ok(content >= 0, 'renderOverlayContent 호출이 없다');
assert.ok(toggle > content, '잠금 토글이 renderOverlayContent 뒤에 와야 한다(찾지 못한 스팟이 상태를 비우는 경로)');
const between = body.slice(content, toggle);
assert.match(between, /isOverlayOpen\(\)/, '잠금은 renderOverlayContent 뒤의 isOverlayOpen() 값으로 정한다');
assert.match(between, /innerWidth - html\.clientWidth/, '스크롤바 폭을 재지 않는다');
assert.match(between, /body\.style\.paddingRight/, '스크롤바 폭을 body padding-right로 보정하지 않는다');

// 찾지 못한 스팟은 열자마자 닫힌다. 열림 기억을 첫머리 open으로 두면 true로 남아 다음 시트를 연 요소를 기억하지 않는다(P-256)
assert.match(body, /\n  overlayWasOpen = locked;$/, 'overlayWasOpen은 renderOverlayContent 뒤의 열림 상태로 갱신한다');
assert.doesNotMatch(body, /overlayWasOpen = open;/, 'overlayWasOpen을 첫머리 open 값으로 갱신한다');

console.log('ok');
