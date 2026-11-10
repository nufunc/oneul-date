// 기본 앵커 도달 거름 회귀 테스트(P-348): node scripts/test-course-anchor-reach.cjs
// 앵커가 될 칸(후보가 가장 적은 칸)의 장소가 다른 칸 후보에서 멀리 떨어져 있으면 그 칸이 15~20km 밖 장소로 채워졌다.
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 합성 장소(실제 spots.json의 낮·저녁·밤 장소를 복제해 좌표만 바꾼 것)로 앵커가 뽑히는 곳과 구간 거리를 단언한다
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
const queue = ['generateCourse', 'getCandidates', 'getDistanceKm'];
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
const { generateCourse, getCandidates, getDistanceKm, getLastAnchor } = new Function(
  'rawSpotsData',
  `let lastAnchor = null;${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, getDistanceKm, getLastAnchor: () => lastAnchor };`,
)(rawSpots);

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 칸마다 서울에서 앱이 후보로 쓰는 실제 장소 12곳을 틀로 삼는다(분류와 영업 시간이 그대로라 거름을 통과한다)
const open = rawSpots.filter((s) => !s.is_closed);
const templates = {};
for (const slot of ['day', 'evening', 'night']) {
  templates[slot] = getCandidates(open, slot, ['SEOUL'], 'ALL', [], [], null, false)
    .filter((s) => s.lat != null && s.lng != null)
    .slice(0, 12);
  assert.ok(templates[slot].length >= 12, `${slot} 틀 장소가 모자란다`);
}
let nextId = 9_000_000_000_000;
// 기준점(37.5, 127.0)에서 북쪽으로 northKm 떨어진 곳에 index번째로 놓는다. 같은 칸 장소끼리는 0.2km씩 띄운다
const make = (slot, index, northKm, tag) => {
  const t = templates[slot][index % templates[slot].length];
  return { ...t, id: nextId++, name: `${tag}${slot}${index}`, lat: 37.5 + northKm / 111 + index * 0.002, lng: 127.0 };
};
const cluster = (counts, northKm = 0, tag = 'c') =>
  Object.entries(counts).flatMap(([slot, n]) => Array.from({ length: n }, (_, i) => make(slot, i, northKm, tag)));
const legs = (steps, byId) => {
  const spots = steps.map((st) => byId.get(st.spotId));
  return spots.slice(1).map((s, i) => getDistanceKm(spots[i].lat, spots[i].lng, s.lat, s.lng));
};
const TIMES = 200;
const run = (all, assertEach) => {
  const byId = new Map(all.map((s) => [s.id, s]));
  for (let seed = 1; seed <= TIMES; seed++) {
    const steps = generateCourse(all, ['day', 'evening', 'night'], [], 'ALL', { rng: mulberry(seed) });
    assertEach(steps, byId, getLastAnchor(), seed);
  }
};

// (a) 밤 후보가 가장 적고 그중 한 곳이 40km 밖에 있으면 그곳은 앵커가 되지 않고 모든 구간이 5km 이하다
{
  const outlier = make('night', 5, 40, 'far');
  const all = [...cluster({ day: 8, evening: 8, night: 5 }), outlier];
  const anchors = new Set();
  run(all, (steps, byId, anchor, seed) => {
    assert.ok(steps.every((st) => st.spotId != null), `(a) 시드 ${seed}: 빈 칸이 생겼다`);
    assert.notStrictEqual(anchor.id, outlier.id, `(a) 시드 ${seed}: 외진 밤 장소가 앵커가 됐다`);
    anchors.add(anchor.id);
    const over = legs(steps, byId).filter((km) => km > 5);
    assert.strictEqual(over.length, 0, `(a) 시드 ${seed}: 5km 넘는 구간 ${over.map((k) => k.toFixed(1))}`);
  });
  assert.ok(anchors.size >= 4, `(a) 군집 밤 장소가 골고루 앵커가 돼야 한다(${anchors.size}곳)`);
}

// (b) 5km 안에는 없고 20km 안에는 있는 밤 장소(12km)만 남으면 그곳이 앵커로 쓰이고 20km 밖 밤 장소(40km)는 쓰이지 않는다
{
  const mid1 = make('night', 0, 12, 'mid');
  const mid2 = make('night', 1, 12, 'mid');
  const far = make('night', 2, 40, 'far');
  const all = [...cluster({ day: 8, evening: 8 }), mid1, mid2, far];
  const anchors = new Set();
  run(all, (steps, byId, anchor, seed) => {
    assert.ok(steps.every((st) => st.spotId != null), `(b) 시드 ${seed}: 빈 칸이 생겼다`);
    assert.notStrictEqual(anchor.id, far.id, `(b) 시드 ${seed}: 20km 밖 밤 장소가 앵커가 됐다`);
    anchors.add(anchor.id);
    const over = legs(steps, byId).filter((km) => km > 20);
    assert.strictEqual(over.length, 0, `(b) 시드 ${seed}: 20km 넘는 구간 ${over.map((k) => k.toFixed(1))}`);
  });
  assert.deepStrictEqual([...anchors].sort(), [mid1.id, mid2.id].sort(), '(b) 12km 밤 장소 둘 다 앵커로 쓰여야 한다');
}

// (c) 군집 없이 외진 밤 장소만 있으면(낮·저녁이 모두 40km 밖) 종전대로 그 장소가 앵커가 되고 코스가 만들어진다
{
  const far = make('night', 0, 40, 'far');
  const all = [...cluster({ day: 3, evening: 3 }), far];
  run(all, (steps, byId, anchor, seed) => {
    assert.strictEqual(steps.length, 3, `(c) 시드 ${seed}: 칸 수가 다르다`);
    assert.ok(steps.every((st) => st.spotId != null), `(c) 시드 ${seed}: 빈 칸이 생겼다`);
    assert.strictEqual(anchor.id, far.id, `(c) 시드 ${seed}: 외진 밤 장소가 앵커여야 한다`);
  });
}

// (d) 숙박 칸은 거름 대상이 아니다: 숙박 후보가 0곳이어도 낮·저녁·밤은 (a)처럼 5km 안에서 이어진다
{
  const outlier = make('night', 5, 40, 'far');
  const all = [...cluster({ day: 8, evening: 8, night: 5 }), outlier];
  const byId = new Map(all.map((s) => [s.id, s]));
  for (let seed = 1; seed <= TIMES; seed++) {
    const steps = generateCourse(all, ['day', 'evening', 'night', 'stay'], [], 'ALL', { rng: mulberry(seed) });
    assert.notStrictEqual(getLastAnchor().id, outlier.id, `(d) 시드 ${seed}: 외진 밤 장소가 앵커가 됐다`);
    const placed = steps.filter((st) => st.slot !== 'stay' && st.spotId != null);
    assert.strictEqual(placed.length, 3, `(d) 시드 ${seed}: 낮·저녁·밤이 모두 채워져야 한다`);
    assert.ok(legs(placed, byId).every((km) => km <= 5), `(d) 시드 ${seed}: 5km 넘는 구간`);
  }
}

console.log('course anchor reach tests passed');
