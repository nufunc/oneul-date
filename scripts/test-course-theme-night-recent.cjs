// 🌙 테마 앵커와 최근 노출 회귀 테스트: node scripts/test-course-theme-night-recent.cjs
// test-course-theme-recent.cjs처럼 generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 실행한다.
// 저녁·밤 칸 🌙 후보가 모두 최근 이력에 들어도 이력 밖 낮 칸보다 저녁·밤 칸을 앵커로 쓰는지 본다
// (🌙을 켠 채 🚀를 거듭 누르면 제주에서 4번째부터 낮 해변이 앵커가 됐다)
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

const NIGHT_SLOTS = ['evening', 'night'];
const matchedIn = (regions, slot, theme, avoidIds) =>
  getCandidates(open, slot, regions, 'ALL', [], [], null, false).filter((s) => !avoidIds.has(s.id) && matchesCategoryTheme(s, theme.keywords));

// (a) 지역 8개 × 씨앗 3: 저녁·밤 칸 🌙 후보를 모두 최근 이력에 넣고 낮 칸에 이력 밖 🌙 후보가 남아 있어도 앵커는 저녁·밤 칸이다
const night = themeOf('NIGHT');
let dayLeft = 0;
for (const regions of REGIONS) {
  const avoidIds = new Set(NIGHT_SLOTS.flatMap((slot) => matchedIn(regions, slot, night, new Set()).map((s) => s.id)));
  const dayOutside = matchedIn(regions, 'day', night, avoidIds).length;
  if (dayOutside > 0) dayLeft++;
  for (const seed of [1, 2, 3]) {
    const tag = `${regions[0] || '전국'} NIGHT 씨앗 ${seed}(이력 ${avoidIds.size}곳, 이력 밖 낮 칸 후보 ${dayOutside}곳)`;
    takeThemeSlot();
    generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(seed), categoryKey: 'NIGHT', avoidIds });
    const slot = takeThemeSlot();
    assert.ok(NIGHT_SLOTS.includes(slot), `${tag}: 앵커 칸이 ${slot}이다(저녁 또는 밤이어야 한다)`);
  }
}
// 낮 칸에 이력 밖 후보가 남는 지역이 없으면 (a)는 고치기 전 코드에서도 통과하므로 시험이 되지 않는다
assert.ok(dayLeft >= 2, `이력 밖 낮 칸 🌙 후보가 남는 지역이 ${dayLeft}곳뿐이다`);

// (b) 🌙 밖 칩 8개 × 지역 8개: 테마 장소 절반을 이력에 넣었을 때 앵커는 이력 밖 일치 후보가 가장 많은 칸이다(순회 순서를 바꿔도 그대로다)
for (const regions of REGIONS) {
  for (const key of CHIPS.filter((k) => k !== 'NIGHT')) {
    const theme = themeOf(key);
    const rng = mulberry(7);
    const avoidIds = new Set([...themeIdsIn(regions, theme)].filter(() => rng() < 0.5));
    const pick = (avoid) => {
      let best = null;
      let size = 0;
      for (const slot of SLOTS) {
        const n = matchedIn(regions, slot, theme, avoid).length;
        if (n > size) [best, size] = [slot, n];
      }
      return best;
    };
    const expected = pick(avoidIds) || pick(new Set());
    const tag = `${regions[0] || '전국'} ${key}(이력 ${avoidIds.size}곳)`;
    takeThemeSlot();
    generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(1), categoryKey: key, avoidIds });
    assert.strictEqual(takeThemeSlot(), expected, `${tag}: 앵커 칸이 이력 밖 일치 후보가 가장 많은 칸이 아니다`);
  }
}

console.log('test-course-theme-night-recent: ok');
