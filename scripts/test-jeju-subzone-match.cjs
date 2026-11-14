// 제주 세부존 매칭 회귀 테스트(P-430): node scripts/test-jeju-subzone-match.cjs
// area가 '제주시'나 '서귀포시'로만 잡히는 제주 행이 애월·한림, 구좌·성산 존에 텍스트로 걸리는지 본다.
// src/main.ts의 matchesZone과 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
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
const queue = ['matchesZone'];
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
const { matchesZone } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { matchesZone };`)();

const jeju = (name, location, area) => ({ id: 1, name, location, area, region: '제주', slot: 'day' });
const CASES = [
  ['제주시 애월 카페는 애월·한림 존', jeju('애월 바다카페', '제주 제주시 애월읍', '제주시'), 'jeju_aewol', true],
  ['서귀포시 성산 식당은 구좌·성산 존', jeju('성산 해녀의집', '제주 서귀포시 성산읍', '서귀포시'), 'jeju_gujwa', true],
  ['제주시 탑동 행은 애월·한림 존이 아님', jeju('탑동 횟집', '제주 제주시 탑동', '제주시'), 'jeju_aewol', false],
  ['제주시 행은 시 키워드로 시내 존', jeju('노형 카페', '제주 제주시 노형동', '제주시'), 'jeju_city', true],
  ['제주시 중문 언급 행은 중문·서귀포 존에 흡수되지 않음', jeju('중문식당 제주점', '제주 제주시 연동', '제주시'), 'jeju_jungmun', false],
  ['서귀포시 연동 언급 행은 시내 존에 흡수되지 않음', jeju('연동 국수', '제주 서귀포시 대정읍', '서귀포시'), 'jeju_city', false],
  ['다른 권역 시 단위 차단은 그대로', { id: 2, name: '공주 한옥', location: '충남 공주시', area: '공주시', region: '충청', slot: 'day' }, 'taean', false],
];
for (const [label, spot, zk, want] of CASES) assert.strictEqual(matchesZone(spot, [zk]), want, label);
console.log(`test-jeju-subzone-match: ok ${CASES.length}`);
