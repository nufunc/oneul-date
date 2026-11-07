// 코스 변경 스크린리더 알림 회귀 테스트: node scripts/test-course-announce.cjs
// announce·announceCourse를 src/main.ts에서 떼어 실행해 알림 영역 동작을 보고, 세 동작과 복원 경로의 호출 자리를 원문에서 확인한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('let announceTimer');
const end = src.indexOf('// ----', start);
assert.ok(start >= 0 && end > start, 'announce 없음');
const code = ts.transpile(src.slice(start, end), { target: 'es2022' });

const fn = (name) => {
  const m = src.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(m >= 0, `${name} 없음`);
  return src.slice(m, src.indexOf('\n}\n', m) + 3);
};

// 가짜 DOM과 타이머
const make = (course, spotsById) => {
  const body = { children: [], appendChild(e) { this.children.push(e); } };
  const document = {
    body,
    getElementById: (id) => body.children.find((e) => e.id === id) ?? null,
    createElement: () => ({ attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } }),
  };
  const timers = [];
  const window = { setTimeout: (f) => timers.push(f) - 1, clearTimeout: (i) => { timers[i] = null; } };
  const log = [];
  const state = { course };
  const spotById = new Map(spotsById);
  const api = new Function('document', 'window', 'state', 'spotById', `${code};return { announce, announceCourse };`)(document, window, state, spotById);
  const el = () => document.getElementById('sr-announce');
  // 기록: textContent 변화
  const flush = () => { timers.splice(0).forEach((f) => f && f()); };
  return { ...api, body, el, flush, log };
};

const spots = [[1, { name: '백양산' }], [2, { name: '유진옥' }], [3, { name: '<b>브루잉</b>' }]];
const course = [{ slot: 'a', spotId: 1 }, { slot: 'b', spotId: 2 }, { slot: 'c', spotId: 3 }];

// 첫 로드에는 알림 영역도 글도 없다
let t = make(course, spots);
assert.strictEqual(t.el(), null, '첫 로드: 알림 영역 없음');

// 알림: 영역은 body 직속 하나, role=status, 비웠다가 채운다
t.announceCourse('코스를 만들었어요.');
assert.strictEqual(t.body.children.length, 1);
assert.strictEqual(t.el().attrs.role, 'status');
assert.strictEqual(t.el().attrs['aria-live'], 'polite');
assert.strictEqual(t.el().className, 'sr-only');
assert.strictEqual(t.el().textContent, '', '채우기 전에 비어 있다');
t.flush();
assert.strictEqual(t.el().textContent, '코스를 만들었어요. 장소 3곳: 백양산, 유진옥, <b>브루잉</b>', '이름은 글자 그대로');
// 같은 문구를 다시: 비었다가 다시 채워진다
t.announceCourse('코스를 만들었어요.');
assert.strictEqual(t.el().textContent, '', '같은 문구도 먼저 비운다');
t.flush();
assert.ok(t.el().textContent.includes('백양산'));
assert.strictEqual(t.body.children.length, 1, '영역은 하나만 쓴다');
// 연달아 부르면 마지막 문구만 남는다
t.announce('가'); t.announce('나'); t.flush();
assert.strictEqual(t.el().textContent, '나');

// 이름을 찾을 장소가 없으면 알리지 않는다
t = make([{ slot: 'a', spotId: null }, { slot: 'b', spotId: 99 }], spots);
t.announceCourse('코스를 만들었어요.'); t.flush();
assert.strictEqual(t.el(), null, '장소가 없으면 거짓 알림을 내지 않는다');
t = make(null, spots);
t.announceCourse('코스를 만들었어요.'); t.flush();
assert.strictEqual(t.el(), null, '코스가 없으면 알리지 않는다');

// 호출 자리: 🚀(place 분기와 끝), 🔄(후보 확정 뒤), 다시 추천(앵커 분기와 끝)
const gen = fn('triggerCourseGeneration');
assert.strictEqual(gen.split("announceCourse('코스를 만들었어요.')").length - 1, 2, '🚀: place 분기와 끝 두 곳');
assert.ok(/announceCourse\('코스를 만들었어요\.'\);\s*showToast\(`'\$\{place\}'/.test(gen), '🚀 place 분기: 토스트 앞');
assert.ok(/announceCourse\('코스를 만들었어요\.'\);\s*\}\s*$/.test(gen), '🚀 끝');
const swap = fn('swapStep');
const iChosen = swap.indexOf('if (!chosen)');
const iAnn = swap.indexOf('announce(');
assert.ok(iChosen >= 0 && iAnn > swap.indexOf('return;', iChosen), '🔄: 후보 없음 반환 뒤에만 알린다');
assert.ok(/saveLastCourse\(\);\s*(\/\/[^\n]*\n\s*)?announce\(/.test(swap), '🔄: 교체 확정 직후');
const regen = fn('regenerateCourse');
assert.strictEqual(regen.split("announceCourse('코스를 다시 추천했어요.')").length - 1, 2, '다시 추천: 앵커 분기와 끝');
assert.ok(regen.indexOf('if (!state.course') < regen.indexOf('announceCourse'), '다시 추천: 코스 없음 반환 뒤');
// 복원·첫 로드·받은 코스 경로는 알리지 않는다
for (const name of ['applyDailyCourseIfEmpty', 'renderResults', 'renderResultsContent']) {
  assert.ok(!/announce\w*\(/.test(fn(name)), `${name}은 알리지 않는다`);
}
console.log('ok');
