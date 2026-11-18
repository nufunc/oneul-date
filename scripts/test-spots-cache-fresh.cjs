// 스팟 캐시 저장 시각 판정 회귀 테스트(P-321): node scripts/test-spots-cache-fresh.cjs
// src/supabase.ts의 isSpotsCacheFresh를 떼어 저장 시각별 판정과 호출처 연결을 묶는다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'supabase.ts'), 'utf8');
const mainTs = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');

const ts = require('typescript');
const keyM = src.match(/const SPOTS_SAVED_AT_KEY = '([^']+)';/);
const readM = src.match(/function readSpotsSavedAt[\s\S]*?\n}\n/);
const fnM = src.match(/export function staleSpotRegionKeys[\s\S]*?\n}\n/);
assert(keyM, 'SPOTS_SAVED_AT_KEY를 찾지 못했다');
assert(readM && fnM, 'readSpotsSavedAt이나 staleSpotRegionKeys를 찾지 못했다');
const js = ts.transpile(readM[0] + fnM[0].replace('export function', 'function'), { target: 'es2022' });
const make = (store) =>
  new Function('localStorage', 'SPOTS_SAVED_AT_KEY', `${js}; return staleSpotRegionKeys;`)(
    { getItem: (k) => { if (store === 'throw') throw new Error('blocked'); return k in store ? store[k] : null; } },
    keyM[1],
  );

const H = 3600 * 1000;
const MAX = 6 * H;
const K = ['SEOUL', 'JEJU'];
const ago = (ms) => Date.now() - ms;
const legacy = (ms) => ({ [keyM[1]]: String(ago(ms)) });
const perRegion = (map) => ({ [keyM[1]]: JSON.stringify(map) });

assert.deepStrictEqual(make({})(K, MAX), K, '키 없음');
// 전체를 한 번에 받던 캐시(숫자 하나)는 모든 권역에 같은 시각을 쓴다
assert.deepStrictEqual(make(legacy(5 * H + 59 * 60000))(K, MAX), [], '5시간 59분 전');
assert.deepStrictEqual(make(legacy(6 * H + 60000))(K, MAX), K, '6시간 1분 전');
assert.deepStrictEqual(make(legacy(-H))(K, MAX), K, '미래');
assert.deepStrictEqual(make({ [keyM[1]]: 'abc' })(K, MAX), K, '깨진 값');
assert.deepStrictEqual(make({ [keyM[1]]: '' })(K, MAX), K, '빈 문자열');
assert.deepStrictEqual(make('throw')(K, MAX), K, 'localStorage 예외');
// P-505: 권역별 시각은 권역마다 판정하고, 시각이 없는 권역은 지난 것으로 본다
assert.deepStrictEqual(make(perRegion({ SEOUL: ago(H), JEJU: ago(7 * H) }))(K, MAX), ['JEJU'], '권역별 판정');
assert.deepStrictEqual(make(perRegion({ SEOUL: ago(H) }))(K, MAX), ['JEJU'], '시각 없는 권역');
assert.deepStrictEqual(make(perRegion({ SEOUL: 'x', JEJU: ago(-H) }))(K, MAX), K, '깨진 권역 시각과 미래');

// 시각은 IndexedDB 저장이 끝난 뒤에만 쓴다
const saveM = src.match(/export async function saveSpotsToCache[\s\S]*?\n}\n/)[0];
assert(saveM.indexOf('tx.oncomplete') < saveM.indexOf('localStorage.setItem'), '저장 완료 전에 시각을 쓴다');
// 권역 시각은 받은 권역만 바꾼다
assert(/for \(const k of regionKeys\) next\[k\] = now;/.test(saveM), '받은 권역의 시각만 바꾸지 않는다');
// 새로고침은 캐시가 있는 분기에서 지난 권역만 뒤에서(refresh) 다시 받는다
assert(/const stale = staleSpotRegionKeys\(cachedKeys, 6 \* 60 \* 60 \* 1000\);\s*if \(stale\.length > 0\) setTimeout\(\(\) => \{ ensureSpotsForRegions\(stale, true\)/.test(mainTs), '시작 새로고침 건너뛰기 연결이 바뀌었다');
// 청크 일부가 실패한 전체 조회는 캐시에 저장하지 않는다
assert.ok(src.includes('uniqueIdMap.size >= total'), '부분 데이터 저장 차단 없음');
console.log('ok test-spots-cache-fresh');
