// 빌드 후 지역×시간대 조합별 정적 랜딩 페이지와 sitemap.xml을 dist에 생성한다.
// 실행 시점: vite build 직후 (postbuild). dist/index.html을 템플릿으로 클론해 쓴다.
import * as fs from 'fs';
import * as path from 'path';

const SITE_URL = 'https://nufunc.github.io/oneul-date';
const distDir = path.resolve('dist');
const templatePath = path.join(distDir, 'index.html');
const spotsPath = path.join(distDir, 'data', 'spots.json');

if (!fs.existsSync(templatePath) || !fs.existsSync(spotsPath)) {
  console.error('dist/index.html 또는 dist/data/spots.json이 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf-8');
const spots = JSON.parse(fs.readFileSync(spotsPath, 'utf-8'));

const REGIONS = [
  { key: '서울', slug: 'seoul' },
  { key: '경기', slug: 'gyeonggi' },
  { key: '인천', slug: 'incheon' },
  { key: '강원', slug: 'gangwon' },
  { key: '충청', slug: 'chungcheong' },
  { key: '영남', slug: 'yeongnam' },
  { key: '호남', slug: 'honam' },
  { key: '제주', slug: 'jeju' },
];

const SLOTS = [
  { key: 'day', label: '낮' },
  { key: 'evening', label: '저녁' },
  { key: 'night', label: '밤' },
  { key: 'stay', label: '숙박' },
];

const MIN_SPOTS_PER_PAGE = 3;
const TOP_N = 12;

function spotScore(spot) {
  const badgeCount = spot.curation_badges ? Object.values(spot.curation_badges).filter(Boolean).length : 0;
  const rating = spot.social_links?.kakaomap?.rating || 0;
  const hotScore = spot.hot_score || 0;
  return (spot.verified ? 20 : 0) + hotScore * 0.5 + badgeCount * 15 + rating * 10;
}

function naverMapUrl(spot) {
  const q = encodeURIComponent(`${spot.name} ${spot.area || ''}`.trim());
  if (spot.lat && spot.lng) {
    return `https://map.naver.com/p/search/${q}?c=${spot.lng},${spot.lat},16,0,0,0,dh`;
  }
  return `https://map.naver.com/p/search/${q}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function replaceMeta(html, property, content) {
  const attr = property.startsWith('og:') || property.startsWith('twitter:') ? 'property' : 'name';
  const re = new RegExp(`<meta ${attr}="${property}" content="[^"]*" />`);
  return html.replace(re, `<meta ${attr}="${property}" content="${escapeHtml(content)}" />`);
}

function buildPage(region, slot, pageSpots) {
  const url = `${SITE_URL}/${region.slug}/${slot.key}/`;
  const title = `${region.key} ${slot.label} 데이트 코스 추천 | 오늘 데이트`;
  const description = `${region.key} 지역 ${slot.label} 시간대에 어울리는 데이트 장소 ${pageSpots.length}곳을 모았다. 조건만 고르면 코스가 완성된다.`;

  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  html = replaceMeta(html, 'og:url', url);
  html = replaceMeta(html, 'og:title', title);
  html = replaceMeta(html, 'og:description', description);
  html = replaceMeta(html, 'twitter:url', url);
  html = replaceMeta(html, 'twitter:title', title);
  html = replaceMeta(html, 'twitter:description', description);
  html = html.replace('</head>', `    <link rel="canonical" href="${url}" />\n  </head>`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: pageSpots.map((spot, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Place',
        name: spot.name,
        address: spot.address || undefined,
        image: spot.image_url || undefined,
        url: naverMapUrl(spot),
      },
    })),
  };
  html = html.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`);

  const listItems = pageSpots.map((spot) => `
        <li class="seo-spot-item">
          <a href="${escapeHtml(naverMapUrl(spot))}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(spot.name)}</strong>
            <span>${escapeHtml(spot.area || '')}${spot.category ? ` · ${escapeHtml(spot.category)}` : ''}</span>
          </a>
          ${spot.summary ? `<p>${escapeHtml(spot.summary)}</p>` : ''}
        </li>`).join('');

  const seoSection = `
    <section id="seo-landing" aria-label="${escapeHtml(region.key)} ${escapeHtml(slot.label)} 데이트 코스 추천">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <ul>${listItems}
      </ul>
      <p><a href="${SITE_URL}/">오늘 데이트에서 직접 코스 만들기 →</a></p>
    </section>`;

  html = html.replace('<div id="app"></div>', `<div id="app"></div>${seoSection}`);
  return html;
}

const sitemapUrls = [`${SITE_URL}/`];
let pageCount = 0;

for (const region of REGIONS) {
  for (const slot of SLOTS) {
    const seenKeys = new Set();
    const candidates = spots
      .filter((s) => s.region === region.key && s.slot === slot.key && !s.is_closed)
      .sort((a, b) => spotScore(b) - spotScore(a))
      .filter((s) => {
        const key = `${s.name}|${s.address || ''}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

    if (candidates.length < MIN_SPOTS_PER_PAGE) {
      console.warn(`스킵: ${region.key}/${slot.key} 후보 ${candidates.length}곳 (최소 ${MIN_SPOTS_PER_PAGE}곳 필요)`);
      continue;
    }

    const pageSpots = candidates.slice(0, TOP_N);
    const outDir = path.join(distDir, region.slug, slot.key);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), buildPage(region, slot, pageSpots));
    sitemapUrls.push(`${SITE_URL}/${region.slug}/${slot.key}/`);
    pageCount += 1;
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap);

console.log(`SEO 랜딩 페이지 ${pageCount}개, sitemap.xml(${sitemapUrls.length}개 URL) 생성 완료.`);
