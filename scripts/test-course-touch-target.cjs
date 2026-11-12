// 코스 결과 🔄와 다시 추천 눌리는 영역 시험(P-303): node scripts/test-course-touch-target.cjs
// src/style.css에서 .btn-action-icon(공통), .btn-swap-icon(🔄), .btn-regenerate(다시 추천), .btn-optimize-route(최적 동선)의 ::after가
// 보이는 크기를 바꾸지 않고 눌리는 영역을 44px 이상으로 넓히는지, 이웃 아이콘과 겹치지 않는지 본다
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

// 공통: 세로 44px, 가로는 간격 절반(--icon-gap / 2)까지만. 가운데 44px 박스는 이웃과 겹쳐 첫 아이콘이 32px로 줄었다
const base = rule('.btn-action-icon::after');
assert.match(base, /position:\s*absolute;/, '.btn-action-icon::after가 absolute가 아니다');
assert.match(base, /height:\s*44px;/, '.btn-action-icon::after 높이가 44px가 아니다');
assert.match(base, /left:\s*calc\(-1px - var\(--icon-gap, 6px\) \/ 2\);/, '왼쪽이 간격 절반이 아니다');
assert.match(base, /right:\s*calc\(-1px - var\(--icon-gap, 6px\) \/ 2\);/, '오른쪽이 간격 절반이 아니다');
assert.doesNotMatch(base, /min-width:\s*44px/, '가운데 44px 박스(이웃과 겹침)가 남았다');
assert.match(rule('.btn-action-icon'), /position:\s*relative;/, '.btn-action-icon에 position: relative가 없다');

// 기본 간격 6px이 폴백과 같아야 하고, 간격을 4px로 줄이는 규칙은 --icon-gap도 4px로 맞춰야 한다
assert.match(rule('.step-actions-icons'), /gap:\s*6px;/, '.step-actions-icons 기본 간격이 6px가 아니다');
const gap4 = css.match(/\{ gap: 4px;[^}]*\}/g) || [];
assert.ok(gap4.length >= 2, '간격 4px 규칙을 찾지 못했다');
gap4.forEach((r) => assert.match(r, /--icon-gap:\s*4px;/, `간격 4px 규칙에 --icon-gap이 없다: ${r}`));

// 🔄: 첫 아이콘이라 왼쪽으로 넓혀 가로도 44px, 오른쪽은 공통 규칙대로 간격 절반에서 멈춘다
const swap = rule('.btn-swap-icon::after');
assert.match(swap, /left:\s*auto;/, '🔄 왼쪽을 풀지 않았다');
assert.match(swap, /width:\s*44px;/, '🔄 눌리는 폭이 44px가 아니다');
assert.ok(!/right:/.test(swap), '🔄 오른쪽은 공통 규칙을 따라야 한다');
// 340px 이하 4개 막대의 아이콘이 24px일 때 🔄는 왼쪽으로 44-24-4/2=18px 넓어진다. 이 크기가 바뀌면 다시 계산한다
const iconMin = Number(css.match(/@media \(max-width: 340px\) \{[\s\S]*?width: (\d+)px; height: \1px;/)[1]);
assert.strictEqual(iconMin, 24, '340px 이하 아이콘 크기가 바뀌었다. 🔄 왼쪽 확장을 다시 계산한다');

// 다시 추천: 모양(min-height 38px)은 그대로, ::after로 세로만 44px, 가로는 넓히지 않는다
const regen = rule('.btn-regenerate');
assert.match(regen, /position:\s*relative;/, '.btn-regenerate에 position: relative가 없다');
const h = Number(regen.match(/min-height:\s*(\d+)px;/)[1]);
assert.strictEqual(h, 38, '다시 추천 모양 높이가 바뀌었다');
const after = rule('.btn-regenerate::after');
assert.match(after, /position:\s*absolute;/, '.btn-regenerate::after가 absolute가 아니다');
const inset = after.match(/inset:\s*(-?\d+)px\s+(-?\d+)px;/);
assert.ok(inset, '.btn-regenerate::after inset 값이 없다');
// padding box는 테두리 1px씩 안쪽이라 높이 = 38 - 2 + 2 * 확장
assert.ok(h - 2 + 2 * -Number(inset[1]) >= 44, `다시 추천 눌리는 높이가 ${h - 2 + 2 * -Number(inset[1])}px로 44px 미만이다`);
assert.ok(-Number(inset[2]) <= 1, '다시 추천 눌리는 영역을 옆 버튼 쪽으로 넓혔다');

// 최적 동선: 모양 높이는 라이브 375px 실측 34px(ux-reviewer-284). ::after로 세로만 44px, 가로는 테두리만큼만
const opt = rule('.btn-optimize-route');
assert.match(opt, /position:\s*relative;/, '.btn-optimize-route에 position: relative가 없다');
assert.match(opt, /padding:\s*6px 12px;/, '최적 동선 여백이 바뀌어 실측 34px 전제가 깨졌다');
const optInset = rule('.btn-optimize-route::after').match(/inset:\s*(-?\d+)px\s+(-?\d+)px;/);
assert.ok(optInset, '.btn-optimize-route::after inset 값이 없다');
assert.ok(34 - 2 + 2 * -Number(optInset[1]) >= 44, '최적 동선 눌리는 높이가 44px 미만이다');
assert.ok(-Number(optInset[2]) <= 1, '최적 동선 눌리는 영역을 옆 버튼 쪽으로 넓혔다');

console.log('test-course-touch-target: 통과');
