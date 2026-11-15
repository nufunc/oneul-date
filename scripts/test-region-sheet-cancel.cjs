// 지역 시트 닫기 시험(P-459): node scripts/test-region-sheet-cancel.cjs
// ✕·Esc·바깥·뒤로 가기는 모두 closeOverlay로 닫으므로, closeOverlay가 지역 시트일 때만
// 연 시점 선택으로 되돌리는지와 '선택 완료'가 스냅숏을 비워 시트 안 변경을 확정하는지 본다.
// closeOverlay를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('\nfunction closeOverlay(') + 1;
const fn = src.slice(start, src.indexOf('\n}\n', start) + 3);

// overlay-root가 없으면 closeOverlay는 되돌림 뒤 바로 끝나므로 DOM 없이 되돌림만 볼 수 있다
const run = new Function(
  'state',
  'snapshot',
  `let isClosingOverlay = false; let regionSheetSnapshot = snapshot;
   const document = { getElementById: () => null };
   ${ts.transpile(fn, { target: 'es2022' })}
   closeOverlay();
   return regionSheetSnapshot;`,
);

const opened = { regions: ['SEOUL'], subZones: ['seongsu'] };
// 시트 안에서 성수를 빼고 영등포를 고른 상태(ux-343 S2)
let state = { regionSheetOpen: true, savedOpen: false, spotDetailId: null, regions: ['SEOUL'], subZones: ['yeongdeungpo'] };
let left = run(state, { regions: [...opened.regions], subZones: [...opened.subZones] });
assert.deepStrictEqual([state.regions, state.subZones], [['SEOUL'], ['seongsu']], '지역 시트를 닫았는데 연 시점 선택으로 돌아가지 않는다');
assert.strictEqual(left, null, '닫은 뒤 스냅숏이 남아 다음 시트 열기가 옛 선택을 기준으로 삼는다');

// 초기화 뒤 닫기(ux-343 S3)도 원래 선택으로 돌아간다
state = { regionSheetOpen: true, savedOpen: false, spotDetailId: null, regions: [], subZones: [] };
run(state, { regions: ['SEOUL'], subZones: ['seongsu'] });
assert.deepStrictEqual([state.regions, state.subZones], [['SEOUL'], ['seongsu']], '초기화 뒤 닫으면 원래 선택이 사라진다');

// 다른 시트(저장한 코스)를 닫을 때는 지역 선택을 건드리지 않는다
state = { regionSheetOpen: false, savedOpen: true, spotDetailId: null, regions: ['BUSAN'], subZones: [] };
run(state, { regions: ['SEOUL'], subZones: [] });
assert.deepStrictEqual(state.regions, ['BUSAN'], '지역 시트가 아닌 시트를 닫았는데 지역 선택이 바뀐다');

// 스냅숏은 지역 시트를 처음 그릴 때 한 번만 잡고(탭 전환 재렌더는 덮어쓰지 않음), 선택 완료가 비운 뒤 닫는다
assert.match(src, /if \(state\.regionSheetOpen\) \{\n\s*regionSheetSnapshot \?\?= \{ regions: \[\.\.\.state\.regions\], subZones: \[\.\.\.state\.subZones\] \};/,
  '지역 시트를 그릴 때 연 시점 선택을 복사해 두지 않는다');
const submit = src.slice(src.indexOf("'#btn-location-submit'"), src.indexOf('focusOverlayEntry();', src.indexOf("'#btn-location-submit'")));
assert.match(submit, /regionSheetSnapshot = null;\s*closeOverlay\(\);/, '선택 완료가 스냅숏을 비우지 않아 변경이 되돌려진다');
const reset = src.slice(src.indexOf("'#btn-location-reset'"), src.indexOf("'#btn-location-submit'"));
assert.ok(!reset.includes('regionSheetSnapshot'), '초기화가 스냅숏을 건드려 ✕로 닫아도 원래 선택이 돌아오지 않는다');

console.log('test-region-sheet-cancel: 통과');
