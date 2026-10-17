// 스팟 탐색 0건 화면의 지역어·나머지 말 버튼 테스트: node scripts/test-discovery-empty-alternatives.cjs
// emptySearchAlternatives와 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실행하고,
// 스팟(public/data/spots.json)과 역 좌표(public/data/stations.json)를 실제 파일로 쓴다. 필터 상태는 앱 기본값이다
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
// state는 localStorage를 읽으므로 떼어 오지 않고 기본값으로 넣는다
decls.delete('state');
const need = new Set();
const queue = ['emptySearchAlternatives', 'filterDiscoverySpots', 'deduplicateSpotList', 'isCourseEligible'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  if (decls.has(name)) walk(decls.get(name));
}
for (const name of ['emptySearchAlternatives', 'filterDiscoverySpots']) assert.ok(decls.has(name), `src/main.ts에 ${name}가 없다`);
const code = [...new Set([...need].filter((n) => decls.has(n)).map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');

const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const state = { regions: [], subZones: [], spotCategory: 'ALL', indoorOnly: false, savedOnly: false, savedSpotIds: new Set(), moodPreset: null, budgetFilter: 'ALL' };
const m = new Function(
  'rawSpotsData', 'state', '__st',
  `${ts.transpile(code, { target: 'es2022' })};stationCoords=__st;return { emptySearchAlternatives, filterDiscoverySpots, deduplicateSpotList, isCourseEligible };`,
)(rawSpots, state, stations);

const candidates = m.deduplicateSpotList(rawSpots.filter((s) => !s.is_closed && m.isCourseEligible(s)));
const count = (q) => m.filterDiscoverySpots(candidates, q).matchedSpots.length;

const cases = [
  ['연남 파스타', ['연남', '파스타']],
  ['양양 서핑', ['양양', '서핑']],
  ['경북 서핑', ['경북', '서핑']],
  ['쿼크즈블랑', []],
];
for (const [q, parts] of cases) {
  assert.strictEqual(count(q), 0, `${q}는 0건이어야 시험이 성립한다`);
  const alts = m.emptySearchAlternatives(candidates, q);
  const expected = parts.map((p) => ({ query: p, count: count(p) })).filter((a) => a.count > 0);
  assert.deepStrictEqual(alts.map(({ query, count: n }) => ({ query, count: n })), expected, q);
  assert.strictEqual(alts.length, parts.length, `${q}의 버튼 수`);
  // 첫 버튼은 지역어 버튼이라 '스팟'을 붙인다
  alts.forEach((a, i) => assert.strictEqual(a.label, i === 0 ? `'${a.query}' 스팟 ${a.count.toLocaleString('ko-KR')}곳 보기` : `'${a.query}' ${a.count.toLocaleString('ko-KR')}곳 보기`));
  console.log(q, '→', alts.map((a) => a.label).join(' / ') || '버튼 없음');
}
// '서울 한옥 카페'는 0건이 아니어서(나머지 말의 낱말 하나만 맞아도 걸린다) 0건 화면과 버튼이 나오지 않는다. 광역 권역명 갈래는 '경북 서핑'으로 본다
assert.ok(count('서울 한옥 카페') > 0, '서울 한옥 카페');
// 동네 접미사를 붙여 친 '연남동 파스타'도 나머지 말은 '파스타'다
assert.deepStrictEqual(m.emptySearchAlternatives(candidates, '연남동 파스타').map((a) => a.query), ['연남', '파스타']);
// 0건인 갈래는 버튼을 그리지 않는다
assert.deepStrictEqual(m.emptySearchAlternatives(candidates, '연남 쿼크즈블랑').map((a) => a.query), ['연남']);
console.log('test-discovery-empty-alternatives ok');
