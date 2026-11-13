// 조건 영역 가로 칩 줄의 키보드 초점 보정 시험(P-417): node scripts/test-chip-focus-reveal.cjs
// renderShell의 #conditions-area focusin 처리와 revealChipInRow를 src/main.ts에서 그대로 떼어 실행한다
// Tab으로 반쯤 보이는 칩에 오면 줄만 넘기고, 마우스와 터치 초점(:focus-visible 아님)과 무드 줄은 건드리지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fnStart = src.indexOf('function revealChipInRow(');
assert.ok(fnStart >= 0, 'revealChipInRow가 없다');
const revealSrc = src.slice(fnStart, src.indexOf('\n}\n', fnStart) + 2);
const marker = "document.getElementById('conditions-area')?.addEventListener('focusin', (e) => {";
const hStart = src.indexOf(marker);
assert.ok(hStart >= 0, '#conditions-area focusin 처리가 없다');
const handlerSrc = src.slice(hStart, src.indexOf('\n  });', hStart) + 6);
// 페이지 세로 스크롤을 움직이는 scrollIntoView를 쓰지 않는다
assert.ok(!/scrollIntoView/.test(revealSrc + handlerSrc), 'scrollIntoView를 쓴다');
// renderShell 안에 있어야 #conditions-area 하나에 한 번만 걸린다
const shellStart = src.indexOf('function renderShell(');
assert.ok(hStart > shellStart && hStart < src.indexOf('\n}\n', shellStart), 'focusin 처리가 renderShell 밖에 있다');

const code = ts.transpile(`${revealSrc}\n${handlerSrc}`, { target: 'es2022' });
global.getComputedStyle = (el) => ({ paddingRight: el.padRight });

// 줄 폭 274px(x 58~332), 칩은 scrollLeft만큼 왼쪽으로 밀려 그려진다(ux-310의 390 측정값)
function setup(rowSel, padRight) {
  let handler = null;
  const area = { addEventListener: (type, fn) => { assert.strictEqual(type, 'focusin'); handler = fn; } };
  const document = { getElementById: (id) => (id === 'conditions-area' ? area : null) };
  const row = {
    scrollLeft: 214,
    clientWidth: 274,
    padRight,
    getBoundingClientRect: () => ({ left: 58, right: 332 }),
  };
  const chip = (left, width, focusVisible) => ({
    offsetWidth: width,
    getBoundingClientRect: () => ({ left: left - row.scrollLeft, right: left - row.scrollLeft + width }),
    matches: (sel) => (sel === ':focus-visible' ? focusVisible : false),
    closest: (sel) => (sel.split(',').map((x) => x.trim()).includes(rowSel) ? row : null),
  });
  new Function('document', `${code}`)(document);
  assert.ok(handler, 'focusin 처리가 등록되지 않았다');
  return { row, chip, focus: (c) => handler({ target: c }) };
}

// 테마 줄: 반쯤 보이는 ♨️ 칩(줄 기준 x 283~388, 화면에서 오른쪽이 줄 밖)으로 Tab하면 줄 안으로
let t = setup('.spot-category-scroll', '2px');
let c = t.chip(283 + 214, 105, true);
t.focus(c);
let box = c.getBoundingClientRect();
assert.ok(box.left >= 58 && box.right <= 332 - 2, `테마 칩이 줄 안으로 오지 않았다: ${box.left}~${box.right}`);

// 같은 칩이라도 마우스나 터치 초점이면 기존처럼 줄을 움직이지 않는다
t = setup('.spot-category-scroll', '2px');
c = t.chip(283 + 214, 105, false);
t.focus(c);
assert.strictEqual(t.row.scrollLeft, 214, '마우스 초점에서 줄이 움직였다');

// 지역 줄: 오른쪽 흐림 가림(20px)에 걸친 충청 칩(x 316~363)은 가림 밖으로
t = setup('.quick-region-scroll:not(.quick-mood-row)', '20px');
c = t.chip(270 + 214, 47, true);
t.focus(c);
box = c.getBoundingClientRect();
assert.ok(box.left >= 58 && box.right <= 332 - 20, `지역 칩이 흐림 가림 밖으로 오지 않았다: ${box.left}~${box.right}`);

// 이미 다 보이는 칩은 그대로
t = setup('.quick-region-scroll:not(.quick-mood-row)', '20px');
c = t.chip(100 + 214, 47, true);
t.focus(c);
assert.strictEqual(t.row.scrollLeft, 214, '보이는 칩인데 줄이 움직였다');

// 줄 밖 요소(무드 줄, 검색칸)는 건드리지 않는다
t = setup('.quick-mood-row', '2px');
c = t.chip(283 + 214, 105, true);
t.focus(c);
assert.strictEqual(t.row.scrollLeft, 214, '무드 줄이나 줄 밖 요소에서 줄이 움직였다');

console.log('ok chip-focus-reveal');
