// 존 텍스트 대체 반경 가드 회귀 테스트(P-443): node scripts/test-zone-text-radius.cjs
// 텍스트 대체로만 걸리는 먼 장소는 존 밖, 가까운 장소와 area 정밀 일치와 좌표 없는 장소는 존 안인지 본다.
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

const z = (key) => zoneSelectionMatcher([key]);
const spot = (name, location, area, region, lat, lng) => ({ name, location, area, region, lat, lng });

const CASES = [
  ['울산 북구 송정은 해운대 존 밖(53.9km)', z('busan_haeundae'), spot('송정 박상진호수공원', '영남 북구', '북구', '영남', 35.6293, 129.3555), false],
  ['대구 남구 앞산카페거리는 서면 존 밖(87km)', z('busan_seomyeon'), spot('앞산카페거리', '영남 남구', '남구', '영남', 35.8336, 128.5838), false],
  ['서울 금천구 혜화동돈까스는 혜화 존 밖(16.9km)', z('hyehwa'), spot('혜화동돈까스', '서울 금천구', '금천구', '서울', 37.4728, 126.8996), false],
  ['서울 광진구 동대문곱창은 혜화 존 안(7.5km 이내)', z('hyehwa'), spot('동대문곱창', '서울 광진구', '광진구', '서울', 37.5450, 127.0700), true],
  ['area 정밀 일치는 반경 밖이어도 존 안', z('busan_haeundae'), spot('기장 먼바다 카페', '영남 기장군', '기장', '영남', 35.6293, 129.3555), true],
  ['좌표 없는 텍스트 대체 장소는 존 안', z('busan_haeundae'), spot('송정 박상진호수공원', '영남 북구', '북구', '영남', null, null), true],
  ['제주 애월 텍스트 대체 21km 장소는 존 안', z('jeju_aewol'), { ...spot('윗세오름 가는 길', '제주 제주시', '제주시', '제주', 33.3617, 126.5292), address: '제주 제주시 애월읍' }, true],
];
for (const [label, match, s, want] of CASES) assert.strictEqual(match(s), want, label);
console.log(`test-zone-text-radius: ok ${CASES.length}`);
