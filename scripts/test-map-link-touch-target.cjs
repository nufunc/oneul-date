// 코스 카드 지도 링크 셋 눌리는 영역 시험(P-450): node scripts/test-map-link-touch-target.cjs
// .step-actions-right의 간격 절반 + 테두리 1px만큼 ::after를 넓혀 칩 32px의 눌리는 폭을 44px로 둔다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 기본: 칩 32px + 2×7 = 46px 안쪽 기준에서 테두리를 빼면 44px, 간격 12px의 절반 6px + 1px = 7px라 이웃과 겹치지 않는다
const base = css.match(/^\.step-actions-right \{([^}]*)\}/m);
assert.ok(base, '.step-actions-right 규칙이 없다');
assert.match(base[1], /gap:\s*12px;/, '기본 간격이 12px가 아니다');
const after = css.match(/^\.step-actions-right > button::after \{([^}]*)\}/m);
assert.ok(after, '.step-actions-right ::after 규칙이 없다');
assert.match(after[1], /inset:\s*-7px -7px;/, '기본 ::after가 -7px -7px가 아니다');

// 좁은 폭에서도 칩을 줄이거나 간격을 바꾸지 않는다. 한 줄에 들어가지 않으면 막대가 줄을 접는다
assert.doesNotMatch(css, /\.step-actions-right \{ gap: \d+px; --icon-gap/, '지도 링크 간격을 폭별로 바꾸는 규칙이 다시 생겼다');
console.log('ok map link touch target');
