// 코스 추천 캐릭터 시험(P-529): node scripts/test-course-buddy.cjs
// 캐릭터를 누르면 테마 칩을 켠 뒤 🚀 단추와 같은 코스 만들기 경로를 부르고, 그 세션 동안 다시 그리지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
const body = (sig) => {
  const start = src.indexOf(sig);
  assert.ok(start >= 0, `${sig}가 없다`);
  return src.slice(start, src.indexOf('\n}\n', start));
};

// 누르면: 세션 숨김 기록 → 뿅 → 테마 칩 → 조건 다시 그리기 → 🚀와 같은 경로
const bind = body('function bindConditionEvents(');
const click = bind.slice(bind.indexOf("'#course-buddy'"), bind.indexOf('\n  });', bind.indexOf("'#course-buddy'")));
const order = ['sessionStorage.setItem(COURSE_BUDDY_HIDDEN_KEY', 'popCourseBuddy(btn)', 'state.courseCategory = btn.dataset.buddyCat', 'renderConditions()', 'triggerCourseGeneration()'];
let at = -1;
for (const step of order) {
  const i = click.indexOf(step);
  assert.ok(i > at, `캐릭터 클릭에서 ${step}가 없거나 순서가 다르다`);
  at = i;
}
assert.ok(/try \{\s*sessionStorage\.setItem\(COURSE_BUDDY_HIDDEN_KEY, '1'\);\s*\} catch \{\}/.test(click), '세션 숨김 기록이 try/catch 밖이다');

// 숨김 판정: 받은 코스 링크, 지역 랜딩, 이번 세션에 누른 적 있음
const hidden = body('function courseBuddyHidden(');
assert.ok(hidden.includes("location.hash.startsWith('#c=')"), '받은 코스 링크에서 숨기지 않는다');
assert.ok(hidden.includes("document.getElementById('seo-landing')"), '지역 랜딩에서 숨기지 않는다');
assert.ok(/try \{\s*return sessionStorage\.getItem\(COURSE_BUDDY_HIDDEN_KEY\) === '1';\s*\} catch/.test(hidden), '세션 숨김을 읽지 않는다');
const cond = body('function renderConditions(');
assert.ok(cond.includes('courseBuddyHidden() ? null : pickCourseBuddyTheme(themeChips)'), '조건 영역이 숨김 판정 없이 캐릭터를 그린다');

// 추천은 지금 보이는 테마 칩에서만 고른다(전체 제외)
const pick = body('function pickCourseBuddyTheme(');
assert.ok(pick.includes("c.key !== 'ALL'"), '전체 칩을 추천할 수 있다');

// 낭독기 이름에 추천 문구, 움직임 최소화에서 둥실·깜박임 끔
assert.ok(/<button type="button" class="course-buddy" id="course-buddy"[^>]*aria-label="\$\{escapeHtml\(line\)\}/.test(src), '캐릭터 단추 aria-label에 추천 문구가 없다');
const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
assert.ok(/\.buddy-figure,\s*\.buddy-eyes \{\s*animation: none !important;/.test(reduced), '움직임 최소화에서 둥실거림이 남는다');
assert.ok(/\.buddy-poof \.buddy-svg \{\s*animation: buddy-fade/.test(reduced), '움직임 최소화의 뿅이 페이드가 아니다');

console.log('test-course-buddy: 통과');
