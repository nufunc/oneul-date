// 매거진 RSS 피드 빌드 결과 시험(P-537): npm run build 뒤 node scripts/test-blog-rss.cjs
// dist/blog/rss.xml이 XML로 파싱되고, item 수가 글 수와 같고, 모든 link가 canonical과 같으며 https://oneul.date/blog/로 시작하는지,
// guid·pubDate(RFC 822)·description이 있고 최신순인지, 블로그 목록 <head>에 alternate 링크가 있는지 본다.
// 빌드는 SITE_ORIGIN=https://oneul.date, BASE_PATH=/ 로 돌린 결과를 기준으로 한다(기본값 빌드면 주소 접두만 github.io 꼴로 본다).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const blog = path.join(dist, 'blog');
const slugs = fs.readdirSync(blog).filter((d) => fs.existsSync(path.join(blog, d, 'index.html')));
assert.ok(slugs.length > 3, 'dist/blog의 글을 읽지 못했다');

const xml = fs.readFileSync(path.join(blog, 'rss.xml'), 'utf8');
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML 선언이 없다');

// 의존성 없이 파싱 가능성을 본다: 태그 짝과 엔티티를 직접 검사한다
const stack = [];
for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|&([^;\s]*;?)/g)) {
  if (m[5] !== undefined) { assert.ok(/^(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);$/i.test(m[5]), `잘못된 엔티티: &${m[5]}`); continue; }
  if (m[4]) continue;
  if (m[1]) assert.strictEqual(stack.pop(), m[2], `태그 짝이 맞지 않는다: </${m[2]}>`);
  else stack.push(m[2]);
}
assert.strictEqual(stack.length, 0, `닫히지 않은 태그: ${stack.join(',')}`);

const text = (s, tag) => (s.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`)) || [])[1];
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
assert.ok(/<rss version="2\.0">/.test(xml), 'RSS 2.0이 아니다');
const channel = xml.slice(xml.indexOf('<channel>'), xml.indexOf('<item>'));
assert.ok(text(channel, 'title') && text(channel, 'link') && text(channel, 'description'), 'channel의 title, link, description이 빠졌다');
assert.strictEqual(text(channel, 'language'), 'ko', 'channel language가 ko가 아니다');
const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;
assert.ok(RFC822.test(text(channel, 'lastBuildDate') || ''), `lastBuildDate가 RFC 822가 아니다: ${text(channel, 'lastBuildDate')}`);

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => b);
assert.strictEqual(items.length, slugs.length, `item 수 ${items.length}가 글 수 ${slugs.length}와 다르다`);

const defaultBuild = text(channel, 'link').startsWith('https://nufunc.github.io/');
const prefix = defaultBuild ? /^https:\/\/nufunc\.github\.io\/oneul-date\/blog\// : /^https:\/\/oneul\.date\/blog\//;
const seen = new Set();
let prev = Infinity;
for (const it of items) {
  const link = unesc(text(it, 'link'));
  assert.ok(prefix.test(link), `link가 ${prefix} 로 시작하지 않는다: ${link}`);
  assert.ok(/\/blog\/[^/]+\/$/.test(link), `link가 글 주소 꼴이 아니다: ${link}`);
  const slug = link.match(/\/blog\/([^/]+)\/$/)[1];
  assert.ok(!seen.has(slug), `중복 항목: ${slug}`);
  seen.add(slug);
  const html = fs.readFileSync(path.join(blog, slug, 'index.html'), 'utf8');
  assert.strictEqual(link, html.match(/<link rel="canonical" href="([^"]*)"/)[1], `${slug}: link가 canonical과 다르다`);
  assert.strictEqual(unesc(text(it, 'guid')), link, `${slug}: guid가 link와 다르다`);
  assert.ok(unesc(text(it, 'title')).length > 0, `${slug}: title이 비었다`);
  assert.ok(unesc(text(it, 'description')).length > 0, `${slug}: description이 비었다`);
  const pub = text(it, 'pubDate');
  assert.ok(RFC822.test(pub), `${slug}: pubDate가 RFC 822가 아니다: ${pub}`);
  const t = Date.parse(pub);
  assert.ok(t <= prev, `${slug}: 최신순이 아니다`);
  prev = t;
}
assert.strictEqual(seen.size, slugs.length, '모든 글이 항목에 있어야 한다');

const list = fs.readFileSync(path.join(blog, 'index.html'), 'utf8');
const head = list.slice(0, list.indexOf('</head>'));
assert.ok(/<link rel="alternate" type="application\/rss\+xml" title="오늘 데이트 매거진" href="[^"]*\/blog\/rss\.xml">/.test(head), '블로그 목록 <head>에 RSS alternate 링크가 없다');

console.log(`ok: test-blog-rss (item ${items.length}개)`);
