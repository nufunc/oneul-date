// 스팟 탐색 2열 카드 큰 글자 회귀 테스트(P-462): node scripts/test-discovery-cols2-large-text.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((x) => x.trim()), body: m[2] }));
const find = (sel, re) => rules.find((r) => r.sels.includes(sel) && re.test(r.body));
// 머리를 세로로 쌓아 업종이 이름 폭을 가져가지 않는다
assert(find('.discovery-card.cols-2 .discovery-card-header', /flex-direction:\s*column/), '2열 머리가 세로로 쌓이지 않는다');
// 이름은 두 줄까지 접는다
assert(find('.discovery-card.cols-2 .discovery-name-link', /-webkit-line-clamp:\s*2/), '2열 이름이 두 줄로 접히지 않는다');
// 라벨을 숨기는 컨테이너 쿼리는 rem 기준이라 글자 크기를 따른다
assert(/@container \(max-width: [\d.]+rem\) \{\s*\.discovery-card\.cols-2 \.action-label/.test(css), '2열 라벨 컨테이너 쿼리가 rem 기준이 아니다');
assert(!/@container \(max-width: 139px\)/.test(css), 'px 기준 컨테이너 쿼리가 남아 있다');
console.log('ok discovery cols2 large text');
