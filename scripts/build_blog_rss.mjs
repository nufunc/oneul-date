// 빌드 끝에 매거진 RSS 2.0 피드 dist/blog/rss.xml을 만든다(P-537). 네이버 서치어드바이저 RSS 제출용이다.
// 항목은 dist/blog/<slug>/index.html 전부이고 최신순이다. title은 <title>, link와 guid는 canonical, description은 meta description이다.
// pubDate는 BlogPosting JSON-LD의 datePublished(RFC 822)이다. 날짜 출처를 새로 만들지 않고 build_blog_dates.mjs가 쓰는 JSON-LD를 읽는다.
// lastBuildDate는 항목 날짜(dateModified가 있으면 그것, 없으면 datePublished) 가운데 가장 늦은 값이라 같은 입력이면 산출물이 같다.
// 실행 시점: build_blog_dates.mjs 뒤, rebase_dist.mjs 앞. 링크는 기본 주소(github.io)로 만들고 rebase_dist가 SITE_ORIGIN으로 바꾼다.
// 원본 public/blog/는 고치지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SITE = 'https://nufunc.github.io/oneul-date';
const blogDir = path.resolve('dist', 'blog');
const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

if (!fs.existsSync(blogDir)) {
  console.error('build_blog_rss: dist/blog가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const unescapeHtml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e] ?? m;
});
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ISO 8601(시간대 포함, 일자만이나 소수 초도 허용)을 RFC 822로 바꾼다. 시간대는 입력 값 그대로 두고 +0900 꼴로 쓴다.
const rfc822 = (iso) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mi = '00', ss = '00', tz = '+09:00'] = m;
  const zone = tz === 'Z' ? '+0000' : tz.replace(':', '');
  const day = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  return `${day}, ${d} ${MONTHS[+mo - 1]} ${y} ${hh}:${mi}:${ss} ${zone}`;
};

const warnings = [];
const items = [];
for (const slug of fs.readdirSync(blogDir).sort()) {
  const file = path.join(blogDir, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf-8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const link = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  let post;
  for (const [, body] of html.matchAll(LD_RE)) {
    try { const ld = JSON.parse(body); if (ld['@type'] === 'BlogPosting') post = ld; } catch { /* 아래에서 날짜 없음으로 걸린다 */ }
  }
  const published = post?.datePublished && rfc822(post.datePublished);
  if (!title || !description || !link || !published) {
    warnings.push(`${slug}: title, description, canonical, datePublished 중 빠진 것이 있어 항목에서 뺐다`);
    continue;
  }
  const latest = (post.dateModified && Date.parse(post.dateModified)) || Date.parse(post.datePublished);
  items.push({ title: unescapeHtml(title.trim()), description: unescapeHtml(description), link, published, sortKey: Date.parse(post.datePublished), slug, latest });
}

// 최신순: 발행 시각 내림차순, 같으면 slug 오름차순
items.sort((a, b) => b.sortKey - a.sortKey || (a.slug < b.slug ? -1 : 1));

const lastBuild = items.length ? new Date(Math.max(...items.map((i) => i.latest))).toISOString().replace(/\.\d{3}Z$/, '+00:00') : null;
const channelDate = lastBuild ? rfc822(lastBuild) : null;

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0">',
  '  <channel>',
  '    <title>오늘 데이트 매거진</title>',
  `    <link>${DEFAULT_SITE}/blog/</link>`,
  '    <description>공개 데이터로 고른 데이트·여행 코스 가이드. 지역별 당일 코스와 주차·웨이팅 팁, 예상 정산표를 담은 매거진 글 모음.</description>',
  '    <language>ko</language>',
  ...(channelDate ? [`    <lastBuildDate>${channelDate}</lastBuildDate>`] : []),
  ...items.flatMap((i) => [
    '    <item>',
    `      <title>${esc(i.title)}</title>`,
    `      <link>${esc(i.link)}</link>`,
    `      <description>${esc(i.description)}</description>`,
    `      <pubDate>${i.published}</pubDate>`,
    `      <guid isPermaLink="true">${esc(i.link)}</guid>`,
    '    </item>',
  ]),
  '  </channel>',
  '</rss>',
  '',
].join('\n');

fs.writeFileSync(path.join(blogDir, 'rss.xml'), xml);
console.log(`build_blog_rss: dist/blog/rss.xml에 항목 ${items.length}개를 썼다`);
if (warnings.length) console.warn(`build_blog_rss: 경고 ${warnings.length}건\n  ${warnings.join('\n  ')}`);
