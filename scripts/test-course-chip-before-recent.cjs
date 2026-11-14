// 칩 필터와 최근 노출 제외 순서 시험(P-434): node scripts/test-course-chip-before-recent.cjs
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실제 spots.json으로 실행한다.
// 스페셜 칩을 켠 칸의 스페셜 후보가 모두 최근 노출 이력에 들어도 스페셜 아닌 이력 밖 후보로 넘어가지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const roots = ['generateCourse', 'getCandidates', 'isSpecialDiningSpot', 'deduplicateSpotList'];
const need = new Set();
const queue = [...roots];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name) || !decls.has(name)) continue;
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
const f = new Function('rawSpotsData', `${ts.transpile(code, { target: 'es2022' })};return { ${roots.join(', ')} };`)([]);

const all = f.deduplicateSpotList(JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8')));
const byId = new Map(all.map((s) => [s.id, s]));
const slots = ['day', 'evening', 'night'];

// 지역마다 칸별 스페셜 후보를 모두 이력에 넣고 짠다. 스페셜 후보가 있는 칸은 스페셜이어야 한다
let checked = 0;
for (const region of ['SEOUL', 'YEONGNAM', 'JEJU', 'GANGWON']) {
  const avoid = new Set();
  const hasSpecial = {};
  for (const slot of slots) {
    const special = f.getCandidates(all, slot, [region], 'ALL', [], [], null, false).filter(f.isSpecialDiningSpot);
    hasSpecial[slot] = special.length > 0;
    special.forEach((s) => avoid.add(s.id));
  }
  for (let i = 0; i < 4; i++) {
    const course = f.generateCourse(all, [...slots], [region], 'ALL', { avoidIds: avoid, budgetFilter: 'LUXURY' });
    for (const st of course) {
      if (!hasSpecial[st.slot] || !st.spotId) continue;
      checked++;
      const spot = byId.get(st.spotId);
      assert.ok(f.isSpecialDiningSpot(spot), `${region} ${st.slot} 칸이 이력 밖 스페셜 아닌 곳(${spot.name})으로 넘어갔다`);
    }
  }
}
assert.ok(checked > 20, `확인한 칸이 너무 적다: ${checked}`);

// 이력 밖 스페셜 후보가 있으면 이력 안 스페셜 후보를 쓰지 않는다(최근 노출 제외는 칩 통과 후보 안에서 건다)
const seoulDay = f.getCandidates(all, 'day', ['SEOUL'], 'ALL', [], [], null, false).filter(f.isSpecialDiningSpot);
assert.ok(seoulDay.length > 2, '서울 낮 스페셜 후보가 부족하다');
const keep = seoulDay[0].id;
const avoid2 = new Set(seoulDay.filter((s) => s.id !== keep).map((s) => s.id));
for (let i = 0; i < 4; i++) {
  const course = f.generateCourse(all, ['day'], ['SEOUL'], 'ALL', { avoidIds: avoid2, budgetFilter: 'LUXURY' });
  assert.strictEqual(course[0].spotId, keep, '이력 밖 스페셜 후보를 두고 이력 안 후보를 골랐다');
}

console.log('test-course-chip-before-recent: 통과');
