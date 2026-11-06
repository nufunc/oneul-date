// 찜 쓰기 실패 회귀 테스트: node scripts/test-save-spot-write-fail.cjs
// toggleSaveSpot을 src/main.ts에서 떼어 실행해, 쓰기가 막히면 상태와 반환값이 그대로이고 성공 토스트가 없는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (re) => {
  const start = src.search(re);
  assert.ok(start >= 0, `${re} 없음`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const code = ts.transpile(cut(/^function saveSavedSpotIds\(/m) + cut(/^function toggleSaveSpot\(/m), { target: 'es2022' });
const run = (writeOk, initial, id) => {
  const toasts = [];
  const state = { savedSpotIds: new Set(initial) };
  const localStorage = { setItem() { if (!writeOk) throw new Error('QuotaExceededError'); } };
  const fn = new Function('state', 'localStorage', 'showToast', 'SAVED_SPOTS_STORAGE_KEY',
    `${code};return toggleSaveSpot;`)(state, localStorage, (m) => toasts.push(m), 'k');
  return { ret: fn(id), ids: [...state.savedSpotIds], toasts };
};

let r = run(true, [], 1);
assert.deepStrictEqual([r.ret, r.ids, r.toasts], [true, [1], ['❤️ 보관함에 담았어요!']], '정상 담기');
r = run(true, [1], 1);
assert.deepStrictEqual([r.ret, r.ids, r.toasts], [false, [], ['보관함에서 제외했어요']], '정상 제외');
r = run(false, [], 1);
assert.deepStrictEqual([r.ret, r.ids], [false, []], '담기 쓰기 실패: 상태와 하트가 그대로여야 한다');
assert.ok(r.toasts.length === 1 && !r.toasts[0].includes('담았어요'), `담기 실패에 성공 토스트: ${r.toasts}`);
r = run(false, [1], 1);
assert.deepStrictEqual([r.ret, r.ids], [true, [1]], '제외 쓰기 실패: 상태와 하트가 그대로여야 한다');
assert.ok(r.toasts.length === 1 && !r.toasts[0].includes('제외했어요'), `제외 실패에 성공 토스트: ${r.toasts}`);
console.log('ok 4');
