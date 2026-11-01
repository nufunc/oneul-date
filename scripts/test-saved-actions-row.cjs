// 저장한 코스 동작 버튼 가로 줄 시험(P-270): node scripts/test-saved-actions-row.cjs
// src/style.css에서 📋 🔗 🗑이 카드 오른쪽 위 가로 한 줄(44×44, 간격 4px)이고, 머리 줄이 그 자리를 비켜 칩이 버튼 줄 아래에서 시작하는지 본다
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
function val(body, prop) {
  const m = body.match(new RegExp('(?:^|;|\\s)' + prop + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}
const px = (body, prop) => {
  const v = val(body, prop);
  assert.ok(v && /^-?\d+px$/.test(v), `${prop} 값이 px가 아니다: ${v}`);
  return Number.parseInt(v, 10);
};

const item = rule('.saved-item');
assert.strictEqual(val(item, 'position'), 'relative', '.saved-item이 버튼 줄의 기준 상자가 아니다');

const actions = rule('.saved-item-actions');
assert.strictEqual(val(actions, 'position'), 'absolute', '버튼 줄이 카드 위에 겹쳐 놓이지 않는다');
assert.strictEqual(val(actions, 'flex-direction'), 'row', '버튼이 세로 열로 쌓인다');
const top = px(actions, 'top');
const right = px(actions, 'right');
const gap = px(actions, 'gap');
assert.ok(gap >= 4, '버튼 사이 간격이 4px 미만이다(P-248)');

const btn = rule('.saved-action-btn');
assert.strictEqual(val(btn, 'flex'), 'none', '버튼이 늘어나거나 줄어든다');
assert.ok(px(btn, 'width') >= 44, '버튼 폭이 44px 미만이다');
assert.ok(px(btn, 'height') >= 44, '버튼 높이가 44px 미만이다');
assert.ok(px(btn, 'min-height') >= 44, '버튼 최소 높이가 44px 미만이다');

// 머리 줄은 버튼 줄 폭만큼 오른쪽을 비우고, 높이를 채워 칩이 버튼 줄 아래에서 시작하게 한다.
// 본문(.saved-item-main)의 테두리 1px, 안쪽 여백(위 12px, 오른쪽 16px), 줄 간격 2px, 칩 위 여백 4px을 더해 비교한다
const rowW = right + 44 * 3 + gap * 2;
const rowBottom = top + 44;
const meta = rule('.saved-item-meta');
assert.ok(1 + 16 + px(meta, 'padding-right') >= rowW, '머리 글자가 버튼 줄 밑으로 들어간다');
assert.ok(1 + 12 + px(meta, 'min-height') + 2 + 4 >= rowBottom, '칩이 버튼 줄 옆에서 시작한다');
// 전역 keep-all이라 띄어쓰기 없는 긴 이름이 머리 줄 폭을 넓혀 버튼 밑으로 들어가지 않게 한다
assert.strictEqual(val(meta, 'overflow-wrap'), 'anywhere', '긴 이름이 머리 줄을 넓혀 버튼 밑으로 들어간다');

console.log('test-saved-actions-row: 통과');
