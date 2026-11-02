// 맞춤 코스 탭 세부 동네 칩 제거 시험(P-279): node scripts/test-course-no-subzone-chip.cjs
// 맞춤 코스 탭 조건 카드의 지역 칩 줄에는 + 세부 동네 칩이 없고, 스팟 탐색 탭 줄에는 남았는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

const fnAt = src.indexOf('function renderQuickRegionChips(');
assert.ok(fnAt >= 0, 'renderQuickRegionChips가 없다');
const fn = src.slice(fnAt, src.indexOf('\n}\n', fnAt));
const params = ((fn.match(/^function renderQuickRegionChips\(([^)]*)\)/) || [])[1] || '')
  .split(',')
  .map((p) => p.trim().split(/[\s=:]/)[0])
  .filter(Boolean);
const idx = params.findIndex((p) => new RegExp(`\\$\\{\\s*${p}\\s*\\?\\s*\\x60[^\\x60]*?data-action="open-detail-sheet"`).test(fn));
assert.ok(idx >= 0, '세부 동네 칩 마크업(data-action="open-detail-sheet")이 인자로 감싸져 있지 않다');

// 지역 칩 줄 id 뒤에 오는 첫 renderQuickRegionChips 호출에서 세부 동네 칩 인자의 값을 꺼낸다(빠지면 기본값)
const subZoneArg = (barId) => {
  const at = src.indexOf(`id="${barId}"`);
  assert.ok(at >= 0, `${barId} 줄이 없다`);
  const m = src.slice(at).match(/renderQuickRegionChips\(([^)]*)\)/);
  assert.ok(m, `${barId} 줄에 renderQuickRegionChips 호출이 없다`);
  const args = m[1].split(',').map((a) => a.trim()).filter(Boolean);
  return args[idx];
};

assert.strictEqual(subZoneArg('course-quick-region-bar'), 'false', '맞춤 코스 탭 지역 칩 줄이 + 세부 동네 칩을 그린다');
assert.notStrictEqual(subZoneArg('spot-quick-region-bar'), 'false', '스팟 탐색 탭 지역 칩 줄에서 + 세부 동네 칩이 빠졌다');

console.log('test-course-no-subzone-chip: 통과');
