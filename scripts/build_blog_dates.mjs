// 빌드 끝에 매거진 글의 마지막 수정일을 넣는다(P-245): dist/blog/<slug>/index.html의 BlogPosting JSON-LD에 dateModified,
// dist/sitemap.xml의 /blog/와 /blog/<slug>/ 항목에 <lastmod>. 글 89편 모두 발행 뒤 고쳤는데 검색엔진에 바뀐 날을 알릴 신호가 없었다.
// 날짜는 git log -1 --format=%cI -- public/blog/<slug>/index.html(목록은 public/blog/index.html)이다. ISO 8601이고 시간대를 포함한다.
// 이미 dateModified가 있으면 덮지 않고 그 값을 lastmod에도 쓴다. 날짜가 datePublished보다 앞서면 그 글은 둘 다 넣지 않고 경고한다.
// 얕은 저장소이거나 git이 없으면 날짜가 배포 커밋 하나로 뭉개지므로 아무것도 넣지 않고 경고만 내며 빌드는 통과한다.
// 지역 랜딩과 루트는 원본이 빌드 때 만들어져 git 날짜가 실제 수정 시점이 아니므로 넣지 않는다.
// 실행 시점: generate_seo_pages.mjs(사이트맵)와 vite build 뒤. 원본 public/blog/는 고치지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const blogDir = path.resolve('dist', 'blog');
const sitemapPath = path.resolve('dist', 'sitemap.xml');
const LD_RE = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;
const PUB_RE = /^([ \t]*)("datePublished"\s*:\s*"[^"]*")/m;

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (!fs.existsSync(blogDir)) {
  console.error('build_blog_dates: dist/blog가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

let shallow;
try {
  shallow = git('rev-parse', '--is-shallow-repository');
} catch (e) {
  console.warn(`build_blog_dates: git을 쓸 수 없어 dateModified와 lastmod를 넣지 않았다 (${e.message.split('\n')[0]})`);
  process.exit(0);
}
if (shallow !== 'false') {
  console.warn('build_blog_dates: 얕은 저장소라 git 날짜가 실제 수정 시점이 아니어서 dateModified와 lastmod를 넣지 않았다. 전체 이력으로 받아야 한다(checkout fetch-depth: 0).');
  process.exit(0);
}

const lastCommit = (rel) => git('log', '-1', '--format=%cI', '--', rel) || null;
// datePublished가 연월(2026-10)이나 일자만이면 그 길이만큼 잘라 비교하고, 시각까지 있으면 시각으로 비교한다.
const before = (modified, published) =>
  published.length > 10 ? Date.parse(modified) < Date.parse(published) : modified.slice(0, published.length) < published;

const warnings = [];
const lastmod = new Map(); // 사이트맵 경로 접미사('' 또는 '<slug>/') → 날짜
let added = 0;
let kept = 0;

const listDate = lastCommit('public/blog/index.html');
if (listDate) lastmod.set('', listDate);
else warnings.push('public/blog/index.html의 git 기록이 없다');

for (const slug of fs.readdirSync(blogDir).sort()) {
  const file = path.join(blogDir, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf-8');
  const date = lastCommit(`public/blog/${slug}/index.html`);
  if (!date) { warnings.push(`${slug}: public/blog/${slug}/index.html의 git 기록이 없다`); continue; }
  let pageDate = date;
  const out = html.replace(LD_RE, (all, open, body, close) => {
    let ld;
    try { ld = JSON.parse(body); } catch { warnings.push(`${slug}: JSON-LD를 읽지 못했다`); return all; }
    if (ld['@type'] !== 'BlogPosting') return all;
    if (ld.dateModified) { kept++; pageDate = ld.dateModified; return all; }
    if (typeof ld.datePublished !== 'string' || !PUB_RE.test(body)) { warnings.push(`${slug}: datePublished가 없어 dateModified를 넣지 않았다`); pageDate = null; return all; }
    if (before(date, ld.datePublished)) { warnings.push(`${slug}: git 날짜 ${date}가 datePublished ${ld.datePublished}보다 앞서 넣지 않았다`); pageDate = null; return all; }
    const next = body.replace(PUB_RE, (m, indent) => `${m},\n${indent}"dateModified": ${JSON.stringify(date)}`);
    JSON.parse(next);
    added++;
    return open + next + close;
  });
  if (out !== html) fs.writeFileSync(file, out);
  if (pageDate) lastmod.set(`${slug}/`, pageDate);
}

let stamped = 0;
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf-8');
  const out = xml.replace(/<url><loc>([^<]*\/blog\/((?:[^/<]+\/)?))<\/loc><\/url>/g, (all, loc, key) => {
    const date = lastmod.get(key);
    if (!date) return all;
    stamped++;
    return `<url><loc>${loc}</loc><lastmod>${date}</lastmod></url>`;
  });
  if (out !== xml) fs.writeFileSync(sitemapPath, out);
} else {
  warnings.push('dist/sitemap.xml이 없다');
}

console.log(`build_blog_dates: dateModified ${added}편에 넣었다 (이미 있던 글 ${kept}편), 사이트맵 lastmod ${stamped}개`);
if (warnings.length) console.warn(`build_blog_dates: 경고 ${warnings.length}건\n  ${warnings.join('\n  ')}`);
