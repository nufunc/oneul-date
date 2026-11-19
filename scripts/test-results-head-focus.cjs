// 🚀 뒤 결과 머리 초점 회귀 테스트(P-491): node scripts/test-results-head-focus.cjs
// focusResultsHead를 src/main.ts에서 떼어 가짜 DOM으로 돌리고, 부르는 자리가 🚀로 결과까지 내려가는 경로 하나인지 원문에서 확인한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fn = (name) => {
  const m = src.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(m >= 0, `${name} 없음`);
  return src.slice(m, src.indexOf('\n}\n', m) + 3);
};
const code = ts.transpile(fn('focusResultsHead'), { target: 'es2022' });

const run = (classes) => {
  const els = classes.map((cls) => ({ cls, tabIndex: 0, focused: null, focus(opt) { this.focused = opt; } }));
  const document = {
    querySelector: (sel) => {
      const wanted = sel.split(',').map((s) => s.trim().replace('#results-area .', ''));
      return els.find((e) => wanted.includes(e.cls)) ?? null; // 문서 순서상 첫 일치
    },
  };
  new Function('document', `${code};focusResultsHead();`)(document);
  return els;
};

// 검색 대체 안내가 있어도 결과 제목이 받는다
let els = run(['search-miss', 'course-title']);
assert.deepStrictEqual(els[1].focused, { preventScroll: true }, '결과 제목에 초점, 스크롤 충돌 없음');
assert.strictEqual(els[1].tabIndex, -1, '머리는 Tab 순서에 들지 않는다');
assert.strictEqual(els[0].focused, null);
// 빈 코스면 빈 상태 문구
els = run(['results-empty']);
assert.deepStrictEqual(els[0].focused, { preventScroll: true }, '빈 상태에 초점');
// 결과가 없으면 아무것도 하지 않는다
assert.doesNotThrow(() => run([]));

// 부르는 자리: 🚀가 결과까지 스크롤한 경우, 초점이 🚀에 있을 때만. 검색창 Enter는 초점을 검색창에 두고(P-264) 마우스(Safari)는 초점이 없다
const calls = src.split('focusResultsHead();').length - 1;
assert.strictEqual(calls, 1, '부르는 자리는 한 곳');
const trig = fn('triggerCourseGeneration');
assert.ok(/scrollIntoView\(\{ behavior: scrollMotion\(\), block: 'start' \}\);\n\s+if \(document\.activeElement\?\.id === 'btn-generate'\) focusResultsHead\(\);/.test(trig), '스크롤 분기 안에서 🚀 초점일 때만');
// 받은 코스(#c=)와 오늘 추천 자동 표시는 triggerCourseGeneration을 거치지 않는다: 부르는 곳은 🚀 클릭, 검색 Enter, 데이터 대기 해소뿐
const callers = src.split('triggerCourseGeneration();').length - 1;
assert.strictEqual(callers, 3, `triggerCourseGeneration 호출 ${callers}곳`);

// 마우스 클릭 뒤 링: 전역 :focus-visible 규칙만 링을 그린다. 머리에 :focus 링 규칙을 따로 두지 않는다
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
assert.ok(!/\.course-title[^{]*:focus(?!-visible)/.test(css), ':focus 링 규칙 없음');

console.log('test-results-head-focus: ok');
