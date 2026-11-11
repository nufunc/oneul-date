// 받은 코스 제목에 지역과 장소 수를 쓰는지 시험(P-273): node scripts/test-receiver-title.cjs
// src/main.ts의 받은 화면 h2가 `<지역> 데이트 코스 <N>곳`이고 설명 줄이 장소 이름 경로이며, 문서 제목을 같은 말로 쓰고
// 홈 셸로 나가는 setSharedCourseView(false)에서 원래 문서 제목을 되돌리는지, 경로 줄이 두 줄에서 잘리는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

function fnBody(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `함수가 없다: ${name}`);
  const end = main.indexOf('\n}\n', start);
  return main.slice(start, end);
}

// 1. 받은 화면 h2와 문서 제목
const view = fnBody('renderReceiverView');
assert.match(view, /const heroTitle = `.*데이트 코스 \$\{steps\.length\}곳`;/, '받은 화면 제목이 `<지역> 데이트 코스 <N>곳`이 아니다');
assert.match(view, /<h2 class="receiver-hero-title">\$\{escapeHtml\(heroTitle\)\}<\/h2>/, '받은 화면 h2가 heroTitle을 쓰지 않는다');
assert.ok(!view.includes('친구가 보낸 특별한 데이트 코스예요'), '받은 화면 h2에 옛 문구가 남아 있다');
assert.match(view, /document\.title = `\$\{heroTitle\} \| 오늘 데이트`;/, '받은 화면에서 문서 제목을 제목과 같은 말로 쓰지 않는다');
// 매거진 글에서 연 코스는 제목을 그대로 둔다
assert.ok(view.includes('매거진 글에 나온 장소로 만든 코스예요'), '매거진 경로 제목이 바뀌었다');

// 2. 지역이 섞이면 첫 장소의 지역을 제목에 붙이지 않는다
assert.match(view, /const areaLabel = courseAreaLabel\(sharedSpots, sharedRegion && sharedSpots\.every\(/, '제목 지역이 courseAreaLabel로 정해지지 않거나 모든 장소가 든 지역인지 보지 않는다');

// 3. 설명 줄은 장소 이름 앞 셋의 경로이고 나머지는 `외 N곳`
assert.match(view, /\.slice\(0, 3\)\.join\(' → '\)/, '설명 줄이 장소 이름 앞 셋의 경로가 아니다');
assert.match(view, /` 외 \$\{routeNames\.length - 3\}곳`/, '설명 줄에 `외 N곳`이 없다');
assert.match(view, /<p class="receiver-hero-desc receiver-hero-route">\$\{escapeHtml\(heroRoute\)\}<\/p>/, '설명 줄이 경로 class와 escapeHtml을 쓰지 않는다');

// 4. 경로 줄은 두 줄에서 자른다
const route = css.match(/^\.receiver-hero-route \{([^}]*)\}/m);
assert.ok(route, '.receiver-hero-route 규칙이 없다');
assert.match(route[1], /-webkit-line-clamp: 2;/, '경로 줄이 두 줄에서 잘리지 않는다');
assert.match(route[1], /overflow: hidden;/, '경로 줄의 넘친 부분이 보인다');

// 5. 홈 셸로 나가면 원래 문서 제목을 되돌린다
assert.match(main, /const homeDocTitle = document\.title;/, '원래 문서 제목을 기억하지 않는다');
assert.match(fnBody('setSharedCourseView'), /if \(!shared\) document\.title = homeDocTitle;/, '받은 화면을 나갈 때 문서 제목을 되돌리지 않는다');
assert.match(fnBody('renderShell'), /setSharedCourseView\(false\);/, '홈 셸이 받은 화면 표시를 끄지 않는다');

console.log('test-receiver-title: 통과');
