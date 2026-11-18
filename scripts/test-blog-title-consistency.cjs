// 매거진 글 제목 일치 시험(P-498): node scripts/test-blog-title-consistency.cjs
// public/blog/<slug>/index.html마다 og:title, twitter:title, BlogPosting headline이 <title>과 같은지 본다
// BreadcrumbList 마지막 이름은 빌드 때 build_blog_breadcrumb.mjs가 headline으로 넣으므로, 원본에 있으면 그것도 <title>과 같아야 한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const files = fs.readdirSync(blogDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(blogDir, d.name, 'index.html'))
  .filter((f) => fs.existsSync(f));
assert.ok(files.length > 0, '매거진 글이 없다');

const errors = [];
for (const file of files) {
  const slug = path.basename(path.dirname(file));
  const html = fs.readFileSync(file, 'utf-8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (!title) { errors.push(`${slug}: <title>이 없다`); continue; }
  const want = unescape(title.trim());
  const values = [];
  for (const m of html.matchAll(/<meta (?:property="og:title"|name="twitter:title") content="([^"]*)"/g)) values.push(['og/twitter:title', unescape(m[1])]);
  let headlines = 0;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    for (const ld of [JSON.parse(m[1])].flat()) {
      if (ld['@type'] === 'BlogPosting') { headlines++; values.push(['headline', ld.headline]); }
      if (ld['@type'] === 'BreadcrumbList') values.push(['breadcrumb', ld.itemListElement.at(-1).name]);
    }
  }
  if (!html.includes('property="og:title"')) errors.push(`${slug}: og:title이 없다`);
  if (headlines !== 1) errors.push(`${slug}: BlogPosting이 ${headlines}개다`);
  for (const [key, v] of values) if (v !== want) errors.push(`${slug}: ${key}「${v}」≠ title「${want}」`);
}
assert.deepStrictEqual(errors, [], `제목 불일치 ${errors.length}건\n${errors.join('\n')}`);
console.log(`test-blog-title-consistency: ${files.length}편 일치`);
