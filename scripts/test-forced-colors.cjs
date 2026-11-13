// 강제 색상 모드 시험(P-403): node scripts/test-forced-colors.cjs
// Windows 고대비에서 배경색이 지워져도 선택한 칩과 탭이 구별되도록
// forced-colors 블록이 aria-pressed와 aria-selected에 시스템 강조색을 거는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const blocks = [...css.matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
assert.ok(blocks.length > 0, '강제 색상 블록이 없다');
assert.match(blocks, /\[aria-pressed="true"\],\s*\[role="tab"\]\[aria-selected="true"\] \{[^}]*background: Highlight !important;[^}]*color: HighlightText !important;/, '선택 상태에 시스템 강조색을 걸지 않는다');

assert.match(blocks, /HighlightText !important;\s*\/\*[^*]*\*\/\s*forced-color-adjust: none;/, '선택한 칩 글자가 받침에 덮인다');

// 검색칸 초점 외곽선(P-404): 투명 외곽선이 강제 색상에서 보인다
const search = css.match(/\n\.search-input \{([^}]*)\}/);
assert.ok(search && /outline: 2px solid transparent;/.test(search[1]) && !/outline: none;/.test(search[1]), '검색칸 초점 외곽선을 지운다');

// 주요 단추 경계(P-405)
assert.match(blocks, /\.btn-primary \{[^}]*border: 2px solid ButtonText;/, '주요 단추 경계가 없다');

console.log('test-forced-colors: 통과');
