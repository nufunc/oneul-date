// 테마 칩 앵커 칸 회귀 테스트: node scripts/test-course-theme-anchor.cjs
// generateCourse와 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 역 좌표(public/data/stations.json)와 스팟(public/data/spots.json)을 실제 파일로 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);

// 최상위 함수·변수 선언을 이름으로 모으고 generateCourse에서 닿는 것만 남긴다
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
  // 같은 후보 목록을 되풀이하므로 결과를 저장해 시간을 줄인다
  .replace('function getCandidates(', 'function getCandidatesUncached(')
  // 테마 분기가 고른 앵커 칸을 남긴다
  .replace(/(matched\.length > anchorPool\.length|matched\.length < anchorPool\.length)\)\) \{\n(\s*)anchorSlot = slot;/g, (m) => m + ' themeSlot = slot;')
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
const SLOTS = ['day', 'evening', 'night'];

// (a) 넓은 낱말 넷은 목록에 없다: 🕯️ 일치 526곳 중 521곳이 '분위기' 한 낱말로 맞았고, '라운지'는 낮 칸 카페, '주점'은 포차, '자연'은 아무 곳에나 맞았다
const kw = (key) => SPOT_EXPLORE_CATEGORIES.find((c) => c.key === key).keywords;
assert.ok(!kw('ROMANTIC').includes('분위기'), "🕯️ 낱말에 '분위기'가 남았다");
assert.ok(!kw('WINE').includes('라운지'), "🍷 낱말에 '라운지'가 남았다");
assert.ok(!kw('WINE').includes('주점'), "🍷 낱말에 '주점'이 남았다");
assert.ok(!kw('HEALING').includes('자연'), "🌿 낱말에 '자연'이 남았다");

// (b) 서울과 전국, 테마 13개, 씨앗 10개: 테마 앵커를 고르고 빈 칸이 없으며, 앵커 칸은 일치 후보가 가장 많은 칸이다.
// 🌙은 저녁·밤 칸에 일치가 있으면 그 둘 중 많은 칸이다(낮 칸 전망대가 야경 칩 앵커가 되지 않게)
const themes = SPOT_EXPLORE_CATEGORIES.filter((c) => c.keywords);
assert.strictEqual(themes.length, 13);
let nightChecked = 0;
for (const regions of [['SEOUL'], []]) {
  const label = regions.length ? '서울' : '전국';
  for (const theme of themes) {
    const counts = Object.fromEntries(
      SLOTS.map((slot) => [slot, getCandidates(open, slot, regions, 'ALL', [], [], null, false).filter((s) => matchesCategoryTheme(s, theme.keywords)).length]),
    );
    const allowed = theme.key === 'NIGHT' && (counts.evening > 0 || counts.night > 0) ? ['evening', 'night'] : SLOTS;
    const best = Math.max(...allowed.map((s) => counts[s]));
    for (let seed = 1; seed <= 10; seed++) {
      takeThemeSlot();
      const steps = generateCourse(open, [...SLOTS], regions, 'ALL', { rng: mulberry(seed), categoryKey: theme.key });
      const slot = takeThemeSlot();
      const tag = `${label} ${theme.key} 씨앗 ${seed}`;
      assert.ok(slot, `${tag}: 테마 앵커를 고르지 못했다`);
      assert.strictEqual(steps.filter((st) => st.spotId == null).length, 0, `${tag}: 빈 칸이 있다`);
      assert.ok(allowed.includes(slot), `${tag}: 앵커 칸 ${slot}이 허용 칸 ${allowed} 밖이다`);
      assert.strictEqual(counts[slot], best, `${tag}: 앵커 칸 ${slot}(${counts[slot]}곳)이 일치가 가장 많은 칸(${best}곳)이 아니다 ${JSON.stringify(counts)}`);
      if (theme.key === 'NIGHT') nightChecked++;
    }
  }
}
assert.strictEqual(nightChecked, 20);

// (c) 🌙 칩은 저녁·밤 칸이 꺼졌을 때만 다른 칸을 쓴다
takeThemeSlot();
generateCourse(open, ['day'], ['SEOUL'], 'ALL', { rng: mulberry(1), categoryKey: 'NIGHT' });
assert.strictEqual(takeThemeSlot(), 'day', '🌙 칩에서 낮 칸만 켰을 때 테마 앵커를 고르지 못했다');

console.log('test-course-theme-anchor: ok');
