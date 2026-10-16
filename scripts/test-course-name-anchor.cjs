// 이름 검색 코스 앵커와 숙박 칸 검색어 반영 회귀 테스트: node scripts/test-course-name-anchor.cjs
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
const queue = ['generateCourse', 'zoneKeysForQuery'];
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
  // 같은 후보 목록과 (스팟, 검색어) 판정을 되풀이하므로 두 결과를 저장해 시간을 줄인다
  .replace('function matchesSearchQuery(', 'function matchesSearchQueryUncached(')
  .replace('function getCandidates(', 'function getCandidatesUncached(')
  .replace('function isCourseEligible(', 'function isCourseEligibleUncached(')
  // 숙박 외 칸 거리를 앵커 기준으로 재려고 마지막에 고른 앵커를 남긴다
  .replace('anchorSpot = anchor;', 'anchorSpot = anchor; lastAnchor = anchor;')
  .concat(`
let lastAnchor = null;
const candidateCache = new Map();
function getCandidates(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly) {
  const key = JSON.stringify([slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor && anchor.id, indoorOnly]);
  if (!candidateCache.has(key)) candidateCache.set(key, getCandidatesUncached(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly));
  return candidateCache.get(key);
}
const eligibleCache = new Map();
function isCourseEligible(spot) {
  if (!eligibleCache.has(spot.id)) eligibleCache.set(spot.id, isCourseEligibleUncached(spot));
  return eligibleCache.get(spot.id);
}
const matchCache = new Map();
function matchesSearchQuery(spot, query) {
  const key = query + '\\0' + spot.id;
  if (!matchCache.has(key)) matchCache.set(key, matchesSearchQueryUncached(spot, query));
  return matchCache.get(key);
}`);

const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, isCourseEligible, matchesSearchQuery, zoneKeysForQuery, zoneSelectionMatcher, getLastAnchor, setStations } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, isCourseEligible, matchesSearchQuery, zoneKeysForQuery, zoneSelectionMatcher, getLastAnchor: () => lastAnchor, setStations: (s) => { stationCoords = s; } };`,
)(rawSpots);
setStations(stations);

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
const STAY_ANCHOR_KM = 20;

// 앱처럼 만든 코스의 스팟을 이력 맨 뒤에 더하고 100곳을 넘기면 앞에서 뺀다. 이력은 비우지 않고 이어 간다
const run = (query, slots, times, seed, zoneKeys = [], zoneFromQuery = false) => {
  const rng = mulberry(seed);
  let recent = [];
  const courses = [];
  for (let i = 0; i < times; i++) {
    const steps = generateCourse(open, [...slots], [], 'ALL', { rng, avoidIds: new Set(recent), searchQuery: query, zoneFromQuery }, zoneKeys);
    const ids = steps.map((st) => st.spotId).filter((id) => id != null);
    assert.ok(ids.length > 0, `${query} ${i + 1}번째 코스가 비었다`);
    const anchor = getLastAnchor();
    courses.push(steps.map((st) => ({ slot: st.slot, anchor: st.spotId === anchor?.id, spot: st.spotId == null ? null : spotById.get(st.spotId) })));
    recent = [...recent.filter((id) => !ids.includes(id)), ...ids].slice(-RECENT_MAX);
  }
  return courses;
};

// (a) 이름을 그대로 친 검색은 이름이 같은 스팟이 코스에 든다: P-144가 교정한 숙소 164곳과 낮 칸으로 내린 8168
// 숙박 칸을 끈 채로(이름에 숙박어가 없으면 앱이 숙박 칸을 켜지 않는다) 만든다
const CORRECTED_STAY_IDS = [
  1790005574692, 1790179138297, 1790209625815, 1790209626059,
  1790209626436, 1790243905570, 1790243905574, 1790258778316,
  1790258778320, 1790258783705, 1790258783708, 1790258783728,
  1790258783739, 1790258783743, 1790261919386, 1790261922041,
  1790261926892, 1790261927403, 1790276403262, 1790292417382,
  1790292417386, 1790292417389, 1790307186246, 1790307186250,
  1790307186268, 1790307191393, 1790311909551, 1790311909574,
  1790311912053, 1790311912065, 1790311912093, 1790311912105,
  1790340838042, 1790340838569, 1790340838573, 1790355367985,
  1790355370790, 1790355370794, 1790355373463, 1790355373478,
  1790355375551, 1790355376091, 1790369997192, 1790369999079,
  1790370001970, 1790386510872, 1790410166074, 1790410166106,
  1790410166212, 1790410169354, 1790410169465, 1790410172445,
  1790410175279, 1790410175477, 1790424651104, 1790424651164,
  1790424654062, 1790424660198, 1790424660247, 1790447747784,
  1790447748487, 1790447748648, 1790447748812, 1790447756600,
  1790456842670, 1790456842894, 1790456843057, 1790459405385,
  1790459526373, 1790459526542, 1790459526597, 1790459526766,
  1790459526820, 1790532215792, 1790532215848, 1790532219248,
  1790532220542, 1790548102571, 1790548103928, 1790548103980,
  1790548107907, 1790548108119, 1790548108548, 1790548112256,
  1790548112309, 1790548112413, 1790548112574, 1790548112628,
  1790562701856, 1790562702182, 1790562702238, 1790562702293,
  1790607865484, 1790607866005, 1790607870262, 1790607870369,
  1790607870424, 1790607870538, 1790607874682, 1790607878729,
  1790607879174, 1790623867905, 1790623868250, 1790638654204,
  1790638654260, 1790667560813, 1790667564795, 1790667565045,
  1790667572288, 1790667572628, 1790683610128, 1790683610292,
  1790683610347, 1790683614020, 1790683617297, 1790714521432,
  1790714527057, 1790714527384, 1790714527600, 1790727443987,
  1790727449287, 1790772592020, 1790772592093, 1790772593822,
  1790772593969, 1790772594427, 1790787074612, 1790787075981,
  1790816562922, 1790816563261, 1790823926012, 1790823929850,
  1790838389688, 1790884927184, 1790884928514, 1790884928631,
  1790884934543, 1790884934665, 1790884934904, 1790933441704,
  1790933442389, 1791014666339, 1791034030227, 1791034030610,
  1791048504923, 1791166759563, 1791166759629, 1791166763883,
  1791181502284, 1791230377610, 1791368850625, 1791368858902,
  1791475986015, 1791475986472, 1791475986551, 1791475986715,
  1791475986788, 1791533344547, 1791533357336, 1791592436822,
  1791650312011, 1791706424061, 1791706424548, 1791767761541,
  1791981541378,
];
const targets = [...CORRECTED_STAY_IDS, 8168].map((id) => spotById.get(id)).filter((s) => s && !s.is_closed && isCourseEligible(s));
assert.ok(targets.length >= 150, `이름 검색 대상이 150곳 미만이다: ${targets.length}`);
const names = [...new Set(targets.map((s) => s.name))];
const missed = [];
let total = 0;
names.forEach((name, i) => {
  const key = name.trim().toLowerCase();
  for (const course of run(name, ['day', 'evening', 'night'], 20, 148 + i)) {
    total++;
    if (!course.some((st) => st.spot && (st.spot.name || '').trim().toLowerCase() === key)) missed.push(name);
  }
});
assert.strictEqual(missed.length, 0, `이름 검색 ${total}번 중 ${missed.length}번이 이름의 스팟을 빠뜨렸다: ${[...new Set(missed)].slice(0, 5).join(', ')}`);

// (b) 앵커가 숙박 칸이 아닐 때 숙박 칸은 검색어에 맞는 숙소를 먼저 뽑는다. 검색어를 보지 않던 때는 앵커가 숙박 칸일 때만 맞아 '캠핑' 26%, '글램핑' 16%였다
for (const query of ['캠핑', '글램핑', '펜션']) {
  const stays = run(query, ['day', 'evening', 'night', 'stay'], 100, 148)
    .map((course) => course.find((st) => st.slot === 'stay').spot)
    .filter(Boolean);
  const fit = stays.filter((s) => matchesSearchQuery(s, query)).length;
  assert.ok(fit / stays.length >= 0.95, `${query} 검색의 숙박 칸이 검색어에 맞는 비율이 ${fit}/${stays.length}이다`);
}

// (c) 같은 검색어로 코스를 10번 이어 만들어 최근 노출 이력이 쌓여도 숙박 칸은 앵커 근처 일치 숙소다.
// 이력에서 앵커 가까운 일치 숙소가 빠지면 '풀빌라'의 숙박 칸이 76~112km까지 벌어졌다. 숙박 칸이 아닌 칸 가운데 가장 가까운 칸을 앵커 거리로 본다
const haversineKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};
for (const query of ['풀빌라', '캠핑', '글램핑']) {
  let fit = 0;
  let near = 0;
  let total = 0;
  const far = [];
  for (let user = 0; user < 6; user++) {
    for (const course of run(query, ['day', 'evening', 'night', 'stay'], 10, 150 + user)) {
      const stay = course.find((st) => st.slot === 'stay').spot;
      if (!stay) continue;
      total++;
      if (matchesSearchQuery(stay, query)) fit++;
      const others = course.filter((st) => st.slot !== 'stay' && st.spot && st.spot.lat != null).map((st) => haversineKm(stay, st.spot));
      const d = Math.min(...others);
      if (d <= STAY_ANCHOR_KM) near++;
      else far.push(Math.round(d));
    }
  }
  assert.ok(total >= 55, `${query} 숙박 칸이 있는 코스가 ${total}개뿐이다`);
  assert.strictEqual(near, total, `${query} 숙박 칸 ${total}곳 중 ${total - near}곳이 앵커에서 ${STAY_ANCHOR_KM}km를 넘는다: ${far.slice(0, 8).join(', ')}km`);
  assert.ok(fit / total >= 0.9, `${query} 숙박 칸이 검색어에 맞는 비율이 ${fit}/${total}이다`);
}

// (d) 숙박 외 칸도 앵커 20km 안에서 뽑는다. 검색어에서 나온 세부 동네(순천·담양)로만 찾으면 '담양힐링파크' 밤 칸이
// 61.8km 떨어진 순천만 천문대가 됐다. 반경 안 후보가 없으면 이력을 무시하고, 그래도 없으면 검색어에서 나온 동네를 풀어 찾는다
for (const query of ['담양힐링파크', '담양']) {
  const zoneKeys = zoneKeysForQuery(query);
  assert.ok(zoneKeys.length > 0, `${query}에 세부 동네가 없다`);
  let total = 0;
  const far = [];
  for (let user = 0; user < 4; user++) {
    for (const course of run(query, ['day', 'evening', 'night'], 10, 152 + user, zoneKeys, true)) {
      const anchor = course.find((st) => st.anchor)?.spot;
      if (!anchor || anchor.lat == null) continue;
      for (const st of course) {
        if (st.anchor || st.slot === 'stay' || !st.spot || st.spot.lat == null) continue;
        total++;
        const d = haversineKm(anchor, st.spot);
        if (d > STAY_ANCHOR_KM) far.push(`${st.slot} ${st.spot.name} ${Math.round(d)}`);
      }
    }
  }
  assert.ok(total >= 60, `${query} 숙박 외 칸이 ${total}곳뿐이다`);
  assert.strictEqual(far.length, 0, `${query} 숙박 외 칸 ${total}곳 중 ${far.length}곳이 앵커에서 ${STAY_ANCHOR_KM}km를 넘는다: ${far.slice(0, 5).join(', ')}km`);
}

// (e) 지역 시트에서 세부 동네를 직접 고르면 앵커에서 멀어도 그 동네 밖 칸을 넣지 않는다
{
  const zoneKeys = zoneKeysForQuery('담양');
  const inZone = zoneSelectionMatcher(zoneKeys);
  const outside = [];
  for (let user = 0; user < 4; user++) {
    for (const course of run('담양힐링파크', ['day', 'evening', 'night'], 10, 152 + user, zoneKeys)) {
      for (const st of course) if (st.spot && !inZone(st.spot)) outside.push(`${st.slot} ${st.spot.name}`);
    }
  }
  assert.strictEqual(outside.length, 0, `직접 고른 동네 밖 칸이 ${outside.length}곳이다: ${outside.slice(0, 5).join(', ')}`);
}

console.log('test-course-name-anchor: 모두 통과');
