// 머리 매거진 글자 표시 하한 시험(P-381): node scripts/test-topbar-magazine-label.cjs
// 375px에서 '매거진' 글자를 보이면 '저장한 코스' 단추가 화면 밖으로 나가 문서 폭이 380px가 됐다(ux-reviewer-284).
// 글자를 보이는 미디어 규칙의 하한이 400px 이상인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const rules = [...css.matchAll(/@media \(min-width: (\d+)px\)[^{]*\{\s*\.topbar-actions \.btn-magazine \.topbar-label \{\s*display: inline;/g)];
assert.strictEqual(rules.length, 1, `매거진 글자 표시 규칙 수: ${rules.length}`);
assert.ok(Number(rules[0][1]) >= 400, `매거진 글자 표시 하한이 ${rules[0][1]}px다. 375px에서 머리가 넘친다`);

console.log('test-topbar-magazine-label: 통과');
