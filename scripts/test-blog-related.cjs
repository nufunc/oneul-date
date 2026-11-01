// 매거진 글 관련 글 블록 빌드 결과 시험: npm run build 뒤 node scripts/test-blog-related.cjs
// dist/blog의 글마다 블록이 하나, 글 링크 3개(자기 제외, 중복 없음, 대상이 dist에 있음)와 목록 링크 1개가 있는지 본다
// 루트와 지역 랜딩에는 블록이 없어야 한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const blog = path.join(dist, 'blog');
const slugs = [...fs.readFileSync(path.join(blog, 'index.html'), 'utf8').matchAll(/<a href="([a-z0-9-]+)\/" class="post-card">/g)].map((m) => m[1]);
assert.ok(slugs.length > 3, '목록에서 글을 읽지 못했다');

for (const slug of slugs) {
  const html = fs.readFileSync(path.join(blog, slug, 'index.html'), 'utf8');
  assert.strictEqual(html.match(/class="od-related"/g)?.length, 1, `${slug}: 블록이 1개가 아니다`);
  const start = html.indexOf('class="od-related"');
  const nav = html.slice(start, html.indexOf('</nav>', start));
  assert.ok(html.indexOf('</nav>', start) < html.indexOf('</body>'), `${slug}: 블록이 </body> 앞에 없다`);
  const links = [...nav.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.strictEqual(links.length, 3, `${slug}: 글 링크가 3개가 아니다`);
  assert.strictEqual(new Set(links).size, 3, `${slug}: 글 링크가 중복된다`);
  assert.ok(!links.includes(slug), `${slug}: 자기 글 링크가 있다`);
  for (const target of links) {
    assert.ok(fs.existsSync(path.join(blog, target, 'index.html')), `${slug}: 링크 대상이 dist에 없다: ${target}`);
  }
  assert.strictEqual(nav.match(/href="\.\.\/"/g)?.length, 1, `${slug}: 매거진 목록 링크가 1개가 아니다`);
}

for (const page of [['index.html'], ['seoul', 'day', 'index.html'], ['blog', 'index.html']]) {
  assert.ok(!fs.readFileSync(path.join(dist, ...page), 'utf8').includes('od-related'), `${page.join('/')}에 블록이 있다`);
}
// P-232: 머리가 있는 쪽마다 머리 링크 44px 규칙이 1개, gunsan 태그 칩에 죽은 링크가 없다
const pages = [...fs.readdirSync(blog).map((d) => path.join(blog, d, 'index.html')), path.join(blog, 'index.html')].filter((f) => fs.existsSync(f));
let headed = 0;
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<header')) continue;
  headed++;
  assert.strictEqual(html.match(/header:not\(\.article-header\) a\{min-height:44px/g)?.length, 1, `${path.relative(dist, file)}: 머리 링크 44px 규칙이 1개가 아니다`);
}
assert.ok(headed > 3, '머리가 있는 쪽을 읽지 못했다');
assert.ok(!fs.readFileSync(path.join(blog, 'gunsan', 'index.html'), 'utf8').includes('href="#"'), 'gunsan에 href="#"이 있다');
console.log(`ok blog-related (${slugs.length}편, 머리 ${headed}쪽)`);
