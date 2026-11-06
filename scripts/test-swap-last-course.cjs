// 칸 교체 뒤 마지막 코스 저장 회귀 테스트: node scripts/test-swap-last-course.cjs
// saveLastCourse를 src/main.ts에서 떼어 실행해, 교체 결과가 저장되고 다시 불러오면 복원되며 쓰기 거부에도 던지지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.search(/^function saveLastCourse\(/m);
assert.ok(start >= 0, 'saveLastCourse 없음');
const code = ts.transpile(src.slice(start, src.indexOf('\n}\n', start) + 3), { target: 'es2022' });
const make = (store, writeOk = true) => {
  const sessionStorage = { setItem(k, v) { if (!writeOk) throw new Error('QuotaExceededError'); store[k] = v; } };
  return (state) => new Function('state', 'sessionStorage', 'LAST_COURSE_STORAGE_KEY', `${code};return saveLastCourse;`)(state, sessionStorage, 'k')();
};

const conditions = { regions: ['SEOUL'] };
const state = { course: [{ slot: 'a', spotId: 1 }, { slot: 'b', spotId: 2 }, { slot: 'c', spotId: null }], courseConditions: conditions };
const store = {};
make(store)(state);
assert.deepStrictEqual(JSON.parse(store.k), { ids: [1, 2], conditions }, '최초 저장');
// 교체: 둘째 칸을 9로 바꾼 뒤 저장하면 복원 값이 교체 결과여야 한다
state.course[1] = { slot: 'b', spotId: 9 };
make(store)(state);
assert.deepStrictEqual(JSON.parse(store.k).ids, [1, 9], '교체 결과가 저장돼야 한다');
// 코스가 없으면 쓰지 않는다
const empty = {};
make(empty)({ course: null, courseConditions: null });
assert.deepStrictEqual(empty, {}, '코스 없음: 쓰지 않는다');
// 쓰기 거부에도 던지지 않는다
assert.doesNotThrow(() => make({}, false)(state), '쓰기 거부에서 던지면 화면이 멈춘다');
// swapStep이 교체 직후 저장을 부른다
const swap = src.slice(src.search(/^function swapStep\(/m));
assert.ok(/spotId: chosen\.id \};\s*addRecentSpotIds\(\[chosen\.id\]\);\s*saveLastCourse\(\);/.test(swap), 'swapStep이 saveLastCourse를 부르지 않는다');
console.log('ok 5');
