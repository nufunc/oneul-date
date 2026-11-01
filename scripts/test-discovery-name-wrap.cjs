// 탐색 3열 카드 상호명 두 줄 시험(P-259): node scripts/test-discovery-name-wrap.cjs
// src/style.css에서 3열 카드만 상호명을 두 줄까지 접고, 2열 기본과 5열은 한 줄 말줄임을 유지하는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 맨 앞 단독 규칙 본문만 읽는다. 선택자가 여럿 묶인 규칙과 미디어 쿼리 안 규칙은 잡히지 않는다
function rule(selector) {
  const m = css.match(new RegExp('^' + selector.replace(/[.:]/g, '\\$&') + ' \\{([^}]*)\\}', 'm'));
  assert.ok(m, `규칙이 없다: ${selector}`);
  return m[1];
}
const has = (body, decl) => new RegExp('(?:^|;|\\s)' + decl.replace(/[-:]/g, '\\$&').replace(/ /g, '\\s*') + '\\s*;').test(body);

const name3 = rule('.discovery-card.cols-3 .discovery-name');
assert.ok(has(name3, '-webkit-line-clamp: unset'), '3열 .discovery-name의 한 줄 제한이 풀리지 않았다');

const link3 = rule('.discovery-card.cols-3 .discovery-name-link');
assert.ok(has(link3, 'display: -webkit-box'), '3열 상호명 버튼이 -webkit-box가 아니다');
assert.ok(has(link3, '-webkit-box-orient: vertical'), '3열 상호명 버튼에 세로 방향이 없다');
assert.ok(has(link3, '-webkit-line-clamp: 2'), '3열 상호명 버튼이 두 줄 제한이 아니다');
assert.ok(has(link3, 'white-space: normal'), '3열 상호명 버튼이 줄바꿈을 허용하지 않는다');
assert.ok(has(link3, 'overflow-wrap: anywhere'), '3열 상호명 버튼에 긴 낱말 줄바꿈이 없다');

// 기본(2열) 버튼은 한 줄 말줄임 그대로다
const link = rule('.discovery-name-link');
assert.ok(has(link, 'white-space: nowrap'), '기본 상호명 버튼의 한 줄 제한이 사라졌다');
assert.ok(has(link, 'text-overflow: ellipsis'), '기본 상호명 버튼의 말줄임이 사라졌다');

// 두 줄 규칙이 3열 밖으로 새지 않는다
assert.ok(!/cols-(?:2|5)[^{]*\.discovery-name-link[^{]*\{[^}]*-webkit-line-clamp:\s*2/.test(css), '2열이나 5열 상호명에 두 줄 제한이 걸렸다');

console.log('test-discovery-name-wrap: 통과');
