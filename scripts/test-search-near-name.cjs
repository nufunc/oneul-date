// 검색 0건일 때 한 글자 틀린 이름을 결과로 내는 근사 이름 시험(P-341): node scripts/test-search-near-name.cjs
// isNearNameMatch와 filterDiscoverySpots와 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실행하고,
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
const queue = ['isNearNameMatch', 'filterDiscoverySpots', 'deduplicateSpotList', 'isCourseEligible'];
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
for (const name of ['isNearNameMatch', 'filterDiscoverySpots']) assert.ok(decls.has(name), `src/main.ts에 ${name}가 없다`);
const code = [...new Set([...need].filter((n) => decls.has(n)).map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');

const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const state = { regions: [], subZones: [], spotCategory: 'ALL', indoorOnly: false, savedOnly: false, savedSpotIds: new Set(), moodPreset: null, budgetFilter: 'ALL' };
const m = new Function(
  'rawSpotsData', 'state', '__st',
  `${ts.transpile(code, { target: 'es2022' })};stationCoords=__st;return { isNearNameMatch, filterDiscoverySpots, deduplicateSpotList, isCourseEligible };`,
)(rawSpots, state, stations);

const candidates = m.deduplicateSpotList(rawSpots.filter((s) => !s.is_closed && m.isCourseEligible(s)));

// 0건 오타 검색은 근사 이름 장소를 낸다
for (const [q, want] of [['스타필트 하남', '스타필드 하남'], ['여이도 한강공원', '여의도 한강공원'], ['블루가든아카이부', '블루가든아카이브']]) {
  const r = m.filterDiscoverySpots(candidates, q);
  assert.strictEqual(r.nearName, true, `${q}는 근사 결과여야 한다`);
  assert.ok(r.matchedSpots.some((s) => s.name.replace(/\s+/g, '') === want.replace(/\s+/g, '')), `${q}의 결과에 ${want}가 없다`);
}

// 정상 검색 결과가 있으면 근사 경로를 타지 않는다
for (const q of ['스타필드 하남', '여의도 한강공원', '성수 카페']) {
  const r = m.filterDiscoverySpots(candidates, q);
  assert.strictEqual(r.nearName, false, `${q}는 근사 경로를 타면 안 된다`);
  assert.ok(r.matchedSpots.length > 0, `${q}는 정상 결과가 있어야 한다`);
}

// 판정: 4글자 이하, 숫자만 다른 이름, 같은 이름, 길이가 다른 이름, 초성도 중성도 다른 글자는 거짓
const spot = (name) => ({ name });
assert.strictEqual(m.isNearNameMatch(spot('스타필드 하남'), '스타필트 하남'), true);
assert.strictEqual(m.isNearNameMatch(spot('스타필드'), '스타필트'), false, '4글자 이하');
assert.strictEqual(m.isNearNameMatch(spot('맛집 2호점'), '맛집 1호점'), false, '숫자만 다름');
assert.strictEqual(m.isNearNameMatch(spot('스타필드 하남'), '스타필드 하남'), false, '같은 이름');
assert.strictEqual(m.isNearNameMatch(spot('스타필드 하남점'), '스타필트 하남'), false, '길이 다름');
assert.strictEqual(m.isNearNameMatch(spot('스타필드 하남'), '스타필간 하남'), false, '초성도 중성도 다른 글자');
assert.strictEqual(m.isNearNameMatch(spot('스타필드 하남'), '스타필드 하남시'), false);
assert.strictEqual(m.isNearNameMatch(spot('ABCDE'), 'ABCDF'), false, '한글 음절이 아님');

console.log('test-search-near-name: ok');
