// 매거진 글 발행일 시간대 시험(P-499): node scripts/test-blog-date-timezone.cjs
// public/blog/<slug>/index.html마다 BlogPosting JSON-LD datePublished가 시간대(Z 또는 ±hh:mm)를 가진 ISO 8601 DateTime인지 본다
// 일자만 있으면 Googlebot 시간대로 해석되므로(Google Article 문서) 시각과 시간대를 모두 요구한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const files = fs.readdirSync(blogDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(blogDir, d.name, 'index.html'))
  .filter((f) => fs.existsSync(f));
assert.ok(files.length > 0, '매거진 글이 없다');

const errors = [];
for (const file of files) {
  const slug = path.basename(path.dirname(file));
  const html = fs.readFileSync(file, 'utf-8');
  let posts = 0;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    for (const ld of [JSON.parse(m[1])].flat()) {
      if (ld['@type'] !== 'BlogPosting') continue;
      posts++;
      const v = ld.datePublished;
      if (typeof v !== 'string' || !DATE_TIME.test(v) || Number.isNaN(Date.parse(v))) errors.push(`${slug}: datePublished「${v}」에 시간대가 없다`);
    }
  }
  if (posts !== 1) errors.push(`${slug}: BlogPosting이 ${posts}개다`);
}
assert.deepStrictEqual(errors, [], `datePublished 시간대 누락 ${errors.length}건\n${errors.join('\n')}`);
console.log(`test-blog-date-timezone: ${files.length}편 모두 시간대 있는 DateTime`);
