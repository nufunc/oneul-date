// 지역 칩 없이 만든 코스 제목 시험(P-506): node scripts/test-course-title-nochip.cjs
// 칩이 비었으면 「전국 어디서나」가 아니라 코스 장소로 정한 지역 이름이 제목이 되고, 칩을 고른 제목은 그대로인지 본다
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
const INJECTED = new Set(['spotById']);
const need = new Set();
const queue = ['courseTitle', 'courseAreaLabel'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text) && !INJECTED.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const spots = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'spots.json'), 'utf8'));
const seongsu = spots.filter((s) => /^서울\S* 성동구/.test(s.address || '')).slice(0, 3);
assert.strictEqual(seongsu.length, 3, '성동구 장소 셋을 찾지 못했다');
const spotById = new Map(seongsu.map((s) => [s.id, s]));
const { courseTitle, courseAreaLabel } = new Function('spotById', `${js}\nreturn { courseTitle, courseAreaLabel };`)(spotById);

const course = seongsu.map((s) => ({ spotId: s.id }));
const area = courseAreaLabel(seongsu);
assert.ok(area, '성동구 장소 셋의 지역 이름이 비었다');
const none = { regions: [], subZones: [], mood: 'ALL', searchQuery: '' };
assert.strictEqual(courseTitle(none, course), area, '칩 없는 제목이 장소 지역 이름이 아니다');
assert.ok(!courseTitle(none, course).includes('전국 어디서나'));
// 칩을 고른 제목은 칩 이름 그대로다
assert.strictEqual(courseTitle({ ...none, regions: ['SEOUL'] }, course), '서울', '칩을 고른 제목이 바뀌었다');
// 장소가 없으면 기존 대체 이름으로 떨어진다
assert.strictEqual(courseTitle(none, []), courseTitle(none, [{ spotId: null }]));
assert.ok(courseTitle(none, []).length > 0, '장소 없는 칩 없는 제목이 비었다');

console.log(`test-course-title-nochip: 통과 (${area})`);
