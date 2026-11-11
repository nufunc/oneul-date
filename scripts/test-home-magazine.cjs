// 루트 첫 화면 빌드 결과 시험: npm run build 뒤 node scripts/test-home-magazine.cjs
// 루트에 최신 매거진 글 블록과 지역별 코스 링크 목록이 없는지 본다(2026-11-03 사용자 지시로 뺐다)
// 지역 랜딩 32쪽마다 본문이 하나이고 #app 앞에 있는지, 루트와 글에는 없는지 본다
// 루트에만 canonical, WebSite JSON-LD, #app 안 정적 h1이 하나씩 있고 지역 랜딩과 글에 루트 canonical이 복제되지 않았는지 본다(P-229)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const root = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const landing = fs.readFileSync(path.join(dist, 'seoul', 'day', 'index.html'), 'utf8');

for (const html of [root, landing]) {
  assert.ok(!html.includes('home-magazine'), '최신 매거진 글 블록이 남아 있다');
  assert.ok(!html.includes('home-regions'), '지역별 코스 링크 목록이 남아 있다');
}

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
assert.ok(root.includes('<div id="app"><h1 class="sr-only">오늘 데이트</h1>'), '정적 h1이 #app 안에 없다');
// JS를 실행하지 않는 크롤러용 매거진 링크도 #app 안에 있어야 앱이 그릴 때 사라진다(P-371)
assert.ok(root.includes('<a class="sr-only" href="./blog/">매거진</a></div>'), '정적 매거진 링크가 #app 안에 없다');
const rootCanonical = `<link rel="canonical" href="${SITE_URL}"`;
for (const f of landings) assert.ok(!fs.readFileSync(f, 'utf8').includes(rootCanonical), `지역 랜딩에 루트 canonical이 있다: ${f}`);
for (const slug of fs.readdirSync(blogDir)) {
  const f = path.join(blogDir, slug, 'index.html');
  if (fs.existsSync(f)) assert.ok(!fs.readFileSync(f, 'utf8').includes(rootCanonical), `글에 루트 canonical이 있다: ${slug}`);
}
console.log('ok home-magazine');
