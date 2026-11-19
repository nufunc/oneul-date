// 칸 후보 중 영업시간 있는 곳 우선 회귀 테스트: node scripts/test-course-known-hours.cjs
// 같은 근접 단계 안에 영업시간 있는 후보와 없는 후보가 섞이면 있는 쪽을 뽑고, 있는 후보가 없으면 없는 쪽으로 칸을 채운다(P-531).
// pickNearRandom, generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 TypeScript로 변환해 실행한다
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
const queue = ['generateCourse', 'pickNearRandom', 'hasNoHoursInfo'];
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
  .join('\n');
const { generateCourse, pickNearRandom, hasNoHoursInfo } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, pickNearRandom, hasNoHoursInfo };`,
)([]);

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const HOURS = { 영업시간: '매일 00:00 ~ 23:59' };
let nextId = 1;
const spot = (slot, km, hours, category = { day: '카페', evening: '한식', night: '와인바' }[slot]) => ({
  id: nextId++, name: `장소${nextId}`, category, summary: '', signature_items: [], mood_tags: [], region: '서울', area: '마포구',
  address: '서울 마포구 어딘가', slot, lat: 37.55 + km / 111, lng: 126.92, business_hours: hours ? HOURS : null, is_24h: false,
});

// (a) 근접 단계 안에서 영업시간 있는 후보만 뽑힌다. 없는 후보가 더 가까워도 같은 단계면 뒤로 간다
const anchor = spot('day', 0, true);
const known = [spot('evening', 0.5, true), spot('evening', 0.9, true)];
const unknown = Array.from({ length: 10 }, (_, i) => spot('evening', 0.1 + i * 0.05, false));
for (let seed = 1; seed <= 200; seed++) {
  const chosen = pickNearRandom([...unknown, ...known], anchor, mulberry(seed));
  assert.ok(!hasNoHoursInfo(chosen), `seed ${seed}: 영업시간 없는 ${chosen.name}을 뽑았다`);
}
// (a2) 있는 후보 둘이 모두 뽑혀 무작위성이 남는다
const seen = new Set(Array.from({ length: 100 }, (_, s) => pickNearRandom([...unknown, ...known], anchor, mulberry(s + 1)).id));
assert.strictEqual(seen.size, 2, `영업시간 있는 후보 두 곳이 모두 뽑히지 않았다: ${[...seen]}`);

// (b) 영업시간 있는 후보가 없으면 없는 후보로 채운다
for (let seed = 1; seed <= 50; seed++) {
  assert.ok(pickNearRandom(unknown, anchor, mulberry(seed)), `seed ${seed}: 영업시간 있는 후보가 없을 때 칸이 비었다`);
  assert.ok(pickNearRandom(unknown, null, mulberry(seed)), `seed ${seed}: 앵커 없이 칸이 비었다`);
}

// (c) 거리 단계가 먼저다: 1.5km 단계에 없는 후보만 있으면 먼 영업시간 있는 후보로 넘어가지 않는다
const farKnown = spot('evening', 4.5, true);
const nearUnknown = Array.from({ length: 10 }, (_, i) => spot('evening', 0.2 + i * 0.1, false));
for (let seed = 1; seed <= 50; seed++) {
  const chosen = pickNearRandom([...nearUnknown, farKnown], anchor, mulberry(seed));
  assert.notStrictEqual(chosen.id, farKnown.id, `seed ${seed}: 거리 단계를 건너 4.5km 밖 후보를 뽑았다`);
}

// (d) generateCourse 전체 경로: 칸마다 섞인 후보에서 영업시간 있는 곳으로 채우고, 없는 칸도 비우지 않는다
const all = [
  ...Array.from({ length: 6 }, (_, i) => spot('day', i * 0.2, i < 2)),
  ...Array.from({ length: 6 }, (_, i) => spot('evening', i * 0.2, i < 2)),
  ...Array.from({ length: 6 }, (_, i) => spot('night', i * 0.2, false)),
];
const byId = new Map(all.map((s) => [s.id, s]));
for (let seed = 1; seed <= 100; seed++) {
  const steps = generateCourse(all, ['day', 'evening', 'night'], ['SEOUL'], 'ALL', { rng: mulberry(seed) });
  for (const st of steps) {
    assert.ok(st.spotId !== null, `seed ${seed}: ${st.slot} 칸이 비었다`);
    const s = byId.get(st.spotId);
    if (st.slot !== 'night') assert.ok(!hasNoHoursInfo(s), `seed ${seed}: ${st.slot} 칸이 영업시간 없는 ${s.name}을 골랐다`);
  }
}
console.log('OK test-course-known-hours');
