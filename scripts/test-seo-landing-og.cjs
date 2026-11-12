// 지역 랜딩 공유 사진 시험(P-383): npm run build 뒤 node scripts/test-seo-landing-og.cjs
// 랜딩 32쪽마다 og:image와 twitter:image가 같고, JSON-LD 목록에서 대상 호스트 사진을 가진 첫 스팟의 C1200x630 JPEG 주소인지 본다
// 그런 스팟이 없는 쪽만 og.png로 남고, og:image:width·height가 1200·630으로 하나씩이며, 사진을 쓴 쪽끼리 주소가 겹치지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const OG_HOST_RE = /^https?:\/\/(t1\.daumcdn\.net|t1\.kakaocdn\.net|tong\.visitkorea\.or\.kr)\//;
const OG_PREFIX = 'https://img1.daumcdn.net/thumb/C1200x630.fjpg/?fname=';
const DEFAULT = 'https://nufunc.github.io/oneul-date/og.png';
const dist = path.join(__dirname, '..', 'dist');
const unescape = (s) => s.replace(/&amp;/g, '&');

const landings = fs.readdirSync(dist, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => ['day', 'evening', 'night', 'stay'].map((slot) => path.join(dist, d.name, slot, 'index.html')))
  .filter((f) => fs.existsSync(f));
assert.strictEqual(landings.length, 32, `지역 랜딩이 32쪽이 아니다: ${landings.length}`);

const used = new Map();
let fallback = 0;
for (const f of landings) {
  const rel = path.relative(dist, f);
  const html = fs.readFileSync(f, 'utf8');
  const og = [...html.matchAll(/<meta property="og:image" content="([^"]*)" \/>/g)].map((m) => unescape(m[1]));
  const tw = [...html.matchAll(/<meta name="twitter:image" content="([^"]*)" \/>/g)].map((m) => unescape(m[1]));
  assert.strictEqual(og.length, 1, `${rel}: og:image가 하나가 아니다`);
  assert.deepStrictEqual(tw, og, `${rel}: twitter:image가 og:image와 다르다`);
  assert.deepStrictEqual(html.match(/<meta property="og:image:(width|height)" content="\d+" \/>/g),
    ['<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />'], `${rel}: og:image 크기가 1200x630 하나씩이 아니다`);

  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"ItemList".*?)<\/script>/)[1]);
  const photo = ld.itemListElement.map((e) => e.item).find((item) => OG_HOST_RE.test(item.image || ''));
  if (!photo) {
    assert.strictEqual(og[0], DEFAULT, `${rel}: 대상 호스트 사진이 없는데 og.png가 아니다`);
    fallback++;
    continue;
  }
  assert.strictEqual(og[0], OG_PREFIX + encodeURIComponent(photo.image), `${rel}: 목록 첫 사진 스팟(${photo.name})의 C1200x630 주소가 아니다`);
  assert.ok(!used.has(og[0]), `${rel}: ${used.get(og[0])}와 og:image가 같다`);
  used.set(og[0], rel);
}
assert.ok(used.size >= 24, `사진으로 바뀐 랜딩이 너무 적다: ${used.size}/32`);
console.log(`ok seo-landing-og (사진 ${used.size}쪽, og.png ${fallback}쪽)`);
