// 최근 노출 이력과 종목 중복 방지 회귀 테스트(P-358): node scripts/test-course-genre-history.cjs
// 이력이 앵커 근처의 다른 종목 후보를 모두 빼면 저녁 칸이 앵커와 같은 종목이 됐다.
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 합성 장소(실제 spots.json의 서울 장소를 복제해 좌표만 바꾼 것)로 저녁 칸이 뽑는 종목을 단언한다
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
const queue = ['generateCourse', 'getCandidates', 'getSpotGenre'];
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

// 서울에서 앱이 후보로 쓰는 실제 장소 가운데 종목별로 틀을 고른다(분류와 영업 시간이 그대로라 거름을 통과한다)
const open = rawSpots.filter((s) => !s.is_closed);
const pick = (slot, genre, n) => {
  const found = getCandidates(open, slot, ['SEOUL'], 'ALL', [], [], null, false).filter(
    (s) => s.lat != null && s.lng != null && getSpotGenre(s) === genre,
  );
  assert.ok(found.length >= n, `${slot} ${genre} 틀 장소가 모자란다`);
  return found.slice(0, n);
};
let nextId = 9_000_000_000_000;
// 기준점(37.5, 127.0)에서 북쪽으로 northKm 떨어진 곳에 놓는다
const make = (t, name, northKm) => ({ ...t, id: nextId++, name, lat: 37.5 + northKm / 111, lng: 127.0 });
const [nightMeal] = pick('night', 'MEAL', 1);
const [eveMeal1, eveMeal2] = pick('evening', 'MEAL', 2);
const [eveBar] = pick('evening', 'BAR', 1);

// 밤 후보가 하나뿐이라 그 식당이 앵커가 된다. 저녁 후보는 앵커 2km 안의 식당 둘과 1km 안의 바 하나다
const anchor = make(nightMeal, '앵커밤식당', 0);
const mealA = make(eveMeal1, '저녁식당A', 1);
const mealB = make(eveMeal2, '저녁식당B', 2);
const bar = make(eveBar, '저녁바', 1);
const all = [anchor, mealA, mealB, bar];
assert.strictEqual(getSpotGenre(anchor), 'MEAL');
assert.strictEqual(getSpotGenre(bar), 'BAR');
const eveningOf = (steps) => steps.find((st) => st.slot === 'evening').spotId;
const run = (spots, avoid, seed) => generateCourse(spots, ['evening', 'night'], ['SEOUL'], 'ALL', { rng: mulberry(seed), avoidIds: new Set(avoid) });

for (let seed = 1; seed <= 50; seed++) {
  // (a) 이력이 앵커와 다른 종목의 유일한 후보(바)를 덮어도 저녁 칸은 바다
  assert.strictEqual(eveningOf(run(all, [bar.id], seed)), bar.id, `(a) 시드 ${seed}: 이력 때문에 저녁 칸이 앵커와 같은 종목이 됐다`);
  // (b) 이력이 없으면 종전과 같이 바다
  assert.strictEqual(eveningOf(run(all, [], seed)), bar.id, `(b) 시드 ${seed}: 이력이 없는데 저녁 칸이 바가 아니다`);
  // (c) 이력이 같은 종목 후보(식당)만 덮으면 바다: 이력 밖에 다른 종목이 있는 경우는 종전과 같다
  assert.strictEqual(eveningOf(run(all, [mealA.id], seed)), bar.id, `(c) 시드 ${seed}: 이력 밖 다른 종목이 있는데 뽑히지 않았다`);
  // (d) 다른 종목 후보가 애초에 없으면 이력과 무관하게 빈 칸 없이 같은 종목 식당이 뽑힌다
  const noBar = run([anchor, mealA, mealB], [mealA.id], seed);
  assert.ok(noBar.every((st) => st.spotId != null), `(d) 시드 ${seed}: 빈 칸이 생겼다`);
}

// (e) 이력이 5km 안의 바를 덮고 5km 밖에도 바가 있으면 이력을 무시해 5km 안의 바를 쓴다: 먼 바로 구간이 늘지 않는다
const farBar = make(eveBar, '먼저녁바', 15);
for (let seed = 1; seed <= 50; seed++) {
  assert.strictEqual(eveningOf(run([anchor, mealA, farBar, bar], [bar.id], seed)), bar.id, `(e) 시드 ${seed}: 5km 안의 바 대신 다른 장소가 뽑혔다`);
}

console.log('test-course-genre-history: ok');
