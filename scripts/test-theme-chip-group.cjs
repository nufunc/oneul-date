// 테마 칩 묶음 이름 시험(P-388): node scripts/test-theme-chip-group.cjs
// 지역 칩 묶음처럼 테마 칩 묶음도 role=group과 이름을 가져 스크린리더가 눌림 단추들의 묶음을 알리는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const wraps = src.match(/<div class="spot-category-scroll"[^>]*>/g) || [];
assert.strictEqual(wraps.length, 2, `테마 칩 묶음 수: ${wraps.length}`);
for (const w of wraps) {
  assert.ok(w.includes('role="group"') && w.includes('aria-label="테마 선택"'), `묶음 이름이 없다: ${w}`);
}

console.log('test-theme-chip-group: 통과');
