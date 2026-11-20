// 정책 링크 빌드 시험: node scripts/test-policy-links.cjs
// 임시 폴더의 dist에 앱, 매거진 글, data 아래 HTML을 두고 build_policy_links.mjs와 rebase_dist.mjs를 돌려
// </body> 앞에 소개·개인정보처리방침·문의 링크가 한 번 들어가는지, 다시 돌려도 바뀌지 않는지, data는 건드리지 않는지 본다(P-536).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = 'https://nufunc.github.io/oneul-date/';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-links-'));
const files = {
  app: path.join(tmp, 'dist', 'index.html'),
  post: path.join(tmp, 'dist', 'blog', 'test-post', 'index.html'),
  data: path.join(tmp, 'dist', 'data', 'x.html'),
  bar: path.join(tmp, 'dist', 'blog', 'bar-post', 'index.html'),
};
const page = '<html><body><div id="app"></div>\n</body></html>';
for (const f of Object.values(files)) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, page);
}
// 코스 막대가 붙은 매거진 글: 여백 div 뒤에 막대가 온다(build_blog_related.mjs)
const SPACER = '<div class="od-course-spacer" aria-hidden="true"></div>';
fs.writeFileSync(files.bar, `<html><body><p>글</p>${SPACER}<a class="od-course-bar" href="../../#c=x">코스</a>\n</body></html>`);
const run = () => execFileSync('node', [path.join(__dirname, 'build_policy_links.mjs')], { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });

try {
  run();
  for (const f of [files.app, files.post]) {
    const html = fs.readFileSync(f, 'utf8');
    assert.strictEqual(html.split('class="site-policy-links"').length, 2, `${f}: 링크 줄이 한 번이 아니다`);
    assert.ok(html.indexOf('site-policy-links') < html.indexOf('</body>'), `${f}: 링크 줄이 </body> 앞이 아니다`);
    for (const href of [`${SITE}about`, `${SITE}privacy`, 'https://github.com/nufunc/oneul-date/issues']) {
      assert.ok(html.includes(`href="${href}"`), `${f}: ${href} 링크가 없다`);
    }
  }
  // P-544: 정책 링크 줄은 막대 여백보다 앞이라 최하단에서 막대에 가리지 않는다. 링크 터치 높이는 44px 이상이다
  const bar = fs.readFileSync(files.bar, 'utf8');
  assert.strictEqual(bar.split('class="site-policy-links"').length, 2, '막대 글: 링크 줄이 한 번이 아니다');
  assert.ok(bar.indexOf('site-policy-links') < bar.indexOf(SPACER), '막대 글: 링크 줄이 막대 여백 뒤에 있다');
  const anchors = fs.readFileSync(files.app, 'utf8').match(/<a [^>]*>/g).filter((a) => !a.includes('od-course'));
  assert.strictEqual(anchors.length, 3, '정책 링크가 셋이 아니다');
  for (const a of anchors) assert.ok(/min-height:44px/.test(a) && /display:inline-flex/.test(a), `링크 터치 높이가 44px 미만: ${a}`);
  assert.strictEqual(fs.readFileSync(files.data, 'utf8'), page, 'dist/data 아래를 바꿨다');
  const once = fs.readFileSync(files.post, 'utf8');
  run();
  assert.strictEqual(fs.readFileSync(files.post, 'utf8'), once, '다시 돌렸더니 바뀌었다');
  // 새 도메인으로 옮겨도 저장소 이슈 주소는 그대로여야 한다
  execFileSync('node', [path.join(__dirname, 'rebase_dist.mjs')], {
    cwd: tmp, stdio: 'pipe', env: { ...process.env, SITE_ORIGIN: 'https://oneul.date', BASE_PATH: '/' },
  });
  const moved = fs.readFileSync(files.post, 'utf8');
  assert.ok(moved.includes('href="https://oneul.date/about"'), '소개 주소가 새 도메인으로 바뀌지 않았다');
  assert.ok(moved.includes('href="https://github.com/nufunc/oneul-date/issues"'), '저장소 이슈 주소가 바뀌었다');
  console.log('test-policy-links: 통과');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
