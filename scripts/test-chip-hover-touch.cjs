// 터치 hover 잔존 시험(P-419): node scripts/test-chip-hover-touch.cjs
// 실내 칩과 분위기 칩의 :hover 글자색이 @media (hover: hover) 안에만 있어 터치 기기에 걸리지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const hoverBlock = css.match(/\n@media \(hover: hover\) \{([\s\S]*?)\n\}/)[1];
const outside = css.replace(/\n@media \(hover: hover\)[^{]*\{[\s\S]*?\n\}/g, '');

for (const [cls, color] of [['chip-indoor', '#2563eb'], ['chip-mood', '#9333ea']]) {
  const re = new RegExp(`\\.quick-region-chip\\.${cls}:hover \\{[^}]*color: ${color};`);
  assert.match(hoverBlock, re, `${cls} hover 규칙이 @media (hover: hover) 안에 없다`);
  assert.ok(!new RegExp(`\\.quick-region-chip\\.${cls}:hover`).test(outside), `${cls} hover 규칙이 @media (hover: hover) 밖에 남아 있다`);
}

console.log('test-chip-hover-touch: 통과');
