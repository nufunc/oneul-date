// 탭 영역 44px 시험(P-248): node scripts/test-tap-targets.cjs
// src/style.css의 상세 시트 지도 링크, 주소 복사, 저장한 코스 동작 버튼, 머리 버튼 규칙이 44px 이상인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 맨 앞 단독 규칙 본문만 읽는다. 미디어 쿼리 안 같은 선택자는 들여쓰기가 있어 잡히지 않는다
function rule(selector) {
  const m = css.match(new RegExp('^' + selector.replace(/[.:]/g, '\\$&') + ' \\{([^}]*)\\}', 'm'));
  assert.ok(m, `규칙이 없다: ${selector}`);
  return m[1];
}
function px(body, prop) {
  const m = body.match(new RegExp('(?:^|;|\\s)' + prop + ':\\s*(-?\\d+)px'));
  assert.ok(m, `${prop} 값이 없다`);
  return Number(m[1]);
}

assert.ok(px(rule('.spot-link-btn'), 'min-height') >= 44, '.spot-link-btn min-height가 44px 미만이다');

const saved = rule('.saved-action-btn');
assert.ok(px(saved, 'width') >= 44, '.saved-action-btn width가 44px 미만이다');
assert.ok(px(saved, 'min-height') >= 44, '.saved-action-btn min-height가 44px 미만이다');

const head = rule('.btn-saved');
assert.ok(px(head, 'min-height') >= 44, '.btn-saved min-height가 44px 미만이다');
assert.ok(px(head, 'min-width') >= 44, '.btn-saved min-width가 44px 미만이다');

// 복사 버튼 상자는 약 20px라 위아래로 13px씩 넓혀야 44px에 이른다(-12px는 실측 42px)
const inset = rule('.btn-copy-address::after').match(/inset:\s*(-?\d+)px\s+(-?\d+)px/);
assert.ok(inset, '.btn-copy-address::after inset 값이 없다');
assert.ok(Number(inset[1]) <= -13, '.btn-copy-address::after가 위아래로 13px 이상 넓히지 않는다');

console.log('test-tap-targets: 통과');
