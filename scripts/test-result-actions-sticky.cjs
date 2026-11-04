// 코스 결과 막대(📋 🔗 💾)를 코스를 만든 뒤에만 화면 아래에 붙이는지 시험(P-295): node scripts/test-result-actions-sticky.cjs
// src/style.css: #results-area[data-engaged]에서만 sticky이고 기본 규칙에는 sticky가 없으며, 토스트가 막대 위로 올라간다
// src/main.ts: 첫 로드 기본 코스 경로에는 속성을 켜지 않고, 코스를 만드는 경로(🚀, 다시 추천, 앵커, 불러오기)에서 켠다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const ts = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

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

// 1. 기본 막대 규칙은 sticky가 아니다(첫 로드 기본 코스에 붙지 않는다)
assert.ok(!/position:\s*sticky/.test(rule('.result-actions')), '.result-actions가 항상 붙는다');
assert.ok(!/position:\s*sticky/.test(rule('.result-actions.result-actions-3')), '.result-actions-3이 항상 붙는다');

// 2. 코스를 만든 뒤에만 sticky, 받은 코스 저장 막대와 같은 아래 여백
const bar = rule('#results-area[data-engaged] .result-actions.result-actions-3');
assert.ok(/position:\s*sticky/.test(bar), '코스를 만든 뒤 결과 막대가 sticky가 아니다');
const barBottom = px(bar, 'bottom');
assert.strictEqual(barBottom, 8, '결과 막대 아래 여백이 받은 코스 막대(8px)와 다르다');
const pad = Number(bar.match(/(?:^|\s)padding:\s*(\d+)px;/)[1]);
const border = Number(bar.match(/(?:^|\s)border:\s*(\d+)px solid/)[1]);

// 3. 토스트는 막대가 있을 때 막대 위로: 막대 위 끝 = 아래 여백 + 패딩 + 버튼 + 테두리(버튼 높이는 .btn-secondary의 최소 높이)
const btnH = Number((css.match(/^\.btn-secondary \{[^}]*?min-height:\s*(\d+)px;/m) || css.match(/^\.btn-primary \{[^}]*?min-height:\s*(\d+)px;/m) || [0, 44])[1]);
const barTop = barBottom + pad * 2 + btnH + border * 2;
const toastRule = css.match(/body:has\(#results-area\[data-engaged\] \.result-actions-3\) \.toast-msg\s*\{([^}]*)\}/);
assert.ok(toastRule, '결과 막대가 붙은 화면의 토스트 규칙이 없다');
const lifted = px(toastRule[1], 'bottom');
assert.ok(lifted >= barTop + 8, `토스트 아래 끝(${lifted}px)이 결과 막대 위 끝(${barTop}px)보다 8px 이상 높지 않다`);
assert.ok(lifted <= barTop + 40, `토스트가 결과 막대에서 너무 멀다(${lifted - barTop}px)`);
assert.strictEqual(px(rule('.toast-msg'), 'bottom'), 28, '기본 토스트 위치가 바뀌었다');

// 4. 초점 가림 방지
assert.ok(/#results-area\[data-engaged\] :is\(a, button\) \{[^}]*scroll-margin-bottom:\s*80px/.test(css), 'scroll-margin-bottom 규칙이 없다');

// 5. 속성은 코스를 만드는 경로에서만 켠다: 함수 본문별로 호출 여부를 본다
function body(name) {
  const i = ts.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `함수가 없다: ${name}`);
  const next = ts.indexOf('\nfunction ', i + 10);
  return ts.slice(i, next < 0 ? undefined : next);
}
assert.ok(/data-engaged/.test(body('markResultsEngaged')), 'markResultsEngaged가 속성을 켜지 않는다');
['triggerCourseGeneration', 'regenerateCourse'].forEach((fn) => {
  assert.ok(body(fn).includes('markResultsEngaged()'), `${fn}가 속성을 켜지 않는다`);
});
// 앵커 코스와 저장 코스 불러오기는 화면 안쪽 핸들러에서 결과로 내리기 직전에 켠다
const calls = (ts.match(/markResultsEngaged\(\)/g) || []).length;
assert.ok(calls >= 5, `markResultsEngaged 호출이 5곳(정의 포함) 미만이다: ${calls}`);
// 첫 로드 기본 코스 경로(renderDailyCourse류)에서는 켜지 않는다
const dailyIdx = ts.indexOf('dailyRng });');
assert.ok(dailyIdx > 0, '기본 코스 경로를 찾지 못했다');
const dailyBlock = ts.slice(dailyIdx, dailyIdx + 3000);
assert.ok(!dailyBlock.includes('markResultsEngaged'), '첫 로드 기본 코스 경로가 속성을 켠다');

console.log('test-result-actions-sticky: 통과');
