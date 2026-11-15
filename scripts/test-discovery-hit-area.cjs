// 스팟 탐색 3열·2열 카드 버튼 눌리는 영역 회귀 테스트(P-458, P-461): node scripts/test-discovery-hit-area.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const cols of ['cols-3', 'cols-2']) {
  for (const btn of ['btn-discovery-save', 'btn-discovery-action-build']) {
    const sel = `.discovery-card.${cols} .${btn}`;
    const after = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => m[1].split(',').map((x) => x.trim()).includes(`${sel}::after`));
    assert(after, `${sel}::after 적중 영역이 없다`);
    assert(/height:\s*44px/.test(after[2]) && /position:\s*absolute/.test(after[2]), `${sel}::after가 44px 절대 위치가 아니다`);
    const rel = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => m[1].split(',').map((x) => x.trim()).includes(sel) && /position:\s*relative/.test(m[2]));
    assert(rel, `${sel}가 ::after의 기준 위치가 아니다`);
  }
}
// 카드 본문 아래 여백이 적중 영역 넘침(3열 8px, 2열 6px)보다 커야 overflow: hidden에 잘리지 않는다
const body3 = css.match(/\.discovery-card\.cols-3 \.discovery-card-body \{\s*padding: (\d+)px (\d+)px (\d+)px;/);
assert(body3 && Number(body3[3]) >= 8, '3열 카드 본문 아래 여백이 8px보다 작다');
const body = css.match(/\n\.discovery-card-body \{[^}]*padding: (\d+)px (\d+)px (\d+)px;/);
assert(body && Number(body[3]) >= 6, '카드 본문 아래 여백이 6px보다 작다');
console.log('ok discovery hit area');
