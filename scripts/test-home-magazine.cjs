// 루트 매거진 블록 빌드 결과 시험: npm run build 뒤 node scripts/test-home-magazine.cjs
// dist/index.html에만 블록이 하나 있고 글 링크 4개와 목록 링크 1개가 있는지, 지역 랜딩에는 없는지 본다
// 지역 랜딩 링크 목록도 루트에만 하나 있고 링크 32개가 모두 dist의 실제 랜딩을 가리키는지 본다
// 지역 랜딩 32쪽마다 본문이 하나이고 #app 앞에 있는지, 루트와 글에는 없는지 본다
// 루트에만 canonical, WebSite JSON-LD, #app 안 정적 h1이 하나씩 있고 지역 랜딩과 글에 루트 canonical이 복제되지 않았는지 본다(P-229)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const root = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const landing = fs.readFileSync(path.join(dist, 'seoul', 'day', 'index.html'), 'utf8');

assert.strictEqual(root.match(/id="home-magazine"/g)?.length, 1, '루트에 매거진 블록이 1개가 아니다');
const section = root.slice(root.indexOf('id="home-magazine"'), root.indexOf('</section>', root.indexOf('id="home-magazine"')));
assert.strictEqual(section.match(/href="\.\/blog\/[a-z0-9-]+\/"/g)?.length, 4, '글 링크가 4개가 아니다');
assert.strictEqual(section.match(/href="\.\/blog\/"/g)?.length, 1, '매거진 목록 링크가 1개가 아니다');
// 블록은 #app 앞에 있어야 앱이 innerHTML을 갈아 끼워도 남는다
assert.ok(root.indexOf('id="home-magazine"') < root.indexOf('<div id="app">'), '블록이 #app 앞에 없다');
assert.ok(!landing.includes('home-magazine'), '지역 랜딩에 매거진 블록이 있다');

assert.strictEqual(root.match(/id="home-regions"/g)?.length, 1, '루트에 지역 링크 목록이 1개가 아니다');
const nav = root.slice(root.indexOf('id="home-regions"'), root.indexOf('</nav>', root.indexOf('id="home-regions"')));
const regionLinks = [...nav.matchAll(/href="\.\/([a-z]+)\/(day|evening|night|stay)\/"/g)];
assert.strictEqual(regionLinks.length, 32, '지역 랜딩 링크가 32개가 아니다');
for (const [, region, slot] of regionLinks) {
  assert.ok(fs.existsSync(path.join(dist, region, slot, 'index.html')), `링크 대상이 dist에 없다: ${region}/${slot}`);
}
assert.ok(root.indexOf('<div id="app">') < root.indexOf('id="home-regions"'), '지역 링크 목록이 #app 뒤에 없다');
assert.ok(!landing.includes('home-regions'), '지역 랜딩에 지역 링크 목록이 있다');

// 지역 랜딩 본문은 #app 앞에 있어야 앱이 그린 뒤 밀려 내려가지 않는다(P-227, CLS 0.886)
const landings = fs.readdirSync(dist, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => ['day', 'evening', 'night', 'stay'].map((slot) => path.join(dist, d.name, slot, 'index.html')))
  .filter((f) => fs.existsSync(f));
assert.strictEqual(landings.length, 32, `지역 랜딩이 32쪽이 아니다: ${landings.length}`);
for (const f of landings) {
  const html = fs.readFileSync(f, 'utf8');
  assert.strictEqual(html.match(/id="seo-landing"/g)?.length, 1, `지역 랜딩 본문이 1개가 아니다: ${f}`);
  assert.ok(html.indexOf('id="seo-landing"') < html.indexOf('<div id="app">'), `지역 랜딩 본문이 #app 앞에 없다: ${f}`);
}
assert.ok(!root.includes('seo-landing'), '루트에 지역 랜딩 본문이 있다');
const blogDir = path.join(dist, 'blog');
for (const slug of fs.readdirSync(blogDir)) {
  const f = path.join(blogDir, slug, 'index.html');
  if (fs.existsSync(f)) assert.ok(!fs.readFileSync(f, 'utf8').includes('seo-landing'), `글에 지역 랜딩 본문이 있다: ${slug}`);
}

const SITE_URL = 'https://nufunc.github.io/oneul-date/';
const canonicals = [...root.matchAll(/<link rel="canonical" href="([^"]*)"/g)];
assert.strictEqual(canonicals.length, 1, '루트 canonical이 1개가 아니다');
assert.strictEqual(canonicals[0][1], SITE_URL, '루트 canonical 값이 다르다');
const jsonLds = [...root.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
assert.ok(jsonLds.length >= 1, '루트에 JSON-LD가 없다');
const site = jsonLds.find((j) => j['@type'] === 'WebSite');
assert.ok(site, '루트 JSON-LD에 WebSite가 없다');
assert.strictEqual(site.url, SITE_URL, 'WebSite url이 다르다');
assert.strictEqual(site.name, '오늘 데이트', 'WebSite name이 다르다');
assert.strictEqual(site.description, root.match(/<meta name="description" content="([^"]*)"/)[1], 'WebSite description이 meta description과 다르다');
assert.strictEqual(root.match(/<h1[\s>]/g)?.length, 1, '루트 정적 h1이 1개가 아니다');
// 정적 h1은 #app 안에 있어야 앱이 innerHTML을 갈아 끼울 때 사라져 앱 h1과 겹치지 않는다
assert.ok(root.includes('<div id="app"><h1 class="sr-only">오늘 데이트</h1></div>'), '정적 h1이 #app 안에 없다');
const rootCanonical = `<link rel="canonical" href="${SITE_URL}"`;
for (const f of landings) assert.ok(!fs.readFileSync(f, 'utf8').includes(rootCanonical), `지역 랜딩에 루트 canonical이 있다: ${f}`);
for (const slug of fs.readdirSync(blogDir)) {
  const f = path.join(blogDir, slug, 'index.html');
  if (fs.existsSync(f)) assert.ok(!fs.readFileSync(f, 'utf8').includes(rootCanonical), `글에 루트 canonical이 있다: ${slug}`);
}
console.log('ok home-magazine');
