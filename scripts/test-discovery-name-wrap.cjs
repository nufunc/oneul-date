// 탐색 3열·2열 카드 상호명 두 줄 시험(P-259, P-462): node scripts/test-discovery-name-wrap.cjs
// src/style.css에서 3열과 2열 카드는 상호명을 두 줄까지 접고, 기본 규칙과 5열은 한 줄 말줄임을 유지하는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 선택자 목록에 그 선택자가 든 규칙 본문을 모두 이어 읽는다. 미디어 쿼리 안 규칙은 그 쿼리 줄이 선택자에 섞여 잡히지 않는다
function rule(selector) {
  const ms = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((r) => r[1].split(',').map((x) => x.trim()).includes(selector));
  assert.ok(ms.length, `규칙이 없다: ${selector}`);
  return ms.map((r) => r[2]).join(';');
}
const has = (body, decl) => new RegExp('(?:^|;|\\s)' + decl.replace(/[-:]/g, '\\$&').replace(/ /g, '\\s*') + '\\s*;').test(body);

for (const cols of ['cols-3', 'cols-2']) {
  const name = rule(`.discovery-card.${cols} .discovery-name`);
  assert.ok(has(name, '-webkit-line-clamp: unset'), `${cols} .discovery-name의 한 줄 제한이 풀리지 않았다`);

  const link = rule(`.discovery-card.${cols} .discovery-name-link`);
  assert.ok(has(link, 'display: -webkit-box'), `${cols} 상호명 버튼이 -webkit-box가 아니다`);
  assert.ok(has(link, '-webkit-box-orient: vertical'), `${cols} 상호명 버튼에 세로 방향이 없다`);
  assert.ok(has(link, '-webkit-line-clamp: 2'), `${cols} 상호명 버튼이 두 줄 제한이 아니다`);
  assert.ok(has(link, 'white-space: normal'), `${cols} 상호명 버튼이 줄바꿈을 허용하지 않는다`);
  assert.ok(has(link, 'overflow-wrap: anywhere'), `${cols} 상호명 버튼에 긴 낱말 줄바꿈이 없다`);
}

// 기본 버튼은 한 줄 말줄임 그대로다
const link = rule('.discovery-name-link');
assert.ok(has(link, 'white-space: nowrap'), '기본 상호명 버튼의 한 줄 제한이 사라졌다');
assert.ok(has(link, 'text-overflow: ellipsis'), '기본 상호명 버튼의 말줄임이 사라졌다');

// 두 줄 규칙이 5열로 새지 않는다
assert.ok(!/cols-5[^{,]*\.discovery-name-link[^{]*\{[^}]*-webkit-line-clamp:\s*2/.test(css), '5열 상호명에 두 줄 제한이 걸렸다');

console.log('test-discovery-name-wrap: 통과');
