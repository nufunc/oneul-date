// 머리 줄바꿈 시험(P-399): node scripts/test-topbar-wrap.cjs
// 글자 200%나 글자 간격 덮어쓰기에서 머리 단추가 화면 밖으로 밀리지 않도록
// .topbar와 .topbar-actions가 줄을 넘길 수 있는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
assert.match(css, /\n\.topbar \{[^}]*flex-wrap: wrap;/, '머리가 줄을 넘기지 못한다');
assert.match(css, /\n\.topbar-actions \{[^}]*flex-wrap: wrap;/, '머리 단추 묶음이 줄을 넘기지 못한다');

console.log('test-topbar-wrap: 통과');
