// 빌드 끝에 dist/blog/index.html의 앞 카드 4장을 읽어 dist/index.html의 <div id="app"> 앞에 정적 매거진 블록을 넣는다.
// 같은 단계에서 dist에 만들어진 지역 랜딩(dist/<region>/<slot>/) 링크 목록을 #app 뒤에 넣는다. 지역 랜딩이 크롤 가능한 링크 없이 고립되지 않게 한다.
// 실행 시점: generate_seo_pages.mjs 뒤. 그 뒤에 돌려야 지역 랜딩(dist/<region>/<slot>/)이 이 블록을 복제하지 않는다.
// 같은 단계에서 루트에만 canonical, WebSite JSON-LD, 정적 h1을 넣는다(P-229). 정적 h1은 #app 안의 sr-only라 앱이 그리면 앱 h1로 바뀌고 자리를 차지하지 않는다.
// 카드를 4장 읽지 못하면 빈 블록을 만들지 않고 빌드를 실패시킨다.
import fs from 'node:fs';
import path from 'node:path';

const COUNT = 4;
const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const blogIndexPath = path.join(distDir, 'blog', 'index.html');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const APP_TAG = '<div id="app"></div>';
const SITE_URL = 'https://nufunc.github.io/oneul-date/';

function fail(message) {
  console.error(`build_home_magazine: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath) || !fs.existsSync(blogIndexPath)) fail('dist/index.html 또는 dist/blog/index.html이 없다. vite build 이후에 실행해야 한다.');

const blogHtml = fs.readFileSync(blogIndexPath, 'utf-8');
const cards = [];
const cardRe = /<a href="([^"]*)" class="post-card">([\s\S]*?)<\/a>/g;
for (const m of blogHtml.matchAll(cardRe)) {
  if (cards.length === COUNT) break;
  const slug = m[1].match(/^([a-z0-9-]+)\/$/)?.[1];
  const title = m[2].match(/<h2 class="card-title">([\s\S]*?)<\/h2>/)?.[1].replace(/<[^>]*>/g, '').trim();
  if (!slug || !title) fail(`카드를 읽지 못했다: href="${m[1]}"`);
  cards.push({ slug, title });
}
if (cards.length < COUNT) fail(`카드 ${cards.length}장만 읽었다(필요 ${COUNT}장).`);

const html = fs.readFileSync(indexPath, 'utf-8');
if (html.split(APP_TAG).length !== 2) fail(`dist/index.html에 ${APP_TAG}가 정확히 하나 있어야 한다.`);
if (html.includes('id="home-magazine"')) fail('dist/index.html에 이미 매거진 블록이 있다. vite build부터 다시 돌린다.');
if (html.includes('rel="canonical"') || html.includes('application/ld+json')) fail('dist/index.html에 이미 canonical이나 JSON-LD가 있다.');
const description = html.match(/<meta name="description" content="([^"]*)" \/>/)?.[1];
if (!description) fail('dist/index.html에서 meta description을 읽지 못했다.');
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '오늘 데이트',
  url: SITE_URL,
  inLanguage: 'ko-KR',
  description,
};
const headTags = `    <link rel="canonical" href="${SITE_URL}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>`;

// 지역 랜딩 목록: generate_seo_pages.mjs가 만든 sitemap.xml의 순서(지역 정의 순서)를 따르고, dist에 실제로 있는 쪽만 쓴다.
// 링크 글자는 랜딩의 aria-label("서울 낮 데이트 코스 추천")에서 지역과 시간대를 읽는다.
if (!fs.existsSync(sitemapPath)) fail('dist/sitemap.xml이 없다. generate_seo_pages.mjs 이후에 실행해야 한다.');
const regions = new Map();
for (const m of fs.readFileSync(sitemapPath, 'utf-8').matchAll(/<loc>[^<]*\/([a-z]+)\/([a-z]+)\/<\/loc>/g)) {
  const [, region, slot] = m;
  const landingPath = path.join(distDir, region, slot, 'index.html');
  if (region === 'blog' || !fs.existsSync(landingPath)) continue;
  const label = fs.readFileSync(landingPath, 'utf-8').match(/<section id="seo-landing" aria-label="(\S+) (\S+) 데이트 코스 추천">/);
  if (!label) fail(`지역 랜딩 제목을 읽지 못했다: ${region}/${slot}`);
  if (!regions.has(region)) regions.set(region, []);
  regions.get(region).push(`<a href="./${region}/${slot}/">${label[1]} ${label[2]}</a>`);
}
if (regions.size === 0) fail('dist에서 지역 랜딩을 하나도 찾지 못했다.');
const regionItems = [...regions.values()].map((links) => `
        <li>${links.join('')}</li>`).join('');
const regionNav = `
    <nav id="home-regions" class="home-regions" aria-labelledby="home-regions-title">
      <h2 id="home-regions-title" class="home-magazine-title">지역별 데이트 코스</h2>
      <ul class="home-regions-list">${regionItems}
      </ul>
    </nav>`;
const linkCount = [...regions.values()].reduce((n, links) => n + links.length, 0);

const items = cards.map((c) => `
        <li><a href="./blog/${c.slug}/">${c.title}</a></li>`).join('');
const section = `<section id="home-magazine" class="home-magazine" aria-labelledby="home-magazine-title">
      <h2 id="home-magazine-title" class="home-magazine-title">최신 매거진 글</h2>
      <ul class="home-magazine-list">${items}
      </ul>
      <a class="home-magazine-more" href="./blog/">매거진 전체 보기 →</a>
    </section>
    `;

const appWithH1 = '<div id="app"><h1 class="sr-only">오늘 데이트</h1></div>';
fs.writeFileSync(indexPath, html.replace('</head>', headTags).replace(APP_TAG, section + appWithH1 + regionNav));
console.log(`build_home_magazine: dist/index.html에 매거진 글 ${cards.length}편 블록을 넣었다 (${cards.map((c) => c.slug).join(', ')})`);
console.log('build_home_magazine: dist/index.html에 canonical, WebSite JSON-LD, 정적 h1을 넣었다');
console.log(`build_home_magazine: dist/index.html에 지역 랜딩 링크 ${linkCount}개(${regions.size}개 지역)를 넣었다`);
