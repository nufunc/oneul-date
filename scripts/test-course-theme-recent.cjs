// 테마 칩 앵커와 최근 노출 회귀 테스트: node scripts/test-course-theme-recent.cjs
// test-course-theme-anchor.cjs처럼 generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 실행한다.
// 테마 장소가 모두 최근 노출 이력에 들어도 테마 앵커를 잃지 않는지 본다(제주 ♨️을 이어 누르면 4번째부터 테마 장소 없는 코스가 나왔다)
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
const queue = ['generateCourse', 'matchesCategoryTheme'];
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
  .replace('function getCandidates(', 'function getCandidatesUncached(')
  // 테마 분기가 고른 앵커 칸을 남긴다
  .replace(/(matched\.length > anchorPool\.length)\)\) \{\n(\s*)anchorSlot = slot;/g, (m) => m + ' themeSlot = slot;')
  .concat(`
let themeSlot = null;
const candidateCache = new Map();
function getCandidates(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly) {
  const key = JSON.stringify([slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor && anchor.id, indoorOnly]);
  if (!candidateCache.has(key)) candidateCache.set(key, getCandidatesUncached(all, slot, regionKeys, moodKey, excludeIds, zoneKeys, anchor, indoorOnly));
  return candidateCache.get(key);
}`);
assert.ok(code.includes('themeSlot = slot;'), '테마 앵커 분기의 비교 줄을 찾지 못했다');

const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { generateCourse, getCandidates, matchesCategoryTheme, SPOT_EXPLORE_CATEGORIES, takeThemeSlot, setStations } = new Function(
  'rawSpotsData',
  `${ts.transpile(code, { target: 'es2022' })};return { generateCourse, getCandidates, matchesCategoryTheme, SPOT_EXPLORE_CATEGORIES, takeThemeSlot: () => { const s = themeSlot; themeSlot = null; return s; }, setStations: (s) => { stationCoords = s; } };`,
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
const REGIONS = [[], ['SEOUL'], ['GYEONGGI'], ['GANGWON'], ['CHUNGCHEONG'], ['YEONGNAM'], ['HONAM'], ['JEJU']];
// 맞춤 코스 탭에 보이는 칩 9개
const CHIPS = ['DINING', 'WINE', 'NIGHT', 'OCEAN', 'PUB', 'CAFE', 'HEALING', 'SPA', 'CULTURE'];
const themeOf = (key) => SPOT_EXPLORE_CATEGORIES.find((c) => c.key === key);
const themeIdsIn = (regions, theme) => {
  const ids = new Set();
  for (const slot of SLOTS) {
    for (const s of getCandidates(open, slot, regions, 'ALL', [], [], null, false)) if (matchesCategoryTheme(s, theme.keywords)) ids.add(s.id);
  }
  return ids;
};

// (a) 지역 8개 × 칩 9개: 그 지역의 테마 일치 장소를 모두 최근 노출 이력에 넣어도 테마 앵커를 고르고 코스에 테마 장소가 든다
for (const regions of REGIONS) {
  for (const key of CHIPS) {
    const theme = themeOf(key);
    const avoidIds = themeIdsIn(regions, theme);
    const tag = `${regions[0] || '전국'} ${key}(이력 ${avoidIds.size}곳)`;
    assert.ok(avoidIds.size > 0, `${tag}: 테마 일치 장소가 없다`);
    takeThemeSlot();
    const steps = generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(1), categoryKey: key, avoidIds });
    assert.ok(takeThemeSlot(), `${tag}: 테마 장소가 모두 최근 이력에 들자 테마 앵커를 고르지 못했다`);
    assert.strictEqual(steps.filter((st) => st.spotId == null).length, 0, `${tag}: 빈 칸이 있다`);
    const hits = steps.filter((st) => st.spotId != null && matchesCategoryTheme(byId.get(st.spotId), theme.keywords)).length;
    assert.ok(hits > 0, `${tag}: 코스에 칩 낱말에 맞는 장소가 없다`);
  }
}

// (b) 최근 이력에 들지 않은 테마 장소가 남아 있으면 그것을 먼저 쓴다(이력 장소를 다시 쓰는 것은 남은 곳이 없을 때뿐이다)
for (const [regions, key] of [[['JEJU'], 'SPA'], [['HONAM'], 'SPA'], [['CHUNGCHEONG'], 'PUB']]) {
  const theme = themeOf(key);
  const ids = [...themeIdsIn(regions, theme)];
  for (const keep of ids) {
    const avoidIds = new Set(ids.filter((id) => id !== keep));
    takeThemeSlot();
    const steps = generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(1), categoryKey: key, avoidIds });
    assert.ok(takeThemeSlot(), `${regions[0]} ${key}: 테마 앵커를 고르지 못했다`);
    assert.ok(
      steps.some((st) => st.spotId === keep),
      `${regions[0]} ${key}: 이력에 들지 않은 테마 장소 ${byId.get(keep).name}(${keep})를 쓰지 않았다`,
    );
  }
}

console.log('test-course-theme-recent: ok');
