// 맞춤 코스 결과 제목 시험(P-280): node scripts/test-course-theme-title.cjs
// courseTitle과 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실행한다.
// 켠 테마 칩 이름을 적고, 고르지 않은 '모든 분위기'는 적지 않는지 본다
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
assert.ok(decls.has('courseTitle'), 'courseTitle이 없다');
// spotById는 앵커와 찜 제목에서만 쓰므로 빈 Map으로 넣는다
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
const courseTitle = new Function('spotById', `${js}\nreturn courseTitle;`)(new Map());

const evalCats = new Function(`${ts.transpileModule(decls.get('SPOT_EXPLORE_CATEGORIES').getText().replace(/^export\s+/, ''), {}).outputText}\nreturn SPOT_EXPLORE_CATEGORIES;`);
const cats = evalCats().filter((c) => c.key !== 'ALL');
assert.strictEqual(cats.length, 13, '테마 칩이 13개가 아니다');

const base = { regions: ['SEOUL'], subZones: [], mood: 'ALL', searchQuery: '' };
for (const c of cats) {
  assert.strictEqual(courseTitle({ ...base, categoryKey: c.key }, []), `서울 · ${c.emoji} ${c.label}`, `${c.key} 칩 제목`);
}
assert.strictEqual(courseTitle(base, []), '서울', '칩을 끈 제목에 고르지 않은 분위기가 붙는다');
assert.strictEqual(courseTitle({ ...base, categoryKey: 'ALL' }, []), '서울', '전체 칩 제목');
// 분위기를 고른 코스(오늘 추천 등)는 분위기 이름을 그대로 적는다
assert.match(courseTitle({ ...base, mood: 'romantic' }, []), /^서울 · \S/, '고른 분위기가 제목에서 빠졌다');
assert.ok(!courseTitle({ ...base, mood: 'romantic' }, []).includes('모든 분위기'));
// 검색어 제목이 테마 칩보다 앞선다
assert.strictEqual(courseTitle({ ...base, categoryKey: 'CAFE', searchQuery: '성수' }, []), '🔍 성수 코스');

console.log('test-course-theme-title: 통과');
