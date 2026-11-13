// 번들 샘플 분리 시험: npm run build 뒤 node scripts/test-sample-lazy.cjs
// spots.sample.json을 정적 import하지 않고 spots.json 실패 폴백에서만 동적 import하는지 본다(P-414)
// 빌드 산출물이 있으면 진입 JS에 샘플 첫 항목이 없고 gzip 크기가 90KB 미만인지도 본다. 없으면 소스만 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const main = read('main.ts');
const supa = read('supabase.ts');
for (const [name, src] of [['main.ts', main], ['supabase.ts', supa]]) {
  assert.ok(!/^import[^\n]*spots\.sample\.json/m.test(src), `${name}가 샘플을 정적 import한다`);
}
assert.ok(/^let spots: Spot\[\] = \[\];$/m.test(main), 'main.ts의 spots 초깃값이 빈 배열이 아니다');

// 동적 import는 실패 폴백(spotsFellBackToSample = true 뒤, loadStaticSpots 끝) 안에만 있어야 한다
const start = supa.indexOf('export async function loadStaticSpots');
assert.ok(start >= 0, 'loadStaticSpots가 없다');
const body = supa.slice(start, supa.indexOf('\n}\n', start));
const fallback = body.indexOf('spotsFellBackToSample = true');
const lazy = body.indexOf("await import('./data/spots.sample.json')");
assert.ok(fallback >= 0 && lazy > fallback, '샘플 동적 import가 실패 폴백에 없다');
assert.strictEqual(supa.split("import('./data/spots.sample.json')").length, 2, '샘플 동적 import가 한 곳이 아니다');

// 받는 중 빈 목록을 '찾지 못했다'로 보이지 않는다
assert.ok(/spots\.length === 0 && fullSpotsPending\)[\s\S]{0,200}스팟을 불러오고 있어요/.test(main), '스팟 탐색 받는 중 문구가 없다');

const assets = path.join(__dirname, '..', 'dist', 'assets');
const entries = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f)) : [];
if (entries.length === 0) {
  console.log('ok sample-lazy (빌드 산출물 없음, 소스만 봄)');
} else {
  for (const f of entries) {
    const buf = fs.readFileSync(path.join(assets, f));
    assert.ok(!buf.toString('utf8').includes('별마로천문대'), `${f}에 샘플이 들어 있다`);
    const gz = zlib.gzipSync(buf).length;
    assert.ok(gz < 90 * 1024, `${f} gzip ${gz}바이트가 90KB 이상이다`);
  }
  console.log('ok sample-lazy');
}
