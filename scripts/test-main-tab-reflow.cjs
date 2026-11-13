// 첫 화면 탭 리플로 시험(P-402): node scripts/test-main-tab-reflow.cjs
// 글자 200%에서 스팟 탐색 탭이 화면 밖으로 밀리지 않도록
// 탭 단추가 글자 폭 아래로 줄고(min-width: 0) 안의 그림·글자·배지를 꺾을 수 있는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const m = css.match(/\n\.main-tab-btn \{([^}]*)\}/);
assert.ok(m, '.main-tab-btn 규칙을 찾지 못했다');
assert.match(m[1], /min-width: 0;/, '탭 단추가 글자 폭 아래로 줄지 않는다');
assert.match(m[1], /flex-wrap: wrap;/, '탭 단추 안 요소가 꺾이지 않는다');

console.log('test-main-tab-reflow: 통과');
