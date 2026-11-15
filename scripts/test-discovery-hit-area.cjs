// 스팟 탐색 3열 카드 버튼 눌리는 영역 회귀 테스트(P-458): node scripts/test-discovery-hit-area.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const after = css.match(/\.discovery-card\.cols-3 \.btn-discovery-save::after,\s*\.discovery-card\.cols-3 \.btn-discovery-action-build::after \{([^}]*)\}/);
assert(after, '3열 카드 버튼의 ::after 적중 영역이 없다');
assert(/height:\s*44px/.test(after[1]), '적중 영역 높이가 44px이 아니다');
assert(/position:\s*absolute/.test(after[1]));
const rel = css.match(/\.discovery-card\.cols-3 \.btn-discovery-save,\s*\.discovery-card\.cols-3 \.btn-discovery-action-build \{([^}]*)\}/);
assert(rel && /position:\s*relative/.test(rel[1]), '버튼이 ::after의 기준 위치가 아니다');
// 카드 본문 아래 여백이 적중 영역 넘침(8px)보다 커야 overflow: hidden에 잘리지 않는다
const body = css.match(/\.discovery-card\.cols-3 \.discovery-card-body \{\s*padding: (\d+)px (\d+)px (\d+)px;/);
assert(body && Number(body[3]) >= 8, '카드 본문 아래 여백이 8px보다 작다');
console.log('ok discovery hit area');
