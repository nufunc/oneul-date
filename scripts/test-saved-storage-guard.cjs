// 저장 목록 보호 시험(P-407, P-408): node scripts/test-saved-storage-guard.cjs
// loadSavedCourses를 떼어 가짜 localStorage로 실행해, 형태가 틀린 항목은 거르고
// 파싱이 실패하면 원문을 _broken 키에 한 번만 보관하는지 본다. 카카오톡 안 저장 문구도 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function loadSavedCourses(): SavedCourse[] {');
const end = src.indexOf('\n}\n', start) + 2;
assert.ok(start >= 0 && end > start, 'loadSavedCourses를 찾지 못했다');
const js = src
  .slice(start, end)
  .replace('(): SavedCourse[]', '()')
  .replace(': string | null', '')
  .replace('(parsed as SavedCourse[])', 'parsed');

function run(initial) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const fn = new Function('localStorage', 'STORAGE_KEY', `${js}; return loadSavedCourses();`);
  return { list: fn(localStorage, 'k'), store, again: () => fn(localStorage, 'k') };
}

const ok = { spotIds: [1, 2], conditions: { region: '서울' }, title: 't' };
const r1 = run({ k: JSON.stringify([{ spotIds: [3] }, null, ok]) });
assert.deepStrictEqual(r1.list, [ok], '형태가 틀린 항목을 거르지 않는다');
assert.ok(!r1.store.has('k_broken'), '정상 JSON인데 원문을 보관했다');

const broken = JSON.stringify([ok]).slice(0, -5);
const r2 = run({ k: broken });
assert.deepStrictEqual(r2.list, [], '손상 JSON에서 빈 목록이 아니다');
assert.strictEqual(r2.store.get('k_broken'), broken, '손상 원문을 보관하지 않는다');
r2.store.set('k', '{also broken');
r2.again();
assert.strictEqual(r2.store.get('k_broken'), broken, '먼저 보관한 원문을 덮었다');

assert.deepStrictEqual(run({}).list, [], '빈 저장소에서 빈 목록이 아니다');

assert.ok(
  src.includes("/KAKAOTALK/i.test(navigator.userAgent)\n          ? '💾 저장했어요. 카카오톡 안에서 저장한 코스는 카카오톡에서 열 때만 보여요'"),
  '카카오톡 안 저장 문구가 없다',
);

console.log('test-saved-storage-guard: 통과');
