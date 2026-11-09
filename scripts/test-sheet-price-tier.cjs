// 장소 시트 가격 칸 문구 회귀 테스트: node scripts/test-sheet-price-tier.cjs
// PRICE_TIER_TEXT와 sheetPriceText를 src/main.ts에서 그대로 떼어 실행하고(앱 번들과 같은 코드), 템플릿 연결은 소스 문자열로 확인한다
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('const PRICE_TIER_TEXT');
const fnStart = src.indexOf('function sheetPriceText', start);
const end = src.indexOf('\n}\n', fnStart) + 3;
const sheetPriceText = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return sheetPriceText;`)();

// price_tier만 있는 행: 등급 문구가 "약"을 붙여 칸을 채운다
assert.strictEqual(sheetPriceText({ price_tier: '₩' }), '₩ · 약 1.5만 원 미만');
assert.strictEqual(sheetPriceText({ price_tier: '₩₩' }), '₩₩ · 약 1.5~3만 원');
assert.strictEqual(sheetPriceText({ price_tier: '₩₩₩' }), '₩₩₩ · 약 3~5만 원');
assert.strictEqual(sheetPriceText({ price_tier: '₩₩₩₩' }), '₩₩₩₩ · 약 5만 원 이상');
assert.strictEqual(sheetPriceText({ price_tier: 'FREE' }), '무료');
for (const t of ['₩', '₩₩', '₩₩₩', '₩₩₩₩']) assert.ok(sheetPriceText({ price_tier: t }).startsWith(t));

// 금액 문구가 있는 행: 기존 문구를 유지한다(등급이 있어도 덮지 않는다)
assert.strictEqual(sheetPriceText({ avg_price_per_person: 6500, price_tier: '₩₩₩₩' }), '1인 약 6,500원');
assert.strictEqual(sheetPriceText({ price: '1인 12,000원', price_tier: '₩' }), '1인 12,000원');
assert.strictEqual(sheetPriceText({ price: '9,000원' }), '9,000원');

// 둘 다 없는 행: 빈 문자열이라 칸이 숨겨진다
assert.strictEqual(sheetPriceText({}), '');
assert.strictEqual(sheetPriceText({ price_tier: null, price: '' }), '');
assert.strictEqual(sheetPriceText({ price_tier: '알 수 없음' }), '');

// 시트는 이 함수를 쓰고 값을 escapeHtml로 내보낸다
assert.ok(src.includes('const priceText = sheetPriceText(spot);'));
assert.ok(src.includes('<p class="meta-item-desc">${escapeHtml(priceText)}</p>'));
console.log('ok sheet price tier');
