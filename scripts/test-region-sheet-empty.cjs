// 지역 시트 빈 선택 시험(P-460): node scripts/test-region-sheet-empty.cjs
// 체크가 0개인데 '선택 완료'가 보고 있던 탭 권역 전체를 적용하거나, 마지막 동네를 해제해도 권역이 남아
// 보이는 체크와 결과가 어긋났다(ux-343 S4·S5·S7). 보정이 사라졌는지, 마지막 동네 해제가 권역도 빼는지,
// 동네 토글 뒤 '전국' 탭 ● 표시도 함께 맞추는지 소스에서 본다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const between = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i >= 0, `없음: ${a}`);
  return src.slice(i, src.indexOf(b, i));
};

const submit = between("'#btn-location-submit'", 'focusOverlayEntry();');
assert.ok(!/state\.regions = \[/.test(submit), '선택 완료가 빈 선택을 보고 있던 탭 권역으로 바꾼다');

const toggle = between("'.zone-check-item'", "'#btn-location-reset'");
assert.match(toggle, /if \(hasAnyInReg\) \{[\s\S]*?\} else \{\s*state\.regions = state\.regions\.filter\(\(r\) => r !== activeReg\);/,
  '권역의 마지막 동네를 해제해도 그 권역이 선택에 남는다');
assert.match(toggle, /syncTabBadge\(activeReg, state\.regions\.includes\(activeReg\) \|\| hasAnyInReg\);/, '보는 탭 ● 표시를 맞추지 않는다');
assert.match(toggle, /syncTabBadge\('ALL', state\.regions\.length === 0\);/, "동네를 고르거나 다 해제해도 '전국' 탭 ● 표시가 그대로다");

// 권역 전체 칩을 끄는 경로도 같은 규칙: 그 권역 동네와 권역을 함께 뺀다
const all = between('const toggleAllZonesInActiveRegion', "'.zone-check-all[data-zone-all]'");
assert.match(all, /subZonesInTab\.forEach\(\(z\) => currentSubZones\.delete\(z\.key\)\);\s*state\.regions = state\.regions\.filter\(\(r\) => r !== activeReg\);/,
  '권역 전체 칩을 꺼도 권역이 선택에 남는다');

console.log('test-region-sheet-empty: 통과');
