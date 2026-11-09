// 코스 종목 중복 방지 회귀 테스트: node scripts/test-course-genre.cjs
// getSpotGenre가 열린 모든 장소를 STAY로 판정해 종목 거름이 꺼져 있던 결함(P-335)을 잡는다.
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 역 좌표(public/data/stations.json)와 스팟(public/data/spots.json)을 실제 파일로 쓴다
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
const queue = ['generateCourse', 'getSpotGenre', 'diversifyByGenre'];
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

const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, getSpotGenre, diversifyByGenre, getDistanceKm, setStations } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getSpotGenre, diversifyByGenre, getDistanceKm, setStations: (s) => { stationCoords = s; } };`,
)(rawSpots);
setStations(stations);

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const open = rawSpots.filter((s) => !s.is_closed);
const byId = new Map(open.map((s) => [s.id, s]));
const SLOTS = ['day', 'evening', 'night'];

// (a) stay가 아닌 장소는 STAY로 판정하지 않는다: 낮 칸 음식점과 카페, 밤 칸 와인바가 모두 STAY였다
const base = { id: 1, name: '', category: '', summary: '', signature_items: [], mood_tags: [], region: '서울' };
assert.strictEqual(getSpotGenre({ ...base, name: '가나식당', category: '한식', slot: 'day' }), 'MEAL', '낮 칸 음식점이 MEAL이 아니다');
assert.strictEqual(getSpotGenre({ ...base, name: '다라커피', category: '카페', slot: 'day' }), 'CAFE', '낮 칸 카페가 CAFE가 아니다');
assert.strictEqual(getSpotGenre({ ...base, name: '마바와인바', category: '와인바', slot: 'night' }), 'BAR', '밤 칸 와인바가 BAR가 아니다');
assert.strictEqual(getSpotGenre({ ...base, name: '사아호텔', category: '호텔', slot: 'stay' }), 'STAY', 'stay 칸은 STAY여야 한다');

// (b) 열린 장소 중 stay 칸이 아닌 곳이 STAY로 판정되지 않고, 종목이 둘 이상으로 갈린다
const genres = {};
for (const s of open) {
  const g = getSpotGenre(s);
  genres[g] = (genres[g] || 0) + 1;
  if (s.slot !== 'stay') assert.notStrictEqual(g, 'STAY', `stay가 아닌 장소 ${s.id} ${s.name}이 STAY로 판정됐다`);
}
assert.ok(['CAFE', 'MEAL', 'BAR', 'ACTIVITY'].every((g) => genres[g] > 100), `종목 분포가 갈리지 않는다 ${JSON.stringify(genres)}`);

// (b2) 종목 거름은 앵커 5km 안에 다른 종목이 있을 때만 건다: 없으면 먼 다른 종목 대신 가까운 같은 종목을 남긴다(P-335)
const at = (name, category, km) => ({ ...base, id: Math.round(km * 10) + name.length, name, category, slot: 'day', lat: 37.5 + km / 111, lng: 127 });
const anchor = at('앵커식당', '한식', 0);
const nearMeal = [at('가나식당', '한식', 1), at('다라식당', '한식', 2)];
const farCafe = at('마바카페', '카페', 15);
const nearCafe = at('사아카페', '카페', 3);
const taken = new Set(['MEAL']);
assert.deepStrictEqual(diversifyByGenre([...nearMeal, farCafe], taken, anchor), [...nearMeal, farCafe], '5km 안에 다른 종목이 없는데 먼 다른 종목만 남겼다');
assert.deepStrictEqual(diversifyByGenre([...nearMeal, nearCafe], taken, anchor), [nearCafe], '5km 안에 다른 종목이 있는데 거르지 않았다');
assert.deepStrictEqual(diversifyByGenre([farCafe], taken, anchor), [farCafe], '5km 안에 후보가 없으면 종전대로 거른 결과여야 한다');
assert.deepStrictEqual(diversifyByGenre([...nearMeal, farCafe], taken, null), [farCafe], '앵커가 없으면 종전대로 거른다');
assert.deepStrictEqual(diversifyByGenre(nearMeal, taken, anchor), nearMeal, '같은 종목뿐이면 그대로 둔다');

// (c) 서울·경기·전국 낮저녁밤 코스 150개: 이웃한 두 칸이 같은 종목인 코스는 4% 이하다(수정 전 14%, 400코스 모의 1.3%)
let courses = 0;
let adjacent = 0;
let legs = 0;
let far = 0;
for (const regions of [['SEOUL'], ['GYEONGGI'], []]) {
  for (let seed = 1; seed <= 50; seed++) {
    const steps = generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(seed) });
    const gs = steps.filter((st) => st.spotId != null).map((st) => getSpotGenre(byId.get(st.spotId)));
    assert.ok(gs.every((g) => g !== 'STAY'), '코스에 STAY 장소가 들었다');
    courses++;
    if (gs.some((g, i) => i > 0 && g === gs[i - 1])) adjacent++;
    const ps = steps.filter((st) => st.spotId != null).map((st) => byId.get(st.spotId));
    ps.forEach((p, i) => {
      if (i === 0 || p.lat == null || ps[i - 1].lat == null) return;
      legs++;
      if (getDistanceKm(ps[i - 1].lat, ps[i - 1].lng, p.lat, p.lng) > 10) far++;
    });
  }
}
assert.strictEqual(courses, 150);
assert.ok(adjacent / courses <= 0.04, `이웃 칸이 같은 종목인 코스 ${adjacent}/${courses}(${((adjacent / courses) * 100).toFixed(1)}%)가 4%를 넘었다`);

// (d) 같은 150코스에서 이동 구간이 10km를 넘는 비율은 5% 이하다(종목 거름이 먼 후보를 고르던 때 7%)
assert.ok(legs > 200 && far / legs <= 0.05, `10km 초과 구간 ${far}/${legs}(${((far / legs) * 100).toFixed(1)}%)가 5%를 넘었다`);

console.log(`test-course-genre: ok (이웃 같은 종목 ${adjacent}/${courses}, 10km 초과 구간 ${far}/${legs})`);
