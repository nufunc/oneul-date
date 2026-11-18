// 장소 데이터 요청 경로 시험(P-487): npm run build 뒤 node scripts/test-data-fetch-base.cjs
// 지역 랜딩(/oneul-date/seoul/evening/ 등)에서 ./data/ 상대 요청이 문서 기준으로 풀려 404가 나지 않도록,
// src/에 문서 기준 `./data/` fetch가 남아 있지 않은지와 빌드 산출물(dist/assets의 JS)의 데이터 요청 주소가 /oneul-date/data/로 시작하는지 본다.
// 빌드 산출물이 없으면 산출물 검사는 건너뛴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

// 1. 소스: fetch('./data/...')와 RANGE_URL 같은 './data/' 문자열 상수가 없어야 한다(번들 import('./data/spots.sample.json')은 대상이 아니다)
const RELATIVE = /['"`]\.\/data\//;
const offenders = walk(path.join(root, 'src'))
  .filter((f) => /\.(ts|js|cjs|mjs)$/.test(f))
  .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
    .map((line, i) => ({ line, at: `${path.relative(root, f)}:${i + 1}` }))
    .filter(({ line }) => RELATIVE.test(line) && !/import\(\s*['"`]\.\/data\//.test(line))
    .map(({ at, line }) => `${at} ${line.trim()}`));
assert.deepStrictEqual(offenders, [], `문서 기준 ./data/ 요청이 남아 있다:\n${offenders.join('\n')}`);

// 2. 산출물: 데이터 요청 주소는 /oneul-date/data/로 시작해야 한다. 빌드가 BASE_PATH를 받았으면 그 값이다(P-485)
const BASE = process.env.BASE_PATH || '/oneul-date/';
const assets = path.join(root, 'dist', 'assets');
if (!fs.existsSync(assets)) {
  console.log('SKIP dist/assets 없음: 산출물 검사를 건너뜀(src 검사는 통과)');
} else {
  const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
  // 권역 파일은 `${base}data/spots/${f}.cols.json` 꼴이라 앞부분만 본다(P-505)
  for (const name of ['spots/', 'spots.json', 'spot_aliases.json', 'stations.json']) {
    assert.ok(js.includes(`${BASE}data/${name}`), `산출물에 ${BASE}data/${name} 요청이 없다`);
  }
  const bad = js.match(/['"`]\.\/data\/[\w.]+\.json['"`]/g) || [];
  assert.deepStrictEqual(bad, [], `산출물에 문서 기준 ./data/ 주소가 남아 있다: ${bad.join(', ')}`);
  console.log(`OK src와 dist/assets의 데이터 요청 주소가 ${BASE}data/ 기준`);
}
