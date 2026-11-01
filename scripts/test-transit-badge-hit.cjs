// 코스 결과 이동 배지 눌리는 영역 시험(P-263): node scripts/test-transit-badge-hit.cjs
// src/style.css의 .step-transit-badge::before가 배지 상자(29.4px)를 위아래로 넓혀 44px 이상이 되는지,
// 그 확장이 카드 사이 빈칸(.step-list gap - 이동 띠 음수 여백) 안에 머물러 이웃 카드와 겹치지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 맨 앞 단독 규칙 본문만 읽는다
function rule(selector) {
  const m = css.match(new RegExp('^' + selector.replace(/[.:-]/g, '\\$&') + ' \\{([^}]*)\\}', 'm'));
  assert.ok(m, `규칙이 없다: ${selector}`);
  return m[1];
}

assert.match(rule('.step-transit-badge'), /position:\s*relative;/, '.step-transit-badge에 position: relative가 없다');

const before = rule('.step-transit-badge::before');
assert.match(before, /content:\s*'';/, '.step-transit-badge::before에 content가 없다');
assert.match(before, /position:\s*absolute;/, '.step-transit-badge::before가 absolute가 아니다');
const inset = before.match(/inset:\s*(-?\d+)px\s+(-?\d+)(?:px)?;/);
assert.ok(inset, '.step-transit-badge::before inset 값이 없다');
const vertical = -Number(inset[1]);
assert.strictEqual(Number(inset[2]), 0, '눌리는 영역은 위아래로만 넓힌다(P-263 보기 a)');

// 배지 상자는 실측 29.4px라 위아래 각 8px 이상 넓혀야 44px 이상이 된다(7px은 실측 42px)
const BADGE_BOX = 29.4;
assert.ok(BADGE_BOX + vertical * 2 >= 44, `눌리는 높이가 ${BADGE_BOX + vertical * 2}px로 44px 미만이다`);

// 카드와 배지 사이 빈칸 = .step-list gap - 이동 띠 음수 여백. 확장이 이 안에 머물러야 한다
const space = Number(css.match(/--space-4:\s*(\d+)px/)[1]);
assert.match(rule('.step-list'), /gap:\s*var\(--space-4\);/, '.step-list gap이 --space-4가 아니다');
const margin = Number(rule('.step-transit-divider').match(/margin:\s*(-?\d+)px 0;/)[1]);
const gap = space + margin;
assert.ok(vertical < gap, `눌리는 영역 확장 ${vertical}px가 카드와의 빈칸 ${gap}px 이상이라 카드와 겹친다`);

console.log('test-transit-badge-hit: 통과');
