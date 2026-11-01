// 360px 미만 완성 버튼 한 줄 시험(P-261): node scripts/test-generate-button-narrow.cjs
// src/style.css의 @media (max-width: 359px) 블록 안에 #btn-generate 좌우 여백 10px과 글자 0.9rem이 있는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 360px 미만 미디어 블록 본문을 모두 모은다. 블록 안 규칙은 한 단계만 중첩된다고 본다
const blocks = [...css.matchAll(/@media \(max-width: 359px\) \{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => m[1]);
assert.ok(blocks.length > 0, '@media (max-width: 359px) 블록이 없다');

const body = blocks
  .map((b) => b.match(/(?:^|\})\s*#btn-generate \{([^}]*)\}/))
  .find(Boolean)?.[1];
assert.ok(body, '360px 미만 블록에 #btn-generate 규칙이 없다');

const has = (decl) => new RegExp('(?:^|;|\\s)' + decl.replace(/[-.]/g, '\\$&').replace(/ /g, '\\s*') + '\\s*;').test(body);
assert.ok(has('padding-left: 10px'), '#btn-generate 왼쪽 여백이 10px이 아니다');
assert.ok(has('padding-right: 10px'), '#btn-generate 오른쪽 여백이 10px이 아니다');
assert.ok(has('font-size: 0.9rem'), '#btn-generate 글자가 0.9rem이 아니다');

// 받는 동안의 채움(P-257)은 그대로 남는다
assert.ok(/#btn-generate\[aria-busy="true"\] \{[^}]*background-image: var\(--load-fill\)/.test(css), '받는 동안 버튼 채움 규칙이 사라졌다');

console.log('test-generate-button-narrow: 통과');
