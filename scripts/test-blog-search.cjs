// 매거진 목록 글 찾기 빌드 결과 시험(P-246): npm run build 뒤 node scripts/test-blog-search.cjs
// dist/blog/index.html에 입력 #od-q, 결과 수 #od-count, 빈 상태 #od-empty가 하나씩 있고
// 생성기가 바꾸는 .posts-grid 밖(칩 줄 위와 목록 앞)에 있는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'blog', 'index.html'), 'utf8');
const gridStart = html.indexOf('<div class="posts-grid">');
const gridEnd = html.indexOf('</section>', gridStart);
assert.ok(gridStart > 0 && gridEnd > gridStart, '.posts-grid를 찾지 못했다');

for (const id of ['od-q', 'od-count', 'od-empty']) {
  const hits = html.split(`id="${id}"`).length - 1;
  assert.strictEqual(hits, 1, `#${id}가 1개가 아니다: ${hits}`);
  const at = html.indexOf(`id="${id}"`);
  assert.ok(at < gridStart || at > gridEnd, `#${id}가 .posts-grid 안에 있다`);
}

const chips = html.indexOf('class="region-filter-wrap"');
assert.ok(html.indexOf('id="od-q"') < chips, '#od-q가 지역 칩 줄 위에 없다');
assert.ok(chips < html.indexOf('id="od-count"') && html.indexOf('id="od-empty"') < gridStart, '결과 수 줄과 빈 상태가 칩 줄과 목록 사이에 없다');
assert.ok(/<input id="od-q" type="search"/.test(html), '#od-q가 type=search가 아니다');
assert.ok(/id="od-count" aria-live="polite"/.test(html), '#od-count에 aria-live가 없다');

console.log('blog search OK');
