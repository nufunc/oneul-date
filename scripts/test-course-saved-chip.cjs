// 맞춤 코스 탭 찜 칩 제거 시험(P-276): node scripts/test-course-saved-chip.cjs
// 맞춤 코스 탭 조건 카드의 지역 칩 줄에는 찜 칩이 없고, 스팟 탐색 탭 줄에는 찜 칩이 남았는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

// 지역 칩 줄 id 뒤에 오는 첫 renderQuickRegionChips 호출의 인자를 꺼낸다
const callArgs = (barId) => {
  const at = src.indexOf(`id="${barId}"`);
  assert.ok(at >= 0, `${barId} 줄이 없다`);
  const m = src.slice(at).match(/renderQuickRegionChips\(([^)]*)\)/);
  assert.ok(m, `${barId} 줄에 renderQuickRegionChips 호출이 없다`);
  // 첫 인자(찜 칩)만 본다. 둘째 인자는 세부 동네 칩이다(P-279)
  return m[1].split(',')[0].trim();
};

const fnAt = src.indexOf('function renderQuickRegionChips(');
assert.ok(fnAt >= 0, 'renderQuickRegionChips가 없다');
const fn = src.slice(fnAt, src.indexOf('\n}\n', fnAt));
const param = (fn.match(/^function renderQuickRegionChips\((\w+)/) || [])[1];
assert.ok(param, 'renderQuickRegionChips에 찜 칩을 넣을지 정하는 인자가 없다');
assert.ok(new RegExp(`\\$\\{\\s*${param}\\s*\\?[\\s\\S]*?data-action="toggle-saved"`).test(fn), `찜 칩 마크업이 ${param} 인자로 감싸져 있지 않다`);

assert.strictEqual(callArgs('course-quick-region-bar'), 'false', '맞춤 코스 탭 지역 칩 줄이 찜 칩을 그린다');
assert.notStrictEqual(callArgs('spot-quick-region-bar'), 'false', '스팟 탐색 탭 지역 칩 줄에서 찜 칩이 빠졌다');

console.log('test-course-saved-chip: 통과');
