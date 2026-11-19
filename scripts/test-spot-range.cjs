// 받은 링크 id 구간 조각 조회 회귀 테스트: node scripts/test-spot-range.cjs
// shardFor·findSpotsByRange를 src/supabase.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사).
// P-513: Cloudflare Pages가 Range에 200을 돌려줘 단일 spots.json Range 탐색을 id 구간 조각(data/spots/by-id/<첫 id>.json)으로 바꿨다.
// dist가 있으면 빌드한 조각을 합친 결과가 public/data/spots.json과 같고, 조각이 25MiB보다 훨씬 작고, dist에 spots.json이 없는지도 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'supabase.ts'), 'utf8');
const urlLine = /^const shardUrl = .*$/m.exec(src)[0];
const start = src.indexOf('const RANGE_TIMEOUT_MS');
const end = src.indexOf('\n}\n', src.indexOf('async function findSpotsByRange')) + 3;
const code = ts.transpile(
  `${urlLine}\n${src.slice(start, end)}`.replace(/^export /gm, '').replace(/import\.meta\.env\.BASE_URL/g, "'/oneul-date/'"),
  { target: 'es2022' },
);
const load = (shards) =>
  new Function('normalizeSpots', 'SPOT_SHARDS', `${code};return { shardFor, findSpotsByRange };`)((rows) => rows, shards);

// 가짜 행 600개를 조각 6개로 나눈다(조각 첫 id가 오름차순)
const rows = Array.from({ length: 600 }, (_, i) => ({ id: 1000 + i * 7, name: `한글 스팟 ${i}` }));
const files = {};
for (let i = 0; i < rows.length; i += 100) files[rows[i].id] = rows.slice(i, i + 100);
const firsts = Object.keys(files).map(Number);
const { shardFor, findSpotsByRange } = load(firsts);

// 1. 조각 고르기: 첫 id 이하의 마지막 조각, 첫 조각보다 작으면 null
assert.strictEqual(shardFor(rows[0].id), rows[0].id);
assert.strictEqual(shardFor(rows[99].id), rows[0].id, '조각 마지막 행');
assert.strictEqual(shardFor(rows[100].id), rows[100].id, '다음 조각 첫 행');
assert.strictEqual(shardFor(rows.at(-1).id + 100), rows[500].id, '마지막 조각 뒤 id');
assert.strictEqual(shardFor(999), null, '첫 조각보다 작은 id');
assert.strictEqual(shardFor(5, []), null, '조각 목록이 비면 null');

let urls = [];
let status = 200;
global.fetch = async (url, init) => {
  assert.ok(init && init.signal, 'fetch에 signal을 넘기지 않았다');
  urls.push(url);
  const m = /\/oneul-date\/data\/spots\/by-id\/(\d+)\.json$/.exec(url);
  const body = m && files[m[1]];
  const st = body ? status : 404;
  return { ok: st === 200, status: st, json: async () => body };
};
const run = async (ids, st = 200) => {
  urls = [];
  status = st;
  return findSpotsByRange(ids);
};

(async () => {
  // 2. 여러 조각에 걸친 id를 찾고, 같은 조각은 한 번만 받는다
  const ids = [rows[0].id, rows[42].id, rows.at(-1).id, rows[99].id];
  assert.deepStrictEqual(await run(ids), [rows[0], rows[42], rows.at(-1), rows[99]], '조각 조회 결과');
  assert.deepStrictEqual(urls.sort(), [`/oneul-date/data/spots/by-id/${rows[0].id}.json`, `/oneul-date/data/spots/by-id/${rows[500].id}.json`], '받은 조각');
  for (const r of rows) assert.deepStrictEqual(await run([r.id]), [r], `id ${r.id}`);

  // 3. 하나라도 못 찾으면 빈 배열이다(호출부가 권역 파일을 기다린다)
  assert.deepStrictEqual(await run([rows[5].id, rows[5].id + 1]), [], '조각 안에 없는 id');
  assert.deepStrictEqual(await run([rows[5].id, 999]), [], '첫 조각보다 작은 id');
  assert.deepStrictEqual(await run([rows[5].id], 404), [], '조각 404');
  assert.deepStrictEqual(await run([rows[5].id], 500), [], '조각 500');
  assert.deepStrictEqual(await run([]), []);
  assert.deepStrictEqual(await load([]).findSpotsByRange([rows[5].id]), [], '조각 목록이 빈 빌드(개발 서버)');

  // 4. 빌드 산출물: 조각을 합치면 spots.json과 같고, 조각은 작고, 단일 spots.json은 배포하지 않는다
  const dist = path.join(root, 'dist', 'data');
  const shardDir = path.join(dist, 'spots', 'by-id');
  if (!fs.existsSync(shardDir)) {
    console.log('SKIP dist/data/spots/by-id 없음: 산출물 검사를 건너뜀');
  } else {
    assert.ok(!fs.existsSync(path.join(dist, 'spots.json')), 'dist/data/spots.json이 남아 있다');
    const names = fs.readdirSync(shardDir).filter((f) => f.endsWith('.json'));
    const sizes = names.map((f) => fs.statSync(path.join(shardDir, f)).size);
    assert.ok(Math.max(...sizes) < 2 * 1024 * 1024, `조각 최대 ${Math.max(...sizes)}B가 2MiB를 넘는다`);
    const merged = names
      .map((f) => Number(f.replace('.json', '')))
      .sort((a, b) => a - b)
      .flatMap((first) => {
        const part = JSON.parse(fs.readFileSync(path.join(shardDir, `${first}.json`), 'utf8'));
        assert.strictEqual(part[0].id, first, `조각 ${first}의 첫 행 id가 파일 이름과 다르다`);
        return part;
      });
    // 바이트가 아니라 값으로 비교한다: 수집기(Python)와 빌드(JSON.stringify)의 실수 표기가 다르다(1e-05와 0.00001)
    const all = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
    assert.deepStrictEqual(merged, all, '조각을 합친 결과가 public/data/spots.json과 다르다');
    console.log(`OK 조각 ${names.length}개, 최대 ${Math.max(...sizes)}B, 합친 행 ${merged.length}개`);
  }
  console.log('ok spot-range');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
