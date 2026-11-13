// 켜진 분위기 칩 대비 시험(P-418): node scripts/test-mood-chip-contrast.cjs
// 다크 전용 #a855f7 덮어쓰기가 흰 글자를 3.96:1로 낮췄다. 다크 덮어쓰기가 없고 바탕이 흰 글자와 4.5:1 이상인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
assert.ok(!/data-theme(-resolved)?="dark"\] \.quick-region-chip\.chip-mood\.is-mood-active/.test(css), '켜진 분위기 칩의 다크 덮어쓰기가 남아 있다');

const body = css.match(/^\.quick-region-chip\.chip-mood\.is-mood-active \{([^}]*)\}/m)[1];
const bg = body.match(/background:\s*(#[0-9a-f]{6});/i)[1];
assert.match(body, /color:\s*#fff;/i, '켜진 분위기 칩 글자가 흰색이 아니다');

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = 1.05 / (lum(bg) + 0.05);
assert.ok(ratio >= 4.5, `켜진 분위기 칩 대비 ${ratio.toFixed(2)}:1이 4.5:1 미만이다`);

console.log(`test-mood-chip-contrast: 통과 (${ratio.toFixed(2)}:1)`);
