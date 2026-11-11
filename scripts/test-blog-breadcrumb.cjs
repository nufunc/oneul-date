// 매거진 글 BreadcrumbList와 mainEntityOfPage 빌드 시험: node scripts/test-blog-breadcrumb.cjs
// 임시 폴더의 dist/blog/<slug>/index.html 한 편에 build_blog_breadcrumb.mjs를 돌려, JSON-LD가 모두 파싱되고
// BlogPosting.mainEntityOfPage가 canonical을 가리키며 BreadcrumbList가 홈 > 매거진 > 글 3단인지, 다시 돌려도 바뀌지 않는지 본다.
// 목록 dist/blog/index.html은 건드리지 않는지도 본다.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = 'https://nufunc.github.io/oneul-date/';
const URL = `${SITE}blog/test-post/`;
const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const post = `<head>
  <link rel="canonical" href="${URL}">
  <script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "[시험] 글 제목",
  "url": "${URL}",
  "datePublished": "2026-10-11"
}
  </script>
</head>`;
const list = '<head><script type="application/ld+json">{"@type":"Blog"}</script></head>';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-breadcrumb-'));
const file = path.join(tmp, 'dist', 'blog', 'test-post', 'index.html');
const listFile = path.join(tmp, 'dist', 'blog', 'index.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, post);
fs.writeFileSync(listFile, list);
const run = () => execFileSync('node', [path.join(__dirname, 'build_blog_breadcrumb.mjs')], { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });

try {
  run();
  const html = fs.readFileSync(file, 'utf8');
  const lds = [...html.matchAll(LD_RE)].map(([, body]) => JSON.parse(body));
  assert.strictEqual(lds.length, 2, 'JSON-LD가 BlogPosting과 BreadcrumbList 두 개가 아니다');
  const blog = lds.find((ld) => ld['@type'] === 'BlogPosting');
  assert.deepStrictEqual(blog.mainEntityOfPage, { '@type': 'WebPage', '@id': URL });
  assert.strictEqual(blog.headline, '[시험] 글 제목', '기존 BlogPosting 값이 바뀌었다');
  const crumb = lds.find((ld) => ld['@type'] === 'BreadcrumbList');
  assert.ok(crumb, 'BreadcrumbList가 없다');
  assert.strictEqual(crumb['@context'], 'https://schema.org');
  assert.deepStrictEqual(
    crumb.itemListElement.map((i) => [i['@type'], i.position, i.name, i.item]),
    [
      ['ListItem', 1, '홈', SITE],
      ['ListItem', 2, '매거진', `${SITE}blog/`],
      ['ListItem', 3, '[시험] 글 제목', URL],
    ],
  );
  run();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), html, '두 번 돌리면 결과가 바뀐다');
  assert.strictEqual(fs.readFileSync(listFile, 'utf8'), list, '목록 쪽을 고쳤다');
  console.log('test-blog-breadcrumb: 통과');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
