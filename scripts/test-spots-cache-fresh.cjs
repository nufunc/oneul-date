// 스팟 캐시 저장 시각 판정 회귀 테스트(P-321): node scripts/test-spots-cache-fresh.cjs
// src/supabase.ts의 isSpotsCacheFresh를 떼어 저장 시각별 판정과 호출처 연결을 묶는다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'supabase.ts'), 'utf8');
const mainTs = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');

const keyM = src.match(/const SPOTS_SAVED_AT_KEY = '([^']+)';/);
const fnM = src.match(/export function isSpotsCacheFresh[\s\S]*?\n}\n/);
assert(keyM, 'SPOTS_SAVED_AT_KEY를 찾지 못했다');
assert(fnM, 'isSpotsCacheFresh를 찾지 못했다');
const js = fnM[0].replace('export function', 'function').replace('(maxAgeMs: number): boolean', '(maxAgeMs)');
const make = (store) =>
  new Function('localStorage', 'SPOTS_SAVED_AT_KEY', `${js}; return isSpotsCacheFresh;`)(
    { getItem: (k) => (k in store ? store[k] : null) },
    keyM[1],
  );

const H = 3600 * 1000;
const MAX = 6 * H;
const at = (ms) => ({ [keyM[1]]: String(Date.now() - ms) });

assert.strictEqual(make({})(MAX), false, '키 없음');
assert.strictEqual(make(at(5 * H + 59 * 60000))(MAX), true, '5시간 59분 전');
assert.strictEqual(make(at(6 * H + 60000))(MAX), false, '6시간 1분 전');
assert.strictEqual(make(at(-H))(MAX), false, '미래');
assert.strictEqual(make({ [keyM[1]]: 'abc' })(MAX), false, 'NaN');
assert.strictEqual(make({ [keyM[1]]: '' })(MAX), false, '빈 문자열');
assert.strictEqual(
  new Function('localStorage', 'SPOTS_SAVED_AT_KEY', `${js}; return isSpotsCacheFresh;`)(
    { getItem: () => { throw new Error('blocked'); } },
    keyM[1],
  )(MAX),
  false,
  'localStorage 예외',
);

// 시각은 IndexedDB 저장이 끝난 뒤에만 쓴다
const saveM = src.match(/export async function saveSpotsToCache[\s\S]*?\n}\n/)[0];
assert(saveM.indexOf('tx.oncomplete') < saveM.indexOf('localStorage.setItem'), '저장 완료 전에 시각을 쓴다');
// 새로고침은 캐시가 있는 분기에서만 건너뛴다
assert(/if \(!isSpotsCacheFresh\([^)]*\)\) setTimeout\(\(\) => \{\s*loadSpots\(\)/.test(mainTs), '시작 새로고침 건너뛰기 연결이 바뀌었다');
console.log('ok test-spots-cache-fresh');
