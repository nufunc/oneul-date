// 대구 존 해운대구 오탐 회귀 테스트(P-442): node scripts/test-zone-daegu-haeundae.cjs
// location '부산 해운대구'의 '대구'가 대구 존 키워드에 걸리지 않는지, 대구 안 장소와 해운대 존은 그대로인지 본다.
// src/main.ts의 zoneSelectionMatcher와 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const need = new Set();
const queue = ['zoneSelectionMatcher'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const { zoneSelectionMatcher } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { zoneSelectionMatcher };`)();

const daegu = zoneSelectionMatcher(['daegu']);
const haeundae = zoneSelectionMatcher(['busan_haeundae']);
const spot = (name, location, area, region = '영남') => ({ name, location, area, region });

const CASES = [
  ['해운대구 장소는 대구 존 밖', daegu, spot('뮤즈온 해운대점', '부산 해운대구 중동', '해운대구', '부산'), false],
  ['location 영남 해운대구도 대구 존 밖', daegu, spot('달맞이 카페', '영남 해운대구', '해운대구'), false],
  ['해운대구의 대구탕집은 대구 존 밖', daegu, spot('속시원한대구탕', '영남 해운대구', '해운대구'), false],
  ['대구 중구 장소는 대구 존 안', daegu, spot('삼송빵집 동성로본점', '대구 중구 동성로3가', '중구'), true],
  ['이름에 대구가 있는 영남 남구 장소는 대구 존 안', daegu, spot('대구 안지랑 곱창골목', '영남 남구', '남구'), true],
  ['대구 중구의 대구탕집은 대구 존 안', daegu, spot('원조 대구탕', '대구 중구 동인동', '중구'), true],
  ['해운대구 장소는 해운대 존 안 그대로', haeundae, spot('달맞이 카페', '영남 해운대구', '해운대구'), true],
];
for (const [label, match, s, want] of CASES) assert.strictEqual(match(s), want, label);
console.log(`test-zone-daegu-haeundae: ok ${CASES.length}`);
