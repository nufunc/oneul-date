// 코스 카드 핫플 배지 대비 시험(P-384): node scripts/test-hot-badge-contrast.cjs
// .badge-hot-floating 바탕이 흰 글자와 WCAG AA 4.5:1 이상인 단색인지 본다(그라데이션 밝은 끝이 3.52:1이었다)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const body = css.match(/^\.badge-hot-floating \{([^}]*)\}/m)[1];
const bg = body.match(/background:\s*([^;]+);/)[1].trim();
assert.match(bg, /^#[0-9a-f]{6}$/i, `핫플 배지 바탕이 단색이 아니다: ${bg}`);
assert.match(body, /color:\s*#FFFFFF;/i, '핫플 배지 글자가 흰색이 아니다');

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = 1.05 / (lum(bg) + 0.05);
assert.ok(ratio >= 4.5, `핫플 배지 대비 ${ratio.toFixed(2)}:1이 4.5:1 미만이다`);

console.log(`test-hot-badge-contrast: 통과 (${ratio.toFixed(2)}:1)`);
