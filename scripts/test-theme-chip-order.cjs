// 테마 칩 순서 고정 시험(P-286): node scripts/test-theme-chip-order.cjs
// getCuratedThemeChips가 spots, 시각, 정렬로 순서를 매기지 않고 SPOT_EXPLORE_CATEGORIES를 그대로 돌려주는지 본다
// 매기면 첫 그림(번들 샘플)과 spots.json을 받은 뒤 그림의 순서가 달라 칩이 자리를 옮긴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const head = 'export function getCuratedThemeChips(): SpotCategoryItem[] {';
const at = src.indexOf(head);
assert.ok(at >= 0, 'getCuratedThemeChips 선언이 없다');
const end = src.indexOf('\n}\n', at);
const body = src.slice(at + head.length, end).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

for (const word of [/\bspots\b/, /new Date/, /\.sort\(/]) assert.ok(!word.test(body), `getCuratedThemeChips 본문이 ${word}를 쓴다`);
assert.match(body.trim(), /^return SPOT_EXPLORE_CATEGORIES;$/, 'getCuratedThemeChips가 SPOT_EXPLORE_CATEGORIES를 그대로 돌려주지 않는다');
assert.ok(!/themeChipCache/.test(src), 'themeChipCache가 남아 있다');

const block = src.slice(src.indexOf('export const SPOT_EXPLORE_CATEGORIES'), src.indexOf('];', src.indexOf('export const SPOT_EXPLORE_CATEGORIES')));
const keys = [...block.matchAll(/key:\s*'(\w+)'/g)].map((x) => x[1]);
assert.strictEqual(keys[0], 'ALL', '✨ 전체 칩이 맨 앞이 아니다');

console.log('test-theme-chip-order: 통과');
