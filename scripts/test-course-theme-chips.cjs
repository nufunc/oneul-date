// 맞춤 코스 탭 테마 칩 넷 제거 시험(P-282): node scripts/test-course-theme-chips.cjs
// 맞춤 코스 탭 칩 줄은 ROMANTIC, EXPERIENCE, DRIVE, STAY를 거르고, 스팟 탐색 탭 칩 줄과 낱말 목록은 그대로인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const DROPPED = ['DRIVE', 'EXPERIENCE', 'ROMANTIC', 'STAY'];

// 기준 문자열 뒤에 오는 첫 getCuratedThemeChips() 호출에서 .map( 앞까지의 식을 꺼낸다
const chipChain = (anchor) => {
  const at = src.indexOf(anchor);
  assert.ok(at >= 0, `${anchor}가 없다`);
  const call = src.indexOf('getCuratedThemeChips()', at);
  assert.ok(call >= 0, `${anchor} 뒤에 getCuratedThemeChips 호출이 없다`);
  return src.slice(call, src.indexOf('.map(', call)).replace(/\/\*[\s\S]*?\*\//g, '');
};

// 맞춤 코스 탭 칩 목록은 renderConditions 첫머리에서 만든다(P-288)
const course = chipChain('function renderConditions(');
const m = course.match(/\.filter\(\s*\(?(\w+)\)?\s*=>\s*!\s*\[([^\]]*)\]\.includes\(\s*\1\.key\s*\)\s*\)/);
assert.ok(m, '맞춤 코스 탭 칩 줄에 키 목록 거르기가 없다');
const keys = m[2].split(',').map((k) => k.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
assert.deepStrictEqual(keys, DROPPED, '맞춤 코스 탭 칩 줄이 거르는 키가 넷과 다르다');

assert.ok(!/\.filter\(/.test(chipChain('id="spot-quick-region-bar"')), '스팟 탐색 탭 칩 줄에 거르기가 들어갔다');

const block = src.slice(src.indexOf('export const SPOT_EXPLORE_CATEGORIES'), src.indexOf('];', src.indexOf('export const SPOT_EXPLORE_CATEGORIES')));
const allKeys = [...block.matchAll(/key:\s*'(\w+)'/g)].map((x) => x[1]).filter((k) => k !== 'ALL');
assert.strictEqual(allKeys.length, 13, `SPOT_EXPLORE_CATEGORIES 테마 키가 13개가 아니다: ${allKeys.length}`);
for (const k of DROPPED) assert.ok(allKeys.includes(k), `SPOT_EXPLORE_CATEGORIES에서 ${k}가 빠졌다`);

console.log('test-course-theme-chips: 통과');
