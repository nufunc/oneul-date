// 지역 칩 코스 제목의 동네 이름 시험(P-516): node scripts/test-course-title-chip-area.cjs
// 칩을 켠 코스도 장소로 정한 동네가 칩 이름과 다르면 `서울 · 마곡`처럼 붙이고, 흩어진 코스는 칩 이름만 두는지 본다.
// courseTitle과 그 함수가 부르는 선언을 src/main.ts에서 떼어 실제 spots.json으로 실행한다
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
const queue = ['courseTitle'];
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
const pick = (re, n) => spots.filter((s) => re.test(s.address || '')).slice(0, n);
const mapo = pick(/^서울\S* 마포구/, 2);
const gangseo = pick(/^서울\S* 강서구/, 2);
const scattered = [...pick(/^서울\S* 노원구/, 1), ...pick(/^서울\S* 중구/, 1), ...pick(/^서울\S* 성동구/, 1), ...pick(/^서울\S* 강서구/, 1)];
const haeundae = pick(/^부산\S* 해운대구/, 2);
const all = [...mapo, ...gangseo, ...scattered, ...haeundae];
assert.strictEqual(all.length, 10, '시험 장소를 다 찾지 못했다');
const spotById = new Map(all.map((s) => [s.id, s]));
const courseTitle = new Function('spotById', `${js}\nreturn courseTitle;`)(spotById);
const steps = (list) => list.map((s) => ({ spotId: s.id }));
const seoul = { regions: ['SEOUL'], subZones: [], mood: 'ALL', searchQuery: '' };

// 한 동네 코스는 칩 이름 뒤에 동네 이름. 칩과 겹치는 시 이름(서울)은 떼고 붙인다
const mapoTitle = courseTitle(seoul, steps(mapo));
const gangseoTitle = courseTitle(seoul, steps(gangseo));
assert.match(mapoTitle, /^서울 · \S/, `마포구 코스 제목: ${mapoTitle}`);
assert.ok(!mapoTitle.startsWith('서울 · 서울'), `칩 이름이 겹친다: ${mapoTitle}`);
// 같은 칩, 다른 동네 코스는 제목이 다르다(저장 목록 이름 중복, P-514)
assert.notStrictEqual(mapoTitle, gangseoTitle, '같은 칩 두 동네 코스 제목이 같다');
// 흩어진 코스는 칩 이름만
assert.strictEqual(courseTitle(seoul, steps(scattered)), '서울', '흩어진 코스 제목에 동네 이름이 붙었다');
// 장소가 없으면 칩 이름만
assert.strictEqual(courseTitle(seoul, []), '서울');
// 칩과 다른 시 이름은 떼지 않는다
assert.match(courseTitle({ ...seoul, regions: ['YEONGNAM'] }, steps(haeundae)), /^영남 · 부산 해운대/);
// 테마 칩은 동네 이름 뒤에 붙는다
assert.match(courseTitle({ ...seoul, categoryKey: 'CAFE' }, steps(mapo)), new RegExp(`^${mapoTitle} · \\S+ `));

console.log(`test-course-title-chip-area: 통과 (${mapoTitle} / ${gangseoTitle})`);
