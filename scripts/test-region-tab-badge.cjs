// 지역 탭 선택 표시 시험(P-389): node scripts/test-region-tab-badge.cjs
// 지역 탭의 ● 표시가 스크린리더에 '검은 원'으로 읽히지 않고 '선택 있음'으로 전달되는지,
// 처음 그릴 때와 선택을 바꿀 때 같은 표시를 쓰고 뗄 때 문구도 함께 떼는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
assert.ok(
  src.includes(`const REGION_TAB_BADGE_HTML = '<span class="region-tab-badge" aria-hidden="true">●</span><span class="sr-only">, 선택 있음</span>';`),
  '선택 표시가 ●를 숨기고 선택 있음 문구를 두지 않는다',
);
assert.strictEqual((src.match(/REGION_TAB_BADGE_HTML/g) || []).length, 3, '처음 그리기와 동기화가 같은 표시를 쓰지 않는다');
assert.ok(!/className = 'region-tab-badge'/.test(src), '동기화가 문구 없는 표시를 따로 만든다');
assert.match(src, /badge\.nextElementSibling\?\.remove\(\);\s*badge\.remove\(\);/, '표시를 뗄 때 문구가 남는다');

console.log('test-region-tab-badge: 통과');
