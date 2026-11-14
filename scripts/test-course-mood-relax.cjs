// 분위기 풀기 회귀 테스트(P-444): node scripts/test-course-mood-relax.cjs
// 분위기 코스에서 앵커 20km 안에 분위기 안 후보가 없으면 저녁 칸이 60km 밖 분위기 안 장소로 채워졌다.
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 합성 장소(실제 spots.json의 낮·저녁·밤 장소를 복제해 좌표와 분위기만 바꾼 것)로 저녁 칸이 고른 곳을 단언한다
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
  .join('\n');

const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, getCandidates, getDistanceKm } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, getDistanceKm };`,
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
const make = (slot, index, northKm, mood, tag) => {
  const t = templates[slot][index % templates[slot].length];
  return { ...t, id: nextId++, name: `${tag}${slot}${index}`, mood: [mood], lat: 37.5 + northKm / 111 + index * 0.002, lng: 127.0 };
};
const many = (slot, n, northKm, mood, tag) => Array.from({ length: n }, (_, i) => make(slot, i, northKm, mood, tag));

// 밤 칸 후보가 한 곳뿐이라 밤이 앵커가 된다. 낮은 앵커 옆, 분위기 안 저녁은 60km 밖이다
const base = [...many('night', 1, 0, 'active', 'anchor'), ...many('day', 6, 0.5, 'active', 'day'), ...many('evening', 6, 60, 'active', 'far')];
const nearOff = many('evening', 6, 1, 'healing', 'nearOff');
const nearIn = many('evening', 6, 2, 'active', 'nearIn');
const TIMES = 100;
const evenings = (all, moodKey) => {
  const byId = new Map(all.map((s) => [s.id, s]));
  return Array.from({ length: TIMES }, (_, i) => {
    const steps = generateCourse(all, ['day', 'evening', 'night'], [], moodKey, { rng: mulberry(i + 1) });
    const night = byId.get(steps.find((st) => st.slot === 'night').spotId);
    const evening = byId.get(steps.find((st) => st.slot === 'evening').spotId);
    assert.ok(night.name.startsWith('anchor'), `밤 칸이 앵커가 아니다: ${night.name}`);
    return { evening, km: getDistanceKm(night.lat, night.lng, evening.lat, evening.lng) };
  });
};

// 1) 앵커 20km 안에 분위기 안 저녁이 없으면 분위기 밖 가까운 저녁을 고른다
for (const { evening, km } of evenings([...base, ...nearOff], 'active')) {
  assert.ok(evening.name.startsWith('nearOff'), `분위기 밖 가까운 저녁 대신 ${evening.name}`);
  assert.ok(km <= 20, `저녁 칸이 앵커에서 ${km.toFixed(1)}km`);
}

// 2) 앵커 20km 안에 분위기 안 저녁이 있으면 그것을 고른다
for (const { evening } of evenings([...base, ...nearOff, ...nearIn], 'active')) {
  assert.ok(evening.name.startsWith('nearIn'), `분위기 안 가까운 저녁 대신 ${evening.name}`);
}

console.log('test-course-mood-relax: OK');
