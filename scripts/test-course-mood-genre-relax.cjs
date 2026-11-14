// 분위기 종목 풀기 회귀 테스트(P-445): node scripts/test-course-mood-genre-relax.cjs
// 분위기 코스에서 앵커 근처의 분위기 안 후보가 모두 이미 고른 종목이면 같은 종목을 이었다(예: 알텐데[MEAL] > 코이누르[MEAL]).
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 합성 장소(실제 spots.json의 장소를 복제해 좌표와 분위기만 바꾼 것)로 저녁 칸이 고른 곳의 종목을 단언한다
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
const queue = ['generateCourse', 'getCandidates', 'getDistanceKm', 'getSpotGenre'];
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
const { generateCourse, getCandidates, getSpotGenre } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, getSpotGenre };`,
)(rawSpots);

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 칸과 종목마다 서울에서 앱이 후보로 쓰는 실제 장소를 틀로 삼는다(분류와 영업 시간이 그대로라 거름을 통과한다)
const open = rawSpots.filter((s) => !s.is_closed);
const tmpl = (slot, genre) => {
  const list = getCandidates(open, slot, ['SEOUL'], 'ALL', [], [], null, false).filter(
    (s) => s.lat != null && s.lng != null && getSpotGenre(s) === genre,
  );
  assert.ok(list.length > 0, `${slot} ${genre} 틀 장소가 없다`);
  return list.slice(0, 6);
};
const templates = { nightBar: tmpl('night', 'BAR'), dayCafe: tmpl('day', 'CAFE'), eveningBar: tmpl('evening', 'BAR'), eveningMeal: tmpl('evening', 'MEAL') };
let nextId = 9_100_000_000_000;
// 기준점(37.5, 127.0)에서 북쪽으로 northKm 떨어진 곳에 n곳을 0.2km씩 띄워 놓는다. 이름은 틀 이름 앞에 표지를 붙여 종목 판정을 유지한다
const many = (key, n, northKm, mood, tag) =>
  Array.from({ length: n }, (_, i) => {
    const t = templates[key][i % templates[key].length];
    return { ...t, id: nextId++, name: `${tag}${i} ${t.name}`, mood: [mood], lat: 37.5 + northKm / 111 + i * 0.002, lng: 127.0 };
  });

// 밤 칸 후보가 한 곳뿐이라 밤(BAR)이 앵커가 된다. 낮은 CAFE, 분위기 안 저녁은 앵커 옆이지만 모두 BAR다
const base = [...many('nightBar', 1, 0, 'active', 'anchor'), ...many('dayCafe', 6, 0.5, 'active', 'day'), ...many('eveningBar', 6, 1, 'active', 'sameIn')];
const offMeal = many('eveningMeal', 6, 2, 'healing', 'offMeal');
const inMeal = many('eveningMeal', 6, 3, 'active', 'inMeal');
for (const s of base.filter((x) => x.name.startsWith('sameIn')).concat(offMeal, inMeal)) {
  assert.ok(['BAR', 'MEAL'].includes(getSpotGenre(s)), `합성 장소 종목이 바뀌었다: ${s.name}`);
}
const TIMES = 100;
const evenings = (all, moodKey) => {
  const byId = new Map(all.map((s) => [s.id, s]));
  return Array.from({ length: TIMES }, (_, i) => {
    const steps = generateCourse(all, ['day', 'evening', 'night'], [], moodKey, { rng: mulberry(i + 1) });
    const night = byId.get(steps.find((st) => st.slot === 'night').spotId);
    assert.ok(night.name.startsWith('anchor'), `밤 칸이 앵커가 아니다: ${night.name}`);
    return byId.get(steps.find((st) => st.slot === 'evening').spotId);
  });
};

// 1) 근처 분위기 안 저녁이 모두 앵커와 같은 BAR면 분위기 밖 MEAL 저녁을 고른다
for (const evening of evenings([...base, ...offMeal], 'active')) {
  assert.ok(evening.name.startsWith('offMeal'), `분위기 밖 다른 종목 저녁 대신 ${evening.name}`);
}

// 2) 근처에 분위기 안 다른 종목 저녁이 있으면 그것을 고른다
for (const evening of evenings([...base, ...offMeal, ...inMeal], 'active')) {
  assert.ok(evening.name.startsWith('inMeal'), `분위기 안 다른 종목 저녁 대신 ${evening.name}`);
}

console.log('test-course-mood-genre-relax: OK');
