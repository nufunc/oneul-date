// 동네 이름 검색 앵커 회귀 테스트(P-362): node scripts/test-zone-anchor.cjs
// '애월 맛집'처럼 존으로 인식되는 검색은 칸마다 일치 수가 가장 적은 칸을 앵커로 삼아, 외진 일치 한두 곳이 다시 추천 6번의 앵커로 고정됐다.
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실행하고,
// 합성 장소(실제 spots.json의 칸별 장소를 복제해 이름과 주소와 좌표만 바꾼 것)로 앵커가 뽑히는 곳을 단언한다
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
const need = new Set();
const queue = ['generateCourse', 'getCandidates', 'getDistanceKm', 'zoneKeysForQuery', 'ZONE_CENTERS'];
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
  // 마지막에 고른 앵커를 남겨 어느 장소가 앵커로 뽑혔는지 본다
  .replace('anchorSpot = anchor;', 'anchorSpot = anchor; lastAnchor = anchor;');

const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, getCandidates, getDistanceKm, zoneKeysForQuery, ZONE_CENTERS, getLastAnchor } = new Function(
  'rawSpotsData',
  `let lastAnchor = null;${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, getDistanceKm, zoneKeysForQuery, ZONE_CENTERS, getLastAnchor: () => lastAnchor };`,
)(rawSpots);

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const QUERY = '애월';
const zoneKeys = zoneKeysForQuery(QUERY);
assert.deepStrictEqual(zoneKeys, ['jeju_aewol'], '검색어가 애월 존으로 인식돼야 한다');
const center = ZONE_CENTERS.jeju_aewol;

// 칸마다 앱이 후보로 쓰는 실제 장소 12곳을 틀로 삼는다(분류와 영업 시간이 그대로라 거름을 통과한다)
const open = rawSpots.filter((s) => !s.is_closed);
const SLOTS = ['day', 'evening', 'night'];
const templates = {};
for (const slot of SLOTS) {
  templates[slot] = getCandidates(open, slot, ['SEOUL'], 'ALL', [], [], null, false)
    .filter((s) => s.lat != null && s.lng != null)
    .slice(0, 12);
  assert.ok(templates[slot].length >= 12, `${slot} 틀 장소가 모자란다`);
}
let nextId = 9_100_000_000_000;
// 애월 중심에서 북쪽으로 northKm 떨어진 곳에 index번째로 놓는다. 이름에 '애월'이 들어 검색어에 일치한다
const make = (slot, index, northKm) => {
  const t = templates[slot][index % templates[slot].length];
  return {
    ...t,
    id: nextId++,
    name: `애월${slot}${index}`,
    address: '제주특별자치도 제주시 애월읍 테스트로',
    location: '제주 애월',
    area: '애월',
    lat: center.lat + northKm / 111 + index * 0.0005,
    lng: center.lng,
  };
};
const cluster = (counts, northKm = 0) =>
  Object.entries(counts).flatMap(([slot, n]) => Array.from({ length: n }, (_, i) => make(slot, i, northKm)));

// 다시 추천 6번: 직전 코스의 장소를 이력으로 이어 가며 앵커를 모은다
const anchorsOver = (all, runs = 6, seed = 1) => {
  const rng = mulberry(seed);
  let recent = [];
  const anchors = [];
  for (let i = 0; i < runs; i++) {
    const steps = generateCourse(all, SLOTS, [], 'ALL', { rng, avoidIds: new Set(recent), searchQuery: QUERY, zoneFromQuery: true }, zoneKeys);
    assert.ok(steps.every((st) => st.spotId != null), `${i + 1}번째 코스에 빈 칸이 생겼다`);
    anchors.push(getLastAnchor());
    recent = [...recent, ...steps.map((st) => st.spotId)].slice(-100);
  }
  return anchors;
};
const km = (s) => getDistanceKm(center.lat, center.lng, s.lat, s.lng);

// (a) 밤 칸의 일치가 동네 밖 8km 한 곳뿐(가장 적은 칸)이어도 그곳은 앵커가 되지 않고, 앵커가 모두 5km 안에서 3곳 이상 돈다
{
  const outlier = make('night', 0, 8);
  const all = [...cluster({ day: 8, evening: 8 }), outlier];
  for (let seed = 1; seed <= 20; seed++) {
    const anchors = anchorsOver(all, 6, seed);
    assert.ok(anchors.every((a) => a.id !== outlier.id), `(a) 시드 ${seed}: 동네 밖 장소가 앵커가 됐다`);
    assert.ok(anchors.every((a) => km(a) <= 5), `(a) 시드 ${seed}: 앵커가 5km 밖이다`);
    assert.ok(new Set(anchors.map((a) => a.id)).size >= 3, `(a) 시드 ${seed}: 앵커가 3곳 이상 돌아야 한다`);
  }
}

// (b) 동네 중심 5km 안 일치가 어느 칸에도 없으면 거르지 않고 종전처럼 밖 장소가 앵커가 된다(빈 코스가 되지 않는다)
{
  const all = cluster({ day: 3, evening: 3, night: 3 }, 8);
  const anchors = anchorsOver(all, 3);
  assert.ok(anchors.every((a) => a && km(a) > 5), '(b) 5km 안 일치가 없으면 밖 장소가 앵커여야 한다');
}

// (c) 저녁 일치가 1곳(가장 적은 칸)이어도 그 곳이 이력에 들었고 다른 칸에 이력 밖 후보가 있으면 그 칸을 건너뛰고 다른 칸에서 앵커를 고른다
{
  const lone = make('evening', 0, 0);
  const all = [...cluster({ day: 8, night: 8 }), lone];
  const fresh = generateCourse(all, SLOTS, [], 'ALL', { rng: mulberry(1), avoidIds: new Set(), searchQuery: QUERY, zoneFromQuery: true }, zoneKeys);
  assert.ok(fresh.every((st) => st.spotId != null));
  assert.strictEqual(getLastAnchor().id, lone.id, '(c) 이력이 없으면 일치가 가장 적은 저녁 칸이 앵커여야 한다');
  for (let seed = 1; seed <= 20; seed++) {
    generateCourse(all, SLOTS, [], 'ALL', { rng: mulberry(seed), avoidIds: new Set([lone.id]), searchQuery: QUERY, zoneFromQuery: true }, zoneKeys);
    assert.notStrictEqual(getLastAnchor().id, lone.id, `(c) 시드 ${seed}: 이력에 든 칸이 다시 앵커가 됐다`);
  }
}

// (d) 모든 칸의 일치가 이력에 들었으면 종전 규칙대로 가장 적은 칸이 앵커가 되고 코스는 만들어진다
{
  const lone = make('evening', 0, 0);
  const all = [...cluster({ day: 4, night: 4 }), lone];
  const steps = generateCourse(
    all,
    SLOTS,
    [],
    'ALL',
    { rng: mulberry(1), avoidIds: new Set(all.map((s) => s.id)), searchQuery: QUERY, zoneFromQuery: true },
    zoneKeys,
  );
  assert.ok(steps.every((st) => st.spotId != null), '(d) 빈 칸이 생겼다');
  assert.strictEqual(getLastAnchor().id, lone.id, '(d) 전부 이력이면 종전처럼 일치가 가장 적은 칸이 앵커여야 한다');
}

// (e) 실제 데이터 '애월 맛집': 다시 추천 6번의 앵커가 서로 다른 3곳 이상이고 모두 애월 중심 5km 안이다
{
  const key = zoneKeysForQuery('애월 맛집');
  assert.deepStrictEqual(key, ['jeju_aewol']);
  const rng = mulberry(7);
  let recent = [];
  const anchors = [];
  for (let i = 0; i < 6; i++) {
    const steps = generateCourse(open, SLOTS, [], 'ALL', { rng, avoidIds: new Set(recent), searchQuery: '애월 맛집', zoneFromQuery: true }, key);
    anchors.push(getLastAnchor());
    recent = [...recent, ...steps.map((st) => st.spotId).filter(Boolean)].slice(-100);
  }
  assert.ok(new Set(anchors.map((a) => a.id)).size >= 3, '(e) 앵커가 3곳 이상이어야 한다');
  assert.ok(anchors.every((a) => km(a) <= 5), `(e) 앵커가 5km 밖이다: ${anchors.map((a) => `${a.name} ${km(a).toFixed(1)}`)}`);
}

// (f) 실제 데이터 '태안 카페': 존 중심 5km 안 일치가 없어도 앵커를 못 고르지 않고 코스가 만들어진다
{
  const key = zoneKeysForQuery('태안 카페');
  assert.ok(key.length > 0, '(f) 태안이 존으로 인식돼야 한다');
  const steps = generateCourse(open, SLOTS, [], 'ALL', { rng: mulberry(7), avoidIds: new Set(), searchQuery: '태안 카페', zoneFromQuery: true }, key);
  assert.ok(steps.every((st) => st.spotId != null), '(f) 빈 칸이 생겼다');
  assert.ok(getLastAnchor(), '(f) 앵커가 있어야 한다');
}

console.log('test-zone-anchor: ok');
