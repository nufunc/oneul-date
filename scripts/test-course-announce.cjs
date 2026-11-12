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
  const body = { children: [{ id: 'sr-announce', textContent: '' }] };
  const document = {
    body,
    getElementById: (id) => body.children.find((e) => e.id === id) ?? null,
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

// 영역은 첫 알림 전부터 index.html에 있어야 낭독되고, 결과 렌더가 지우지 못하게 #app 밖에 둔다
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/<div id="app"><\/div>\s*<p id="sr-announce" class="sr-only" role="status" aria-live="polite" aria-atomic="true"><\/p>/.test(html), '정적 알림 영역');

// 첫 로드에는 글이 없다
let t = make(course, spots);
assert.strictEqual(t.el().textContent, '', '첫 로드: 알림 글 없음');

// 알림: 비웠다가 채운다
t.announceCourse('코스를 만들었어요.');
assert.strictEqual(t.el().textContent, '', '채우기 전에 비어 있다');
t.flush();
assert.strictEqual(t.el().textContent, '코스를 만들었어요. 장소 3곳: 백양산, 유진옥, <b>브루잉</b>', '이름은 글자 그대로');
// 같은 문구를 다시: 비었다가 다시 채워진다
t.announceCourse('코스를 만들었어요.');
assert.strictEqual(t.el().textContent, '', '같은 문구도 먼저 비운다');
t.flush();
assert.ok(t.el().textContent.includes('백양산'));
// 한 동작에서 연달아 부르면 앞 문구를 지우지 않고 이어 읽는다(코스 장소와 토스트, ux-reviewer-287)
t.announce('가'); t.announce('나'); t.flush();
assert.strictEqual(t.el().textContent, '가 나');
// 읽은 뒤 다음 알림은 새로 시작한다
t.announce('다'); t.flush();
assert.strictEqual(t.el().textContent, '다');

// 이름을 찾을 장소가 없으면 알리지 않는다
t = make([{ slot: 'a', spotId: null }, { slot: 'b', spotId: 99 }], spots);
t.announceCourse('코스를 만들었어요.'); t.flush();
assert.strictEqual(t.el().textContent, '', '장소가 없으면 거짓 알림을 내지 않는다');
t = make(null, spots);
t.announceCourse('코스를 만들었어요.'); t.flush();
assert.strictEqual(t.el().textContent, '', '코스가 없으면 알리지 않는다');

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
// 동네 재시도가 실패하면 그리지 않은 코스를 버리고 화면의 코스로 돌아간다
assert.ok(/const shownCourse = state\.course;[\s\S]*if \(matchesIn\(place\)\)[\s\S]*return;\s*\}\s*(\/\/[^\n]*\n\s*)?state\.course = shownCourse;/.test(gen), '동네 재시도 실패 복원');
// 복원·첫 로드·받은 코스 경로는 알리지 않는다
for (const name of ['applyDailyCourseIfEmpty', 'renderResults', 'renderResultsContent']) {
  assert.ok(!/announce\w*\(/.test(fn(name)), `${name}은 알리지 않는다`);
}
// 조건 칩은 선택 상태를 접근성 트리에 알린다(화면은 is-active 클래스뿐이었다)
assert.strictEqual((src.match(/class="(quick-region-chip|spot-category-chip)[^\n]*aria-pressed="/g) ?? []).length, 9, '조건 칩 aria-pressed');
// 지역 시트의 지역 줄은 tab 역할 자식이 없으므로 tablist가 아니다(axe aria-required-children)
assert.ok(!src.includes('class="location-regions" role="tablist"') && /region-tab-item[^\n]*aria-pressed=/.test(src), '지역 줄 역할');
// 토스트는 화면에만 두고 낭독은 처음부터 있는 #sr-announce가 맡는다(첫 토스트가 글자와 함께 생겨 읽히지 않았다)
const toastFn = fn('showToast');
assert.match(toastFn, /announce\(msg\);/, 'showToast가 #sr-announce로 알리지 않는다');
assert.ok(!/aria-live|role', 'status/.test(toastFn), '토스트에 라이브 영역 속성이 남아 두 번 읽힌다');

console.log('ok');
