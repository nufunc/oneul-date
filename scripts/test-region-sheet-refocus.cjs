// 지역 시트 다시 그리기 초점 시험(P-466): node scripts/test-region-sheet-refocus.cjs
// 시트 안에서 탭·전체 체크·초기화를 눌러 다시 그리면 누른 요소로 초점을 돌리고,
// 처음 열 때(초점이 시트 밖)만 닫기 버튼으로 초점을 보내는지 src/main.ts의 지역 시트 분기에서 본다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('  if (state.regionSheetOpen) {\n    regionSheetSnapshot');
assert.ok(start > 0, '지역 시트 분기를 찾지 못했다');
const branch = src.slice(start, src.indexOf('\n    return;\n  }\n', start));

const capture = branch.indexOf('const prevFocus = document.activeElement');
const paint = branch.indexOf('root.innerHTML');
assert.ok(capture > 0 && capture < paint, '다시 그리기 전에 직전 초점 요소를 기억하지 않는다');
assert.match(branch, /root\.contains\(prevFocus\)/, '시트 밖 초점(처음 열 때)을 시트 안 조작과 구분하지 않는다');
assert.match(branch, /closest<HTMLElement>\('\.zone-check-all'\)/, '전체 체크 라벨 안 체크박스 초점을 다루지 않는다');
assert.match(branch, /\[data-region-tab="\$\{CSS\.escape\(regionTab\)\}"\]/, '지역 탭 초점을 탭 키로 되찾지 않는다');
assert.match(
  branch,
  /if \(refocusSelector\) restoreFocusIn\(root, refocusSelector, '#overlay-close'\);\n\s*else focusOverlayEntry\(\);\s*$/,
  '다시 그린 뒤 매번 닫기로 초점을 보낸다',
);
console.log('test-region-sheet-refocus: ok');
