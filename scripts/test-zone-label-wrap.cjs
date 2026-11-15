// 지역 시트 동네 이름 줄바꿈 회귀 테스트(P-457): node scripts/test-zone-label-wrap.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const m = css.match(/\n\.zone-label \{([^}]*)\}/);
assert(m, '.zone-label 규칙이 없다');
// 말줄임으로 이름을 자르지 않는다
assert(!/text-overflow:\s*ellipsis/.test(m[1]), '.zone-label이 말줄임을 쓴다');
assert(!/white-space:\s*nowrap/.test(m[1]), '.zone-label이 줄바꿈을 막는다');
assert(/overflow-wrap:\s*anywhere/.test(m[1]), '.zone-label이 긴 낱말을 나누지 않는다');
console.log('ok zone label wrap');
