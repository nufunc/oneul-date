// 캐치테이블 매장 링크 회귀 테스트: node scripts/test-catchtable-url.cjs
// getCatchtableUrl을 src/main.ts에서 떼어 실행한다. 수집기가 만든 검색 주소는 매장 링크로 내지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function getCatchtableUrl');
assert(start >= 0, 'src/main.ts에 getCatchtableUrl이 없다');
const code = src.slice(start, src.indexOf('\n}\n', start) + 3);
const getCatchtableUrl = new Function(`${ts.transpile(code, { target: 'es2022' })};return getCatchtableUrl;`)();

const shop = 'https://app.catchtable.co.kr/ct/shop/jueun';
const search = 'https://app.catchtable.co.kr/ct/shop/search?keyword=%EC%A3%BC%EC%9D%80';
assert.strictEqual(getCatchtableUrl({ source: { url: search } }), null, '검색 주소를 매장 링크로 냈다');
assert.strictEqual(getCatchtableUrl({ source: { url: shop } }), shop);
assert.strictEqual(getCatchtableUrl({ booking_info: { url: search }, social_links: { catchtable: { url: shop } } }), shop);
assert.strictEqual(getCatchtableUrl({ source: { url: 'https://www.catchtable.net/abc' } }), 'https://www.catchtable.net/abc');
assert.strictEqual(getCatchtableUrl({ source: { url: 'https://naver.me/x' } }), null);
assert.strictEqual(getCatchtableUrl({}), null);

console.log('test-catchtable-url: ok');
