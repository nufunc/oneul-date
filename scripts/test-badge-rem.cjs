// 휴무·영업시간 배지가 브라우저 글자 크기 설정을 따르는지(P-456): node scripts/test-badge-rem.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const rule = (sel) => {
  const i = css.indexOf(`${sel} {`);
  assert(i >= 0, `${sel} 규칙이 없다`);
  return css.slice(i, css.indexOf('}', i));
};
assert.match(rule('.badge-meta'), /font-size: 0\.6875rem;/, '영업시간 배지가 px이다');
assert.match(rule('.spot-closed-badge'), /font-size: 0\.6875rem;/, '정기휴무 배지가 px이다');
const floating = rule('.discovery-badge-closed,\n.badge-closed-floating');
assert.match(floating, /font-size: 0\.625rem;/, '썸네일 위 휴무 배지가 px이다');
assert.match(floating, /white-space: normal;/, '썸네일 위 휴무 배지가 커질 때 줄바꿈하지 않는다');
assert.match(floating, /max-width: calc\(100% - 16px\);/, '썸네일 위 휴무 배지가 썸네일 밖으로 나간다');
console.log('ok badge rem');
