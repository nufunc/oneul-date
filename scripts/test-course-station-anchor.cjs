// 역명 질의 코스 앵커 회귀 테스트: node scripts/test-course-station-anchor.cjs
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 역 좌표(public/data/stations.json)와 스팟(public/data/spots.json)을 실제 파일로 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);

// 최상위 함수·변수 선언을 이름으로 모으고 generateCourse에서 닿는 것만 남긴다(DOM을 만지는 최상위 문장은 따라가지 않는다)
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const need = new Set();
const queue = ['generateCourse'];
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
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n')
  // 200번씩 만드는 이 테스트는 같은 후보 목록과 (스팟, 검색어) 판정을 되풀이하므로 두 결과를 저장해 시간을 줄인다
  .replace('function matchesSearchQuery(', 'function matchesSearchQueryUncached(')
  .replace('function getCandidates(', 'function getCandidatesUncached(')
  .concat(`
const candidateCache = new Map();
function getCandidates(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly) {
  const key = JSON.stringify([slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor && anchor.id, indoorOnly]);
  if (!candidateCache.has(key)) candidateCache.set(key, getCandidatesUncached(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly));
  return candidateCache.get(key);
}
const matchCache = new Map();
function matchesSearchQuery(spot, query) {
  const key = query + '\\0' + spot.id;
  if (!matchCache.has(key)) matchCache.set(key, matchesSearchQueryUncached(spot, query));
  return matchCache.get(key);
}`);

const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, getCandidates, getDistanceKm, setStations } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, getDistanceKm, setStations: (s) => { stationCoords = s; } };`,
)(rawSpots);
setStations(stations);

const stationDistance = (name, spot) =>
  spot.lat == null ? Infinity : Math.min(...stations[name].map(([lat, lng]) => getDistanceKm(lat, lng, spot.lat, spot.lng)));

// 같은 결과를 되풀이하려고 시드 난수를 쓴다
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const spotById = new Map(rawSpots.map((s) => [s.id, s]));
const open = rawSpots.filter((s) => !s.is_closed);
const RECENT_MAX = 100;
const SLOTS = ['day', 'evening', 'night'];

// 앱처럼 만든 코스의 스팟을 이력 맨 뒤에 더하고 100곳을 넘기면 앞에서 뺀다. 이력은 비우지 않고 이어 간다
// 코스에서 앵커 칸을 가리는 값은 밖으로 나오지 않으므로 역에서 가장 가까운 카드를 앵커로 본다(나머지 칸은 앵커 5km 안에서 고른다)
const run = (station, query, times, seed) => {
  const rng = mulberry(seed);
  let recent = [];
  const anchors = [];
  for (let i = 0; i < times; i++) {
    const steps = generateCourse(open, [...SLOTS], [], 'ALL', { rng, avoidIds: new Set(recent), searchQuery: query });
    const ids = steps.map((st) => st.spotId).filter((id) => id != null);
    assert.ok(ids.length > 0, `${query} ${i + 1}번째 코스가 비었다`);
    const cards = ids.map((id) => spotById.get(id));
    anchors.push(cards.reduce((best, s) => (stationDistance(station, s) < stationDistance(station, best) ? s : best)));
    recent = [...recent.filter((id) => !ids.includes(id)), ...ids].slice(-RECENT_MAX);
  }
  return anchors;
};
// 코스 앵커가 될 수 있는 스팟(켠 슬롯의 후보)만 센다. 모텔·의류점처럼 후보에서 빠지는 행은 가까워도 앵커가 될 수 없다
const eligible = [...new Map(SLOTS.flatMap((slot) => getCandidates(open, slot, [], 'ALL', [], [], null, false)).map((s) => [s.id, s])).values()];
// 역 1km 안 후보가 15곳 이상이면 1km, 아니면 가까운 순 15번째 후보까지의 거리
const anchorLimitKm = (name) => {
  const dists = eligible.map((s) => stationDistance(name, s)).filter(Number.isFinite).sort((a, b) => a - b);
  return Math.max(1, dists[14]);
};

for (const name of ['서면', '왕십리', '부산', '수원']) {
  const anchors = run(name, `${name}역`, 200, 146);
  const limit = anchorLimitKm(name);
  const far = anchors.filter((s) => stationDistance(name, s) > limit + 1e-9);
  assert.strictEqual(far.length, 0, `${name}역 앵커 200번 중 ${far.length}번이 역에서 ${limit.toFixed(2)}km 밖이다: ${far.slice(0, 3).map((s) => s.name).join(', ')}`);
  if (name === '서면') {
    const rural = anchors.filter((s) => /양평|홍천/.test(s.address || ''));
    assert.strictEqual(rural.length, 0, `서면역 앵커가 양평·홍천이다: ${rural.slice(0, 3).map((s) => s.name).join(', ')}`);
  }
}

// 왕십리역은 1km 안 스팟이 15곳 미만이라 이력이 쌓여도 30번째 코스까지 가까운 순 후보에서 앵커를 고른다(전국 무작위로 넘어가지 않는다)
const wangsimni = run('왕십리', '왕십리역', 30, 7);
assert.strictEqual(wangsimni.length, 30);
const wangsimniLimit = anchorLimitKm('왕십리');
assert.ok(wangsimni.every((s) => stationDistance('왕십리', s) <= wangsimniLimit + 1e-9), '왕십리역 30번째 코스까지 앵커가 가까운 순 후보 안이다');

console.log('test-course-station-anchor: 모두 통과');
