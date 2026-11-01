// 매거진 글 수정일 빌드 결과 시험(P-245): npm run build 뒤 node scripts/test-blog-dates.cjs
// dist/blog의 모든 글 BlogPosting JSON-LD에 ISO 8601(시간대 포함) dateModified가 있고 datePublished 이상인지, JSON-LD 파싱 오류가 0인지,
// 사이트맵 /blog/ 항목마다 lastmod가 있고 글의 dateModified와 같은지, /blog/ 밖 항목에는 lastmod가 없는지 본다.
// 임시 git 저장소에서 빌드 스크립트를 돌려 날짜를 넣는 경로, 기존 dateModified를 덮지 않는 경로, datePublished보다 앞선 날짜를 거르는 경로,
// 얕은 복제에서 아무것도 넣지 않고 종료 코드 0인 경로를 본다
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const notBefore = (m, p) => (p.length > 10 ? Date.parse(m) >= Date.parse(p) : m.slice(0, p.length) >= p);

const dist = path.join(__dirname, '..', 'dist');
const blog = path.join(dist, 'blog');
const slugs = fs.readdirSync(blog).filter((d) => fs.existsSync(path.join(blog, d, 'index.html')));
assert.ok(slugs.length > 3, 'dist/blog의 글을 읽지 못했다');

const modified = {};
for (const slug of slugs) {
  const html = fs.readFileSync(path.join(blog, slug, 'index.html'), 'utf8');
  const lds = [...html.matchAll(LD_RE)].map(([, body]) => {
    try { return JSON.parse(body); } catch (e) { assert.fail(`${slug}: JSON-LD 파싱 오류: ${e.message}`); }
  });
  const post = lds.find((ld) => ld['@type'] === 'BlogPosting');
  if (!post) continue;
  assert.ok(ISO.test(post.dateModified), `${slug}: dateModified가 시간대를 포함한 ISO 8601이 아니다: ${post.dateModified}`);
  assert.ok(notBefore(post.dateModified, post.datePublished), `${slug}: dateModified ${post.dateModified}가 datePublished ${post.datePublished}보다 앞선다`);
  modified[slug] = post.dateModified;
}
const posts = Object.keys(modified).length;
assert.strictEqual(posts, slugs.length, 'BlogPosting이 없는 글 폴더가 있다');

const urls = [...fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, u]) => ({
  loc: u.match(/<loc>([^<]*)<\/loc>/)[1],
  lastmod: u.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1],
}));
const blogUrls = urls.filter((u) => /\/blog\/([^/]+\/)?$/.test(u.loc));
assert.strictEqual(blogUrls.length, posts + 1, `사이트맵 /blog/ 항목 수가 글 ${posts}편 + 목록 1과 다르다: ${blogUrls.length}`);
for (const { loc, lastmod } of blogUrls) {
  assert.ok(ISO.test(lastmod ?? ''), `${loc}: lastmod가 없거나 형식이 다르다: ${lastmod}`);
  const slug = loc.match(/\/blog\/([^/]+)\/$/)?.[1];
  if (slug) assert.strictEqual(lastmod, modified[slug], `${loc}: lastmod가 dateModified와 다르다`);
}
const stray = urls.filter((u) => u.lastmod && !blogUrls.includes(u));
assert.strictEqual(stray.length, 0, `/blog/ 밖 항목에 lastmod가 있다: ${stray.map((u) => u.loc).join(', ')}`);

// 임시 git 저장소에서 빌드 스크립트를 돈다
const script = path.join(__dirname, 'build_blog_dates.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-dates-'));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CEILING_DIRECTORIES: os.tmpdir() };
const run = (cwd, cmd, args, extra = {}) => execFileSync(cmd, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', stdio: 'pipe' });
const ld = (pub, mod) => `<script type="application/ld+json">\n{\n  "@type": "BlogPosting",\n  "datePublished": "${pub}"${mod ? `,\n  "dateModified": "${mod}"` : ''},\n  "url": "u"\n}\n  </script>`;
const pages = { a: ld('2026-10'), b: ld('2026-10-01', '2026-10-05'), c: ld('2026-12-01') };
const SITE = 'https://x.test/oneul-date';
const sitemap = `<urlset>\n  <url><loc>${SITE}/</loc></url>\n  <url><loc>${SITE}/seoul/day/</loc></url>\n  <url><loc>${SITE}/blog/</loc></url>\n${Object.keys(pages).map((s) => `  <url><loc>${SITE}/blog/${s}/</loc></url>`).join('\n')}\n</urlset>\n`;

const repo = path.join(tmp, 'repo');
for (const s of ['', ...Object.keys(pages)]) {
  fs.mkdirSync(path.join(repo, 'public', 'blog', s), { recursive: true });
  fs.writeFileSync(path.join(repo, 'public', 'blog', s, 'index.html'), s ? pages[s] : 'list');
}
run(repo, 'git', ['init', '-q']);
run(repo, 'git', ['add', '.']);
run(repo, 'git', ['commit', '-qm', '1'], { GIT_COMMITTER_DATE: '2026-10-20T10:00:00+09:00' });
fs.appendFileSync(path.join(repo, 'public', 'blog', 'a', 'index.html'), '\n');
run(repo, 'git', ['commit', '-qam', '2'], { GIT_COMMITTER_DATE: '2026-10-25T11:00:00+09:00' });

const writeDist = (root) => {
  for (const s of Object.keys(pages)) {
    fs.mkdirSync(path.join(root, 'dist', 'blog', s), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'blog', s, 'index.html'), pages[s]);
  }
  fs.writeFileSync(path.join(root, 'dist', 'sitemap.xml'), sitemap);
};
const readDist = (root, s) => fs.readFileSync(path.join(root, 'dist', s === 'sitemap' ? 'sitemap.xml' : `blog/${s}/index.html`), 'utf8');

writeDist(repo);
run(repo, process.execPath, [script]);
assert.strictEqual(readDist(repo, 'a'), pages.a.replace('"2026-10"', '"2026-10",\n  "dateModified": "2026-10-25T11:00:00+09:00"'), '날짜를 넣은 결과가 기대와 다르다');
assert.strictEqual(readDist(repo, 'b'), pages.b, '기존 dateModified를 덮었다');
assert.strictEqual(readDist(repo, 'c'), pages.c, 'datePublished보다 앞선 날짜를 넣었다');
assert.strictEqual(readDist(repo, 'sitemap'), sitemap
  .replace(`${SITE}/blog/</loc>`, `${SITE}/blog/</loc><lastmod>2026-10-20T10:00:00+09:00</lastmod>`)
  .replace(`${SITE}/blog/a/</loc>`, `${SITE}/blog/a/</loc><lastmod>2026-10-25T11:00:00+09:00</lastmod>`)
  .replace(`${SITE}/blog/b/</loc>`, `${SITE}/blog/b/</loc><lastmod>2026-10-05</lastmod>`), '사이트맵 결과가 기대와 다르다');

// 얕은 복제와 git 없는 폴더: 아무것도 넣지 않고 종료 코드 0
const clone = path.join(tmp, 'clone');
run(tmp, 'git', ['clone', '-q', '--depth', '1', `file://${repo}`, clone]);
assert.strictEqual(run(clone, 'git', ['rev-parse', '--is-shallow-repository']).trim(), 'true', '얕은 복제를 만들지 못했다');
const plain = path.join(tmp, 'plain');
for (const root of [clone, plain]) {
  writeDist(root);
  run(root, process.execPath, [script]);
  for (const s of Object.keys(pages)) assert.strictEqual(readDist(root, s), pages[s], `${path.basename(root)}: ${s}에 날짜를 넣었다`);
  assert.strictEqual(readDist(root, 'sitemap'), sitemap, `${path.basename(root)}: 사이트맵에 lastmod를 넣었다`);
}
fs.rmSync(tmp, { recursive: true });
console.log(`ok blog-dates (글 ${posts}편 dateModified, 사이트맵 /blog/ lastmod ${blogUrls.length}개)`);
