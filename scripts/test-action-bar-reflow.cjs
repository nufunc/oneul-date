// 세 칸 동작 막대 리플로 시험(P-400): node scripts/test-action-bar-reflow.cjs
// 글자 200%에서 결과 카드의 저장 칸과 받은 코스의 링크 공유 칸이 화면 밖으로 밀리지 않도록
// 칸 최소 폭이 글자 폭에 묶이지 않고(minmax(0, 1fr), auto) 단추 글자가 꺾일 수 있는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const rule = (sel) => {
  const m = css.match(new RegExp('\\n' + sel.replace(/[.]/g, '\\.') + ' \\{([^}]*)\\}'));
  assert.ok(m, `${sel} 규칙을 찾지 못했다`);
  return m[1];
};
assert.match(rule('.result-actions.result-actions-3'), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/, '결과 막대 칸이 글자 폭 아래로 줄지 않는다');
assert.match(rule('.receiver-actions-bar'), /grid-template-columns: repeat\(3, auto\);/, '받은 코스 막대 칸이 글자 폭대로 줄지 않는다');
assert.doesNotMatch(rule('.result-actions .btn-secondary,\n.result-actions .btn-primary'), /nowrap/, '결과 막대 단추 글자가 꺾이지 않는다');
assert.doesNotMatch(rule('.btn-receiver-action'), /nowrap/, '받은 코스 막대 단추 글자가 꺾이지 않는다');

console.log('test-action-bar-reflow: 통과');
