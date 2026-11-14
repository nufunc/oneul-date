// 홈 검색 제출 뒤 초점 놓기와 대체 코스 안내 줄 시험(P-264): node scripts/test-search-submit-fallback.cjs
// src/main.ts의 Enter 처리가 터치 기기에서만 입력칸 초점을 놓는지, 검색어가 안 맞아 대체한 코스에만
// courseConditions.searchFallback을 담는지, 결과 머리 안내 줄이 검색어를 escapeHtml로 넣고 role=status가 없는지,
// src/style.css의 '검색어 바꾸기' 버튼이 44px 이상인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function fnBody(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `함수가 없다: ${name}`);
  const next = main.indexOf('\nfunction ', start + 1);
  return main.slice(start, next < 0 ? undefined : next);
}

// 1. Enter 처리: 생성 뒤 (pointer: coarse)일 때만 blur
const bind = fnBody('bindConditionEvents');
const enter = bind.slice(bind.indexOf("if (e.key === 'Enter')"), bind.indexOf("if (e.key === 'Enter')") + 500);
const gen = enter.indexOf('triggerCourseGeneration()');
const blur = enter.search(/if \(matchMedia\('\(pointer: coarse\)'\)\.matches\)[^\n]*\.blur\(\)/);
assert.ok(gen >= 0, 'Enter 처리에서 triggerCourseGeneration을 부르지 않는다');
assert.ok(blur > gen, 'Enter 처리가 코스 생성 뒤 터치 기기에서만 입력칸 초점을 놓지 않는다');

// 2. 대체 여부: 검색어가 있고 맞은 스팟이 없을 때만, 동네만 남긴 코스에서는 지운다
const trig = fnBody('triggerCourseGeneration');
assert.match(trig, /searchFallback: state\.searchQuery && !hasMatchedSpot \? \{ query: state\.searchQuery, byFilter \} : undefined/,
  '검색어가 맞지 않은 코스에만 searchFallback을 담지 않는다');
assert.match(trig, /searchQuery: place,\s*searchFallback: undefined/, '동네만 남긴 코스에 대체 안내가 남는다');
assert.match(trig, /\} else if \(byFilter\) \{/, '토스트와 안내 줄의 필터 판정이 갈라졌다');

// 3. 안내 줄: 결과 머리 위, 검색어 escapeHtml, 일반 문단(role=status 없음)
const render = fnBody('renderResultsContent');
const miss = render.indexOf('class="search-miss"');
assert.ok(miss >= 0 && miss < render.indexOf('class="course-head"'), '안내 줄이 결과 머리 위에 없다');
const missHtml = render.slice(miss, render.indexOf('class="course-head"'));
assert.match(missHtml, /\$\{escapeHtml\(fallback\.query\)\}/, '안내 줄이 검색어를 escapeHtml로 넣지 않는다');
assert.doesNotMatch(missHtml, /role=|aria-live/, '안내 줄이 토스트와 겹쳐 알린다(role=status 금지)');
assert.match(missHtml, /<button type="button" class="search-miss-btn" id="btn-search-edit">검색어 바꾸기<\/button>/, '검색어 바꾸기 버튼이 없다');
assert.match(render, /\$\{fallback \? `/, '대체가 아닐 때도 안내 줄을 그린다');

// 4. 버튼 동작: 검색칸으로 스크롤하고 초점과 선택
const results = fnBody('bindResultEvents');
const edit = results.slice(results.indexOf("'#btn-search-edit'"), results.indexOf("'#btn-search-edit'") + 400);
assert.match(edit, /scrollIntoView\(\{ block: 'center' \}\)/, '검색어 바꾸기가 검색칸으로 스크롤하지 않는다');
assert.match(edit, /\.focus\(/, '검색어 바꾸기가 검색칸에 초점을 두지 않는다');

// 5. 버튼 눌리는 높이 44px 이상, 색은 테마 토큰
const btn = css.match(/^\.search-miss-btn \{([^}]*)\}/m);
assert.ok(btn, '.search-miss-btn 규칙이 없다');
const minH = btn[1].match(/min-height:\s*(\d+)px;/);
assert.ok(minH && Number(minH[1]) >= 44, '검색어 바꾸기 버튼 높이가 44px 미만이다');
const box = css.match(/^\.search-miss \{([^}]*)\}/m);
assert.ok(box, '.search-miss 규칙이 없다');
for (const body of [box[1], btn[1]]) {
  assert.doesNotMatch(body, /(?:background|color):\s*#/, '안내 줄 색이 테마 토큰이 아니다(어두운 테마에서 대비가 깨진다)');
}

console.log('test-search-submit-fallback: 통과');
