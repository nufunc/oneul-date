// 맞춤 코스 후보 시험(P-469): node scripts/test-course-candidates.cjs
// 후보 다양화(buildCourseCandidates)와 전환(selectCandidate·replaceCourseKeepingCandidate·renderCandidateTabs)을
// src/main.ts에서 그대로 떼어 실행하고, 🚀 처리와 결과 화면이 후보를 쓰는지 소스로 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const start = src.indexOf('let courseCandidates: CourseStep[][] = [];');
const fnEnd = src.indexOf('function renderCandidateTabs');
assert.ok(start >= 0 && fnEnd > start, '후보 코드가 없다');
const end = src.indexOf('\n}\n', fnEnd) + 3;
const block = ts.transpile(src.slice(start, end), { target: 'es2022' });

function load(env) {
  return new Function(
    'env',
    `const { state, spotById, spots, escapeHtml, zoneRelaxedSlots, addRecentSpotIds, courseSpotIds, renderResults, document, announceCourse } = env;
     let prevCourse = env.prevCourse;
     ${block}
     return {
       buildCourseCandidates, selectCandidate, replaceCourseKeepingCandidate, renderCandidateTabs, inCandidateMode,
       set(list, i) { courseCandidates = list; candidateIndex = i; },
       get candidates() { return courseCandidates; },
       get prev() { return prevCourse; },
     };`,
  )(env);
}

const step = (slot, spotId) => ({ slot, spotId });

// 1. 다양화: 앞 후보 장소를 피할 목록에 넣고, 같은 구성은 버리고, 빈 후보는 버린다
{
  const m = load({});
  const calls = [];
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const make = (avoid) => {
    calls.push([...avoid].sort((a, b) => a - b));
    const left = pool.filter((id) => !avoid.has(id));
    const pick = left.length >= 3 ? left.slice(0, 3) : [1, 2, 3];
    return pick.map((id, i) => step(['day', 'evening', 'night'][i], id));
  };
  const out = m.buildCourseCandidates(make, new Set([100]));
  assert.strictEqual(out.length, 3, '후보가 3개가 아니다');
  assert.deepStrictEqual(calls[1], [1, 2, 3, 100], '두 번째 후보가 첫 후보 장소와 최근 이력을 피하지 않는다');
  const ids = out.flatMap((c) => c.map((s) => s.spotId));
  assert.strictEqual(new Set(ids).size, 9, '후보끼리 장소가 겹친다');

  // 장소가 모자라 같은 구성이 나오면 버린다
  const same = m.buildCourseCandidates(() => [step('day', 1), step('night', 2)], new Set());
  assert.strictEqual(same.length, 1, '같은 구성 후보를 버리지 않는다');
  // 일부만 겹치는 후보는 남긴다(겹침 허용)
  let n = 0;
  const partial = m.buildCourseCandidates(() => [step('day', 1), step('night', 10 + n++)], new Set());
  assert.strictEqual(partial.length, 3, '일부 겹치는 후보를 버렸다');
  // 첫 후보 뒤 빈 후보는 버린다
  let k = 0;
  const empty = m.buildCourseCandidates(() => (k++ === 0 ? [step('day', 1)] : [step('day', null)]), new Set());
  assert.strictEqual(empty.length, 1, '빈 후보를 버리지 않는다');
}

// 2. 전환: state.course가 고른 후보로 바뀌고, 단추 접근 이름에 첫 장소가 들고, 이전 보관분을 비운다
{
  const c1 = [step('day', 1), step('night', 2)];
  const c2 = [step('day', null), step('night', 3)];
  const c3 = [step('day', 4)];
  const state = { course: c1, courseConditions: { subZones: [] } };
  const focused = [];
  const announced = [];
  const recent = [];
  const env = {
    state,
    spots: [],
    prevCourse: { course: [] },
    spotById: new Map([[1, { name: '가<게' }], [3, { name: '다방' }], [4, { name: '라운지' }]]),
    escapeHtml: (s) => s.replace(/</g, '&lt;'),
    zoneRelaxedSlots: () => undefined,
    addRecentSpotIds: (ids) => recent.push(...ids),
    courseSpotIds: () => state.course.flatMap((s) => (s.spotId !== null ? [s.spotId] : [])),
    renderResults: () => {},
    document: { querySelector: (sel) => ({ focus: () => focused.push(sel) }) },
    announceCourse: (lead) => announced.push(lead),
  };
  const m = load(env);
  m.set([c1, c2, c3], 0);
  const html = m.renderCandidateTabs();
  assert.strictEqual((html.match(/data-candidate=/g) || []).length, 3, '후보 단추가 3개가 아니다');
  assert.match(html, /aria-pressed="true" aria-label="후보 1: 가&lt;게">후보 1</, '후보 1 단추 이름에 첫 장소가 없다');
  assert.match(html, /aria-label="후보 2: 다방">후보 2</, '첫 칸이 빈 후보의 이름이 첫 장소를 쓰지 않는다');

  m.selectCandidate(1);
  assert.strictEqual(state.course, c2, '전환 뒤 state.course가 고른 후보가 아니다');
  assert.strictEqual(m.prev, null, '전환 뒤 ↩ 이전 보관분이 남았다');
  assert.deepStrictEqual(focused, ['#results-area [data-candidate="1"]'], '초점이 누른 단추로 가지 않는다');
  assert.deepStrictEqual(announced, ['후보 2 코스를 골랐어요.'], '전환을 알리지 않는다');
  assert.deepStrictEqual(recent, [3], '고른 후보 장소를 최근 이력에 넣지 않는다');
  assert.match(m.renderCandidateTabs(), /data-candidate="1" aria-pressed="true"/, '고른 단추가 눌림이 아니다');

  // 다시 추천·최적 동선은 현재 후보 자리만 바꾸고 후보 단추를 유지한다
  const next = [step('day', 9)];
  m.replaceCourseKeepingCandidate(next);
  assert.strictEqual(m.candidates[1], next, '현재 후보 자리가 바뀌지 않았다');
  assert.strictEqual(m.candidates[0], c1, '다른 후보가 바뀌었다');
  assert.ok(m.inCandidateMode(), '바꾼 뒤 후보 단추가 숨었다');

  // 받은 코스·저장 코스처럼 후보 밖 코스로 바뀌면 단추를 숨기고 전환하지 않는다
  state.course = [step('day', 7)];
  assert.strictEqual(m.renderCandidateTabs(), '', '후보 밖 코스에 후보 단추가 보인다');
  m.selectCandidate(0);
  assert.deepStrictEqual(state.course, [step('day', 7)], '후보 밖 코스에서 전환됐다');

  // 후보가 하나뿐이면 단추를 숨긴다
  m.set([c1], 0);
  state.course = c1;
  assert.strictEqual(m.renderCandidateTabs(), '', '후보 하나에 전환 단추가 보인다');
}

// 3. 연결: 🚀가 후보를 짜고, 결과 화면이 단추를 그리고 묶고, 줄 CSS가 있다
assert.match(src, /courseCandidates = makeCandidates\(state\.searchQuery\);\s*candidateIndex = 0;\s*state\.course = courseCandidates\[0\];/, '🚀가 후보를 짜지 않는다');
assert.match(src, /\$\{renderCandidateTabs\(\)\}\s*<div class="course-head">/, '결과 머리 위에 후보 단추가 없다');
assert.match(src, /querySelectorAll<HTMLElement>\('\[data-candidate\]'\)[\s\S]{0,120}selectCandidate\(Number\(btn\.dataset\.candidate\)\)/, '후보 단추를 묶지 않는다');
assert.strictEqual((src.match(/makeCandidates\(/g) || []).length, 2, '후보 생성 자리가 🚀와 동네 재시도 두 곳이 아니다');
assert.match(css, /\.course-candidates \{[^}]*display: flex;/, '후보 줄 CSS가 없다');

console.log('test-course-candidates: 통과');
