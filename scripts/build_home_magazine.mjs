// 빌드 끝에 루트 dist/index.html에만 canonical, WebSite JSON-LD, 정적 h1을 넣는다(P-229).
// 정적 h1은 #app 안의 sr-only라 앱이 그리면 앱 h1로 바뀌고 자리를 차지하지 않는다.
// 실행 시점: generate_seo_pages.mjs 뒤. 그 뒤에 돌려야 지역 랜딩(dist/<region>/<slot>/)이 루트 canonical을 복제하지 않는다.
// 첫 화면의 최신 매거진 글 블록과 지역별 코스 링크 목록은 2026-11-03 사용자 지시로 넣지 않는다. 지역 랜딩 노출은 sitemap.xml이 맡는다.
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const APP_TAG = '<div id="app"></div>';
const SITE_URL = 'https://nufunc.github.io/oneul-date/';

function fail(message) {
  console.error(`build_home_magazine: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) fail('dist/index.html이 없다. vite build 이후에 실행해야 한다.');

const html = fs.readFileSync(indexPath, 'utf-8');
if (html.split(APP_TAG).length !== 2) fail(`dist/index.html에 ${APP_TAG}가 정확히 하나 있어야 한다.`);
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

// JS를 실행하지 않는 크롤러도 루트에서 매거진에 닿도록 상단 메뉴와 같은 링크를 둔다. renderShell이 #app을 통째로 바꿔 화면에는 남지 않는다(P-371)
const appWithH1 = '<div id="app"><h1 class="sr-only">오늘 데이트</h1><a class="sr-only" href="./blog/">매거진</a></div>';
fs.writeFileSync(indexPath, html.replace('</head>', headTags).replace(APP_TAG, appWithH1));
console.log('build_home_magazine: dist/index.html에 canonical, WebSite JSON-LD, 정적 h1을 넣었다');
