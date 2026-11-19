// 권역별 장소 파일 회귀 테스트(P-505): node scripts/test-spots-regions.cjs
// 1. public/data/spots/의 권역 파일을 합치면 spots.json과 같고 색인(index.json)의 행 수와 크기가 파일과 맞는다
// 2. 수집기 REGION_FILES(collector/sync_live_spots.py)와 앱 REGIONS(src/main.ts)가 같은 권역을 가리킨다
// 3. 첫 방문은 오늘 추천 권역 파일 하나만 요청하고, 전국으로 넓히면 나머지 권역만 받는다(ensureSpotsForRegions와 loadStaticSpots를 그대로 떼어 실행)
// 4. 오늘 추천 코스는 그 권역 파일만 있어도 전국 데이터로 만든 코스와 같은 장소로 나온다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const regionDir = path.join(dataDir, 'spots');
const mainSrc = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const supaSrc = fs.readFileSync(path.join(root, 'src', 'supabase.ts'), 'utf8');
const cut = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${from}을 찾지 못했다`);
  const end = src.indexOf(to, start);
  assert.ok(end > start, `${from} 뒤에서 ${to}를 찾지 못했다`);
  return src.slice(start, end);
};
const rowsOf = (cols) => cols.id.map((_, i) => Object.fromEntries(Object.keys(cols).map((k) => [k, cols[k][i]])));

// 1. 권역 파일 왕복
const rows = JSON.parse(fs.readFileSync(path.join(dataDir, 'spots.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(regionDir, 'index.json'), 'utf8'));
const onDisk = fs.readdirSync(regionDir).filter((f) => f.endsWith('.cols.json')).map((f) => f.replace('.cols.json', '')).sort();
assert.deepStrictEqual(onDisk, Object.keys(index.files).sort(), '색인의 파일 목록과 폴더의 권역 파일이 다르다');
assert.ok(onDisk.every((n) => /^[a-z]+$/.test(n)), '권역 파일 이름이 ASCII 소문자가 아니다');
assert.strictEqual(index.total, rows.length, '색인 전체 행 수가 spots.json과 다르다');
const merged = [];
for (const [name, info] of Object.entries(index.files)) {
  const text = fs.readFileSync(path.join(regionDir, `${name}.cols.json`), 'utf8');
  assert.strictEqual(Buffer.byteLength(text), info.bytes, `${name} 색인 크기가 파일과 다르다(진행률 분모가 틀린다)`);
  const part = rowsOf(JSON.parse(text));
  assert.strictEqual(part.length, info.rows, `${name} 색인 행 수가 파일과 다르다`);
  assert.ok(part.every((r) => info.regions.includes(r.region)), `${name}에 다른 권역 행이 섞였다`);
  merged.push(...part);
}
merged.sort((a, b) => a.id - b.id);
assert.strictEqual(merged.length, rows.length, '권역 파일 행 합이 전체 행 수와 다르다');
assert.strictEqual(JSON.stringify(merged), JSON.stringify(rows), '권역 파일을 합친 결과가 spots.json과 다르다');

// 2. 수집기와 앱의 권역 목록
const py = fs.readFileSync(path.join(root, 'collector', 'sync_live_spots.py'), 'utf8');
const pyBlock = cut(py, 'REGION_FILES = {', '\n}\n');
const pyFiles = Object.fromEntries([...pyBlock.matchAll(/"(\w+)": \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]));
const regionsCode = cut(mainSrc, 'const REGIONS:', '\nconst MOODS');
const REGIONS = new Function(`${ts.transpile(regionsCode, { target: 'es2022' })};return REGIONS;`)();
const appFiles = Object.fromEntries(REGIONS.filter((r) => r.key !== 'ALL').map((r) => [r.key.toLowerCase(), r.match]));
assert.deepStrictEqual(pyFiles, appFiles, '수집기 REGION_FILES와 앱 REGIONS가 다르다');
for (const [name, info] of Object.entries(index.files)) assert.deepStrictEqual(info.regions, pyFiles[name], `${name} 색인 권역이 REGION_FILES와 다르다`);

// 3. 첫 방문 요청: 앱의 받기 블록과 정적 로더를 실제 색인·파일로 실행한다
const loaderCode = cut(supaSrc, '// 권역 파일 색인', '\n// 받은 링크').replace(/^export /gm, '')
  .replace("(await import('./data/spots.sample.json')).default", '[]')
  .replace(/import\.meta\.env\.BASE_URL/g, "'/oneul-date/'");
const colsCode = cut(supaSrc, 'export function rowsFromColumns', '\n}\n').replace(/^export /gm, '') + '\n}\n';
const ensureCode = cut(mainSrc, 'const loadedRegionKeys = new Set<string>();', 'async function init()');
const matchesCode = cut(mainSrc, 'function matchesRegion(', '\n}\n') + '\n}\n';
const dailyCode = cut(mainSrc, '/** 오늘 날짜로 시드한 Mulberry32', '\nfunction buildDailyRecommendedCourse');
const DAY = new Date(2026, 10, 18);
const dailyPick = new Function(`${ts.transpile(dailyCode, { target: 'es2022' })};return dailyPick;`)();
const daily = dailyPick(DAY).pickedRegion;
// init 첫 받기 키: 찜·저장한 코스가 없고 지역을 고르지 않았으면 오늘 추천 권역 하나다
assert.ok(
  cut(mainSrc, '    const firstKeys = ', '\n').includes('[...savedSpotRegionKeys(), ...(state.regions.length > 0 ? state.regions : [dailyPick().pickedRegion])]'),
  '첫 방문 받기 키 순서가 바뀌었다',
);

(async () => {
  const fetched = [];
  const app2 = new Function(
    'fetched', 'fs', 'path', 'regionDir', '__SPOTS_INDEX__', 'REGIONS',
    `const fetch = async (url) => {
      fetched.push(url);
      const text = fs.readFileSync(path.join(regionDir, url.replace('/oneul-date/data/spots/', '')), 'utf8');
      return { ok: true, status: 200, body: null, json: async () => JSON.parse(text) };
    };
    const normalizeSpots = (x) => x;
    const loadSpots = (m) => loadStaticSpots(m);
    let spots = [], spotById = new Map(), fullSpotsPending = false;
    const state = { mainMode: 'course', regions: [], savedSpotIds: new Set() };
    const document = { getElementById: () => null };
    const deduplicateSpotList = (x) => x, buildSpotIndex = (x) => new Map(x.map((s) => [s.id, s]));
    const canonicalizeSavedSpotIds = () => {}, paintSpotsProgress = () => {}, resolveWaitingCourse = () => {};
    const showSpotsFailedBanner = () => { throw new Error('실패 띠'); }, isCourseEligible = () => true, renderSpotDiscovery = () => {};
    const saveSpotsToCache = () => {};
    let savedCourses = [];
    const loadSavedCourses = () => savedCourses;
    ${ts.transpile(colsCode + loaderCode + matchesCode + ensureCode, { target: 'es2022' })}
    return { ensureSpotsForRegions, savedSpotRegionKeys, state, setSavedCourses: (c) => { savedCourses = c; }, staleRegionKeys, loaded: () => loadedRegionKeys, spots: () => spots };`,
  )(fetched, fs, path, regionDir, Object.fromEntries(Object.entries(index.files).map(([n, i]) => [n, { regions: i.regions, bytes: i.bytes }])), REGIONS);

  // 찜·저장 코스가 없으면 더할 권역이 없고, 캐시가 없어 행을 못 찾으면 전국이다(P-527)
  assert.deepStrictEqual(app2.savedSpotRegionKeys(), [], '찜·저장이 없는데 권역을 더한다');
  app2.state.savedSpotIds.add(rows[0].id);
  assert.deepStrictEqual(app2.savedSpotRegionKeys(), ['ALL'], '캐시에 없는 찜이 전국으로 떨어지지 않는다');
  app2.state.savedSpotIds.clear();
  await app2.ensureSpotsForRegions([daily]);
  assert.deepStrictEqual(fetched, [`/oneul-date/data/spots/${daily.toLowerCase()}.cols.json`], '첫 방문이 권역 파일 하나만 요청하지 않았다');
  const want = REGIONS.find((r) => r.key === daily).match;
  assert.ok(app2.spots().length > 0 && app2.spots().every((s) => want.includes(s.region)), '받은 장소가 오늘 추천 권역이 아니다');
  assert.ok(app2.loaded().has(daily) && !app2.loaded().has('ALL'));
  // 같은 권역은 다시 받지 않는다
  await app2.ensureSpotsForRegions([daily]);
  assert.strictEqual(fetched.length, 1, '받은 권역을 다시 요청했다');
  // 전국으로 넓히면 나머지 권역만 받고 합치면 전체와 같다
  await app2.ensureSpotsForRegions(['ALL']);
  assert.strictEqual(fetched.length, Object.keys(index.files).length, '전국으로 넓힐 때 받은 권역을 다시 요청했거나 빠뜨렸다');
  assert.ok(app2.loaded().has('ALL'), '전국을 받았다는 표시가 없다');
  assert.strictEqual(app2.spots().length, rows.length, '전국을 합친 행 수가 전체와 다르다');

  // P-527 단위 2: 찜 id와 저장 코스 spotIds를 행으로 찾아 그 권역만 더한다. 하나라도 못 찾으면 전국이다
  const keyOf = (r) => REGIONS.find((g) => g.key !== 'ALL' && g.match.includes(r.region)).key;
  const seoulRow = rows.find((r) => keyOf(r) === 'SEOUL');
  const jejuRow = rows.find((r) => keyOf(r) === 'JEJU');
  app2.state.savedSpotIds.add(seoulRow.id);
  assert.deepStrictEqual(app2.savedSpotRegionKeys(), ['SEOUL'], '찜 권역을 행으로 찾지 못했다');
  app2.setSavedCourses([{ spotIds: [jejuRow.id, seoulRow.id] }]);
  assert.deepStrictEqual(app2.savedSpotRegionKeys().sort(), ['JEJU', 'SEOUL'], '저장 코스 장소 권역을 더하지 않는다');
  app2.setSavedCourses([{ spotIds: [jejuRow.id, 999999999] }]);
  assert.deepStrictEqual(app2.savedSpotRegionKeys(), ['ALL'], '못 찾은 저장 코스 장소가 있는데 전국으로 떨어지지 않는다');
  app2.setSavedCourses([]);
  app2.state.savedSpotIds.clear();

  // P-527 단위 1: 지난 권역 7개를 표시해 두면 이번에 쓰는 권역만 뒤에서 다시 받고, 나머지는 쓸 때 받는다
  const before = fetched.length;
  const settle = () => new Promise((r) => setTimeout(r, 50));
  REGIONS.filter((r) => r.key !== 'ALL').forEach((r) => app2.staleRegionKeys.add(r.key));
  await app2.ensureSpotsForRegions([daily]);
  await settle();
  assert.deepStrictEqual(fetched.slice(before), [`/oneul-date/data/spots/${daily.toLowerCase()}.cols.json`], '지난 권역 7개 중 필요한 1개만 다시 요청하지 않았다');
  assert.ok(!app2.staleRegionKeys.has(daily) && app2.staleRegionKeys.size === 6, '다시 받은 권역의 지난 표시가 남았거나 나머지 표시가 지워졌다');
  await app2.ensureSpotsForRegions([daily]);
  await settle();
  assert.strictEqual(fetched.length, before + 1, '다시 받은 권역을 또 요청했다');
  await app2.ensureSpotsForRegions(['ALL']);
  await settle();
  assert.strictEqual(fetched.length, before + 7, '전국을 쓸 때 나머지 지난 권역을 다시 받지 않았다');
  assert.strictEqual(app2.staleRegionKeys.size, 0, '지난 표시가 남았다');
  assert.strictEqual(app2.spots().length, rows.length, '다시 받은 뒤 행 수가 전체와 다르다');

  // P-527: 검색어와 찜 모아 보기가 쓰는 전국 키도 지난 권역이 있으면 다시 받기를 시작한다(받은 권역이어도 가드가 막지 않는다)
  const discoveryFn = mainSrc.slice(mainSrc.indexOf('function renderSpotDiscovery'), mainSrc.indexOf('// 1. GPS 위치 자동 획득'));
  assert.ok(/if \(!regionsLoaded\(discoveryKeys\) \|\| regionFileKeysFor\(discoveryKeys\)\.some\(\(k\) => staleRegionKeys\.has\(k\)\)\) ensureSpotsForRegions\(discoveryKeys\)/.test(discoveryFn), '지난 권역이 있어도 검색 경로가 다시 받기를 시작하지 않는다');

  // 4. 오늘 추천 코스: 권역 파일만으로 만든 코스와 전국 데이터로 만든 코스가 같은 장소다
  const sf = ts.createSourceFile('main.ts', mainSrc, ts.ScriptTarget.ES2022, true);
  const decls = new Map();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
    else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
  }
  const need = new Set();
  const queue = ['buildDailyRecommendedCourse', 'deduplicateSpotList'];
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
  const code = [...new Set([...need].map((n) => decls.get(n)))].sort((a, b) => a.pos - b.pos).map((st) => st.getText().replace(/^export\s+/, '')).join('\n');
  const { stations } = JSON.parse(fs.readFileSync(path.join(dataDir, 'stations.json'), 'utf8'));
  const course = new Function('rawSpotsData', 'stations', `${ts.transpile(code, { target: 'es2022' })};stationCoords = stations;return { buildDailyRecommendedCourse, deduplicateSpotList };`)(rows, stations);
  const ids = (list, day = DAY) => {
    const c = course.buildDailyRecommendedCourse(course.deduplicateSpotList(list), day);
    return c && { region: c.regionKey, ids: c.steps.map((s) => s.spotId) };
  };
  // 날짜마다 권역이 바뀌므로 2주를 더 본다
  for (let d = 1; d <= 14; d++) {
    const day = new Date(2026, 10, 18 + d);
    const key = dailyPick(day).pickedRegion;
    const match = REGIONS.find((r) => r.key === key).match;
    assert.deepStrictEqual(ids(rows.filter((s) => match.includes(s.region)), day), ids(rows, day), `${day.toISOString().slice(0, 10)} 오늘 추천 코스가 권역 파일만으로 다르다`);
  }
  const full = ids(rows);
  const part = ids(rows.filter((s) => want.includes(s.region)));
  assert.ok(full && full.ids.some(Boolean), '전국 데이터로 오늘 추천 코스를 만들지 못했다');
  assert.strictEqual(full.region, daily, '오늘 추천 권역이 dailyPick과 다르다');
  assert.deepStrictEqual(part, full, '권역 파일만으로 만든 오늘 추천 코스가 전국 데이터 코스와 다르다');
  console.log(`ok test-spots-regions (${Object.keys(index.files).length}개 권역, 첫 방문 ${daily.toLowerCase()} 1개 요청, 오늘 추천 ${full.ids.filter(Boolean).length}곳 같음)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
