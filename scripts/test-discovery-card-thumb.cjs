// 탐색 카드 사진 축소 주소 시험(P-260): node scripts/test-discovery-card-thumb.cjs
// src/main.ts renderDiscoverySpotCard의 카드 img가 toCardThumbUrl 축소 주소를 쓰고, 실패하면 원본으로 한 번 다시 받은 뒤 대체 표시로 넘어가는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fn = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}이 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};

const cardStart = src.indexOf('function renderDiscoverySpotCard(');
const card = src.slice(cardStart, src.indexOf('\n}\n', cardStart) + 3);
assert.ok(cardStart >= 0, 'renderDiscoverySpotCard가 없다');

// 탐색 카드 안의 img는 모두 cardImg 하나로 그린다(원본 주소를 src로 바로 쓰는 img가 남지 않는다)
assert.strictEqual((card.match(/<img /g) || []).length, 1, '탐색 카드 img 마크업이 cardImg 하나가 아니다');
assert.strictEqual((card.match(/\$\{cardImg\}/g) || []).length, 3, '2열, 3열, 5열 카드가 모두 cardImg를 쓰지 않는다');

const blockStart = card.indexOf('  const cardThumbUrl');
const blockEnd = card.indexOf(": '';\n", card.indexOf('const cardImg', blockStart)) + 5;
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'cardThumbUrl, cardImg 정의가 없다');
const code = `${fn('escapeHtml')}\n${fn('toCardThumbUrl')}\nreturn (targetImgUrl, spot) => {\n${card.slice(blockStart, blockEnd)}\nreturn cardImg; };`;
const render = new Function(ts.transpile(code, { target: 'es2022' }))();

const attrs = (html) => {
  const o = {};
  for (const m of html.matchAll(/ ([a-z-]+)="([^"]*)"/g)) o[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&#039;/g, "'");
  return o;
};

// 카카오 사진: 축소 주소로 받고 원본은 data-orig에 둔다
const K = 'https://t1.daumcdn.net/local/kakaomapPhoto/review/abc?original';
const a = attrs(render(K, { name: '가게' }));
assert.strictEqual(a.src, `https://img1.daumcdn.net/thumb/R400x400/?fname=${encodeURIComponent(K)}`);
assert.strictEqual(a['data-orig'], K);
assert.strictEqual(a.class, 'discovery-card-img discovery-img');

// 축소 대상이 아닌 주소: 원본 그대로이고 data-orig가 없다
const V = 'https://tong.visitkorea.or.kr/cms/a.jpg';
const b = attrs(render(V, { name: '관광지' }));
assert.strictEqual(b.src, V);
assert.ok(!('data-orig' in b), '축소하지 않은 주소에 data-orig가 붙었다');

// 사진이 없으면 img를 그리지 않는다
assert.strictEqual(render('', { name: 'x' }), '');

// onerror: 첫 실패는 원본으로 다시 받고, 두 번째 실패는 숨기고 대체 표시를 보인다
const onerror = new Function(a.onerror);
const fallback = { style: { display: 'none' } };
const el = { dataset: { orig: a['data-orig'] }, src: a.src, style: { display: '' }, previousElementSibling: fallback };
onerror.call(el);
assert.strictEqual(el.src, K, '첫 실패에서 원본으로 바꾸지 않았다');
assert.strictEqual(el.style.display, '', '첫 실패에서 사진을 숨겼다');
onerror.call(el);
assert.strictEqual(el.style.display, 'none', '두 번째 실패에서 사진을 숨기지 않았다');
assert.strictEqual(fallback.style.display, 'flex', '두 번째 실패에서 대체 표시를 보이지 않았다');

// 축소하지 않은 주소는 첫 실패에서 바로 대체 표시로 넘어간다
const fb2 = { style: { display: 'none' } };
const el2 = { dataset: {}, src: V, style: { display: '' }, previousElementSibling: fb2 };
new Function(b.onerror).call(el2);
assert.strictEqual(fb2.style.display, 'flex');

console.log('ok');
