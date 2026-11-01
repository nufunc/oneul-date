// 받은 코스 토스트를 저장 막대 위로 올리는지 시험(P-267): node scripts/test-receiver-toast-offset.cjs
// src/style.css에서 받은 코스 저장 막대(.receiver-actions-bar)가 있을 때만 토스트 아래 여백이
// 막대 위 끝(아래 여백 + 막대 높이)보다 크고, safe-area를 반영하며, 기본 토스트 위치는 그대로인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`^${esc} \\{([^}]*)\\}`, 'm'));
  assert.ok(m, `규칙이 없다: ${selector}`);
  return m[1];
}
const px = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|\\s)${prop}:\\s*calc\\((\\d+)px \\+ env\\(safe-area-inset-bottom, 0px\\)\\);`));
  assert.ok(m, `${prop}가 calc(Npx + env(safe-area-inset-bottom, 0px)) 형태가 아니다`);
  return Number(m[1]);
};

// 1. 기본 토스트 위치는 그대로(막대 없는 화면)
assert.strictEqual(px(rule('.toast-msg'), 'bottom'), 28, '막대 없는 화면의 토스트 위치가 바뀌었다');

// 2. 막대 위 끝: 아래 여백 + 패딩 위아래 + 버튼 높이 + 테두리 위아래
const bar = rule('.receiver-actions-bar');
const barBottom = px(bar, 'bottom');
const pad = Number(bar.match(/(?:^|\s)padding:\s*(\d+)px;/)[1]);
const border = Number(bar.match(/(?:^|\s)border:\s*(\d+)px solid/)[1]);
const btnH = Number(rule('.btn-receiver-action').match(/min-height:\s*(\d+)px;/)[1]);
const barTop = barBottom + pad * 2 + btnH + border * 2;

// 3. 막대가 있을 때만 토스트를 막대 위로
const lifted = px(rule('body:has(.receiver-actions-bar) .toast-msg'), 'bottom');
assert.ok(lifted >= barTop + 8, `받은 코스 토스트 아래 끝(${lifted}px)이 저장 막대 위 끝(${barTop}px)보다 8px 이상 높지 않다`);
assert.ok(lifted <= barTop + 40, `받은 코스 토스트가 저장 막대에서 너무 멀다(${lifted - barTop}px)`);

console.log('test-receiver-toast-offset: 통과');
