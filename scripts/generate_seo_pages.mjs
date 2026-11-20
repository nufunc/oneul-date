// 빌드 후 지역×시간대 조합별 정적 랜딩 페이지와 sitemap.xml을 dist에 생성한다.
// 실행 시점: vite build 직후 (postbuild). dist/index.html을 템플릿으로 클론해 쓴다.
import * as fs from 'fs';
import * as path from 'path';

const SITE_URL = 'https://nufunc.github.io/oneul-date';
const distDir = path.resolve('dist');
const templatePath = path.join(distDir, 'index.html');
// 산출물에는 단일 spots.json이 없으므로(P-513) 원본을 읽는다
const spotsPath = path.resolve('public', 'data', 'spots.json');

if (!fs.existsSync(templatePath) || !fs.existsSync(spotsPath)) {
  console.error('dist/index.html 또는 public/data/spots.json이 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf-8');
const spots = JSON.parse(fs.readFileSync(spotsPath, 'utf-8'));

// app: 앱 지역 칩 키(src/main.ts REGIONS). 앱은 인천을 경기·인천 칩 하나로 묶는다(P-488)
const REGIONS = [
  { key: '서울', slug: 'seoul', app: 'SEOUL' },
  { key: '경기', slug: 'gyeonggi', app: 'GYEONGGI' },
  { key: '인천', slug: 'incheon', app: 'GYEONGGI' },
  { key: '강원', slug: 'gangwon', app: 'GANGWON' },
  { key: '충청', slug: 'chungcheong', app: 'CHUNGCHEONG' },
  { key: '영남', slug: 'yeongnam', app: 'YEONGNAM' },
  { key: '호남', slug: 'honam', app: 'HONAM' },
  { key: '제주', slug: 'jeju', app: 'JEJU' },
];

const SLOTS = [
  { key: 'day', label: '낮' },
  { key: 'evening', label: '저녁' },
  { key: 'night', label: '밤' },
  { key: 'stay', label: '숙박' },
];

const MIN_SPOTS_PER_PAGE = 3;
const TOP_N = 12;
// 공유 미리보기 사진(P-383): 그 쪽 목록에서 점수가 가장 높은 스팟 가운데 카카오 자르기 주소가 받는 호스트의 사진을 쓴다.
// 매거진 글과 같은 C1200x630 JPEG 주소다(P-373, build_blog_image_sizes.mjs). 없으면 템플릿의 og-v2.png를 둔다.
const OG_HOST_RE = /^https?:\/\/(t1\.daumcdn\.net|t1\.kakaocdn\.net|tong\.visitkorea\.or\.kr)\//;
const OG_PREFIX = 'https://img1.daumcdn.net/thumb/C1200x630.fjpg/?fname=';

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
  const attr = property.startsWith('og:') ? 'property' : 'name';
  const re = new RegExp(`<meta ${attr}="${property}" content="[^"]*" />`);
  return html.replace(re, `<meta ${attr}="${property}" content="${escapeHtml(content)}" />`);
}

// 랜딩 32쪽을 크롤러가 따라갈 수 있게 같은 지역의 다른 시간대, 다른 지역의 같은 시간대, /blog/를 잇는다(P-369).
// generated에 든 조합만 링크하므로 MIN_SPOTS_PER_PAGE 미달로 건너뛴 쪽은 링크가 생기지 않는다.
function buildNav(region, slot, generated) {
  const link = (r, sl, text) => `<a href="${SITE_URL}/${r.slug}/${sl.key}/">${escapeHtml(text)}</a>`;
  const sameRegion = SLOTS.filter((sl) => sl.key !== slot.key && generated.has(`${region.slug}/${sl.key}`))
    .map((sl) => link(region, sl, `${region.key} ${sl.label}`));
  const sameSlot = REGIONS.filter((r) => r.slug !== region.slug && generated.has(`${r.slug}/${slot.key}`))
    .map((r) => link(r, slot, `${r.key} ${slot.label}`));
  const lines = [];
  if (sameRegion.length) lines.push(`<p>${escapeHtml(region.key)} 다른 시간대: ${sameRegion.join(' · ')}</p>`);
  if (sameSlot.length) lines.push(`<p>다른 지역 ${escapeHtml(slot.label)} 코스: ${sameSlot.join(' · ')}</p>`);
  lines.push(`<p><a href="${SITE_URL}/blog/">데이트 코스 매거진 보기</a></p>`);
  return `<nav aria-label="다른 데이트 코스 추천">\n        ${lines.join('\n        ')}\n      </nav>`;
}

// 검색 결과 설명(P-385): 지역·시간대와 그 쪽 목록 상위 장소 이름(점수순, 이름 중복 제외 최대 3곳)을 넣어 쪽마다 다르게 한다.
// 155자를 넘으면 이름을 뒤에서부터 하나씩 뺀다. 같은 spots.json이면 같은 문장이 나온다.
const DESC_MAX = 155;
function buildDescription(region, slot, pageSpots) {
  const names = [...new Set(pageSpots.map((s) => String(s.name || '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3);
  const make = (n) => `${region.key} ${slot.label} 데이트 코스 추천: ${names.slice(0, n).join(', ')} 등 ${region.key} 지역 ${slot.label} 시간대에 어울리는 장소 ${pageSpots.length}곳을 모았다. 조건만 고르면 코스가 완성된다.`;
  let n = names.length;
  while (n > 1 && make(n).length > DESC_MAX) n -= 1;
  return make(n);
}

// 랜딩 집계 본문(P-538): 그 권역·시간대 후보 전체(candidates)에서 업종, 동네, 영업시간, 휴무일을 세어 문장으로 쓴다.
// 데이터에 없는 분위기·후기·가격은 쓰지 않는다. 문장은 집계 값의 크기에 따라 다른 틀을 고른다.
const CATEGORY_GROUPS = [
  ['숙소', /숙박|펜션|호텔|캠핑|글램핑|리조트|콘도|한옥|민박|모텔|게스트/],
  ['카페와 디저트', /카페|커피|디저트|베이커리|제과|떡|아이스크림|찻집|차$/],
  ['술집', /호프|주점|와인|이자카야|포장마차|맥주|칵테일|술집|바$/],
  ['자연과 관광지', /자연|산책|관광|명소|공원|해수욕장|해변|섬|계곡|전망|수목원|폭포|산$|호수|사찰|유적|테마거리|도보|케이블카|생가|고택|산성|성곽|하천|숲|천문대|온천/],
  ['문화와 체험', /문화|전시|박물관|미술|공예|공연|체험|레포츠|테마파크|쇼핑|공방|소품|놀이|스파|워터|시장|서점|스포츠|도자기|음악|페스티벌|향수|사진|잡화|꽃|화랑|아쿠아리움|클라이밍|승마|팝업/],
  ['식당', /식|고기|육류|초밥|스테이크|곱창|국수|면|돈까스|해물|회|치킨|피자|이탈리안|뷔페|분식|샤브|족발|요리|갈비|국밥|찌개|해산물|생선|장어|오리|닭|버거|브런치|삼겹살|두부|순대|바베큐|조개|먹자골목|대게|쌈밥|멕시칸/],
];
const SLOT_CHECK = { day: [14, '오후 2시'], evening: [19, '저녁 7시'], night: [22, '밤 10시'], stay: [20, '저녁 8시'] };
const WEEKDAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

function groupOf(category) {
  const c = String(category || '');
  const hit = CATEGORY_GROUPS.find(([, re]) => re.test(c));
  return hit ? hit[0] : '기타';
}

// 동네: 광역시·도가 섞이는 권역은 시·도와 시·군·구를, 제주는 시와 읍·면·동을, 나머지는 시·군·구를 쓴다
function neighborhoodOf(spot, region) {
  const t = String(spot.address || '').split(/\s+/).filter(Boolean);
  if (t.length < 2) return spot.area || '';
  if (region.slug === 'jeju') return t[2] && /[읍면]$/.test(t[2]) ? `${t[1]} ${t[2]}` : `${t[1]} 동 지역`;
  if (['seoul', 'gyeonggi', 'incheon'].includes(region.slug)) return t[1];
  return `${t[0]} ${t[1]}`;
}

// 영업시간 문자열의 HH:MM~HH:MM 구간 가운데 하나라도 그 시각을 덮으면 연 것으로 본다. 상시 개방과 24시간도 연 것으로 본다
function openAt(spot, hour) {
  if (spot.is_24h) return true;
  const raw = Object.values(spot.business_hours || {}).join(' / ');
  if (!raw) return null;
  if (/상시|24시간/.test(raw)) return true;
  const ranges = [...raw.matchAll(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return null;
  const t = hour * 60;
  return ranges.some(([, h1, m1, h2, m2]) => {
    const a = Number(h1) * 60 + Number(m1);
    let b = Number(h2) * 60 + Number(m2);
    if (b <= a) b += 24 * 60;
    return (a <= t && t < b) || (a <= t + 1440 && t + 1440 < b);
  });
}

const pct = (n, d) => Math.round((n / d) * 100);
const hasBatchim = (w) => {
  const c = String(w).trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const josa = (w, withB, without) => `${w}${hasBatchim(w) ? withB : without}`;
const top = (counter, n) => [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
function count(items) {
  const m = new Map();
  for (const k of items) if (k) m.set(k, (m.get(k) || 0) + 1);
  return m;
}

function buildGuide(region, slot, candidates) {
  const total = candidates.length;
  const where = `${region.key} ${slot.label}`;
  const paras = [];

  // 1. 업종 구성
  const cats = top(count(candidates.map((s) => s.category)), 5);
  const groups = top(count(candidates.map((s) => groupOf(s.category)).filter((g) => g !== '기타')), 3);
  const [g1, g1n] = groups[0];
  const g1p = pct(g1n, total);
  const catList = cats.map(([c, n]) => `${c} ${n}곳`).join(', ');
  let comp = `${where} 후보는 모두 ${total}곳이고 업종은 ${catList} 순으로 많다.`;
  if (g1p >= 50) comp += ` 묶어서 보면 ${josa(g1, '이', '가')} ${g1n}곳으로 절반이 넘는 ${g1p}%를 차지한다.`;
  else if (g1p >= 30) comp += ` 묶어서 보면 ${g1} ${g1n}곳(${g1p}%)이 가장 크고, ${groups[1] ? `${groups[1][0]} ${groups[1][1]}곳이 뒤를 잇는다` : '나머지는 흩어져 있다'}.`;
  else comp += ` 가장 큰 묶음인 ${g1}도 ${g1n}곳(${g1p}%)에 그쳐 업종이 고르게 나뉜다.`;
  if (groups[2]) comp += ` 그다음 묶음은 ${groups[2][0]} ${groups[2][1]}곳(${pct(groups[2][1], total)}%)이다.`;
  paras.push(comp);
  paras.push(`위 목록 ${Math.min(TOP_N, total)}곳은 후보 ${total}곳 가운데 카카오 확인 여부, 큐레이션 배지 수, 카카오맵 평점, 언급 점수를 더한 점수가 높은 순으로 골랐다.`);

  // 2. 동네 분포와 동네별 구성
  const hoods = top(count(candidates.map((s) => neighborhoodOf(s, region))), 5).filter(([, n]) => n >= 3);
  if (hoods.length) {
    const top3 = hoods.slice(0, 3);
    const top3n = top3.reduce((a, [, n]) => a + n, 0);
    const top3p = pct(top3n, total);
    const names = top3.map(([h, n]) => `${h} ${n}곳`).join(', ');
    let spread = `후보가 많은 동네는 ${names}이다.`;
    if (top3p >= 60) spread += ` 이 ${top3.length}곳에 전체의 ${top3p}%가 모여 있어 한 동네 안에서 코스를 짜기 쉽다.`;
    else if (top3p >= 30) spread += ` 상위 ${top3.length}곳이 ${top3p}%를 차지하고 나머지 ${total - top3n}곳은 그 밖의 동네에 있다.`;
    else spread += ` 상위 ${top3.length}곳을 합해도 ${top3p}%라 후보가 ${region.key} 곳곳에 흩어져 있다.`;
    paras.push(spread);

    const hoodLines = hoods.slice(0, 5).map(([h, n]) => {
      const inHood = candidates.filter((s) => neighborhoodOf(s, region) === h);
      const hc = top(count(inHood.map((s) => s.category)), 2);
      const picks = [...new Set(inHood.map((s) => s.name))].slice(0, 3).join(', ');
      const lead = hc[0] && pct(hc[0][1], n) >= 50
        ? `${josa(h, '은', '는')} ${n}곳 가운데 ${josa(hc[0][0], '이', '가')} ${hc[0][1]}곳으로 절반을 넘는다.`
        : `${josa(h, '은', '는')} ${n}곳이고 ${hc.map(([c, k]) => `${c} ${k}곳`).join(', ')} 순이다.`;
      return `<li><p>${escapeHtml(lead)} 점수가 높은 곳은 ${escapeHtml(picks)} 순이다.</p></li>`;
    });
    paras.push({ list: hoodLines });
  }

  // 3. 영업시간과 휴무일
  const [hour, hourLabel] = SLOT_CHECK[slot.key];
  const known = candidates.map((s) => openAt(s, hour)).filter((v) => v !== null);
  const openN = known.filter(Boolean).length;
  const knownP = pct(known.length, total);
  let hours = '';
  if (known.length === 0) hours = `${where} 후보 ${total}곳에는 영업시간 정보가 아직 없다.`;
  else {
    hours = `영업시간 정보가 있는 곳은 ${known.length}곳(${knownP}%)이고, 그 가운데 ${openN}곳(${pct(openN, known.length)}%)이 ${hourLabel}에 영업시간 안에 든다.`;
    const always = candidates.filter((s) => s.is_24h || /상시|24시간/.test(Object.values(s.business_hours || {}).join(' '))).length;
    if (always) hours += ` 후보 ${total}곳 가운데 상시 개방이거나 24시간 여는 곳은 ${always}곳이다.`;
    const ends = top(count(candidates.map((s) => {
      const m = [...Object.values(s.business_hours || {}).join(' ').matchAll(/~\s*(\d{1,2}:\d{2})/g)];
      return m.length ? m[0][1] : null;
    })), 1);
    if (ends.length) hours += ` 영업을 마치는 시각은 ${ends[0][0]}이 ${ends[0][1]}곳(영업시간을 아는 곳의 ${pct(ends[0][1], known.length)}%)으로 가장 흔하다.`;
  }
  const closed = top(count(candidates.flatMap((s) => s.closed_days || []).filter((d) => WEEKDAYS.includes(d))), 2);
  if (closed.length) hours += ` 쉬는 날이 정해진 곳은 ${josa(closed[0][0], '이', '가')} ${closed[0][1]}곳으로 가장 많고${closed[1] ? ` ${closed[1][0]} ${closed[1][1]}곳이 다음이다` : ' 다른 요일은 적다'}.`;
  else hours += ` 후보 ${total}곳 가운데 요일별 휴무일이 등록된 곳은 없다.`;
  paras.push(hours);

  // 4. 외부 근거
  const rated = candidates.map((s) => s.social_links?.kakaomap?.rating).filter((r) => r > 0);
  const yt = candidates.filter((s) => s.social_links?.youtube?.url).length;
  const verified = candidates.filter((s) => s.verified).length;
  let ev = `카카오 장소 정보로 주소와 업종을 확인한 곳은 ${verified}곳(${pct(verified, total)}%)이다.`;
  if (rated.length) ev += ` 카카오맵 평점이 있는 ${rated.length}곳의 평균은 ${(rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1)}점이다.`;
  ev += yt ? ` 유튜브 소개 영상이 연결된 곳은 ${yt}곳(${pct(yt, total)}%)이다.` : ` ${where} 후보에는 유튜브 소개 영상이 연결된 곳이 아직 없다.`;
  paras.push(ev);

  // 5. 코스 고르는 법: 위 집계에서 가장 두드러진 값에 따라 안내를 고른다
  const tips = [];
  if (groups[1]) tips.push(`${g1} ${g1n}곳과 ${groups[1][0]} ${groups[1][1]}곳이 후보의 큰 몫이니, 두 묶음에서 한 곳씩 골라 ${where} 코스의 앞뒤를 채운다.`);
  else tips.push(`후보 ${total}곳 대부분이 ${g1}이라 ${g1} 가운데 동선이 맞는 두세 곳을 이어 ${where} 코스를 만든다.`);
  if (hoods.length) {
    const [h1, h1n] = hoods[0];
    tips.push(pct(h1n, total) >= 25
      ? `${h1}에만 ${h1n}곳이 있으니 이 동네 안에서 두세 곳을 이어 코스를 짤 수 있다.`
      : `가장 많은 ${h1}도 ${h1n}곳(${pct(h1n, total)}%)이라, 앱에서 세부 지역을 먼저 고르면 이동 거리를 줄일 수 있다.`);
  }
  if (known.length && knownP < 50) tips.push(`영업시간을 모르는 곳이 ${total - known.length}곳이라 장소 이름의 지도 링크에서 ${hourLabel} 영업 여부를 한 번 더 확인한다.`);
  else if (known.length) tips.push(`영업시간을 아는 ${known.length}곳 가운데 ${hourLabel}에 닫는 ${known.length - openN}곳은 빼고 남은 ${openN}곳에서 먼저 고른다.`);
  if (closed.length) tips.push(`${closed[0][0]}에 나간다면 그날 쉬는 ${closed[0][1]}곳을 빼고 남은 ${total - closed[0][1]}곳에서 고른다.`);

  const body = paras.map((p) => (typeof p === 'string'
    ? `<p>${escapeHtml(p)}</p>`
    : `<ul class="seo-guide-hoods">${p.list.join('')}</ul>`)).join('\n        ');
  return `<div class="seo-guide">
        <h2>${escapeHtml(where)} 후보 한눈에 보기</h2>
        ${body}
        <h2>${escapeHtml(where)} 코스 고르는 법</h2>
        <ol>${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>
      </div>`;
}

function buildPage(region, slot, pageSpots, generated, candidates) {
  const url = `${SITE_URL}/${region.slug}/${slot.key}/`;
  const title = `${region.key} ${slot.label} 데이트 코스 추천 | 오늘 데이트`;
  const description = buildDescription(region, slot, pageSpots);

  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  html = replaceMeta(html, 'og:url', url);
  html = replaceMeta(html, 'og:title', title);
  html = replaceMeta(html, 'og:description', description);
  html = replaceMeta(html, 'twitter:url', url);
  html = replaceMeta(html, 'twitter:title', title);
  html = replaceMeta(html, 'twitter:description', description);
  const photo = pageSpots.find((spot) => OG_HOST_RE.test(spot.image_url || ''));
  if (photo) {
    const ogImage = OG_PREFIX + encodeURIComponent(photo.image_url);
    html = replaceMeta(html, 'og:image', ogImage);
    html = replaceMeta(html, 'twitter:image', ogImage);
  }
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
    <section id="seo-landing" data-region="${region.app}" data-slot="${slot.key}" aria-label="${escapeHtml(region.key)} ${escapeHtml(slot.label)} 데이트 코스 추천">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <p class="seo-cta"><a class="seo-cta-btn" href="${SITE_URL}/?r=${region.app}&amp;s=${slot.key}">오늘 데이트에서 직접 코스 만들기 →</a></p>
      <ul>${listItems}
      </ul>
      ${buildGuide(region, slot, candidates)}
      ${buildNav(region, slot, generated)}
      <p><a href="${SITE_URL}/?r=${region.app}&amp;s=${slot.key}">오늘 데이트에서 직접 코스 만들기 →</a></p>
    </section>`;

  html = html.replace('<div id="app"></div>', `${seoSection}<div id="app"></div>`);
  return html;
}

const sitemapUrls = [`${SITE_URL}/`];
let pageCount = 0;

// 1단계: 만들 조합을 모두 정한다. 랜딩끼리 잇는 링크가 실제로 만든 쪽만 가리키려면 쓰기 전에 전체를 알아야 한다.
const plannedPages = [];
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

    plannedPages.push({ region, slot, pageSpots: candidates.slice(0, TOP_N), candidates });
  }
}
const generated = new Set(plannedPages.map(({ region, slot }) => `${region.slug}/${slot.key}`));

// 2단계: 페이지를 쓴다.
for (const { region, slot, pageSpots, candidates } of plannedPages) {
  const outDir = path.join(distDir, region.slug, slot.key);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), buildPage(region, slot, pageSpots, generated, candidates));
  sitemapUrls.push(`${SITE_URL}/${region.slug}/${slot.key}/`);
  pageCount += 1;
}

// 블로그 매거진 페이지를 sitemap에 등록
sitemapUrls.push(`${SITE_URL}/blog/`);
const blogPublicDir = path.resolve('public', 'blog');
// 글 목록은 public/blog/<slug>/index.html이 있는 폴더만 믿는다. 지운 글이 사이트맵에 남지 않게 한다
const blogPosts = fs.existsSync(blogPublicDir)
  ? fs.readdirSync(blogPublicDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(blogPublicDir, d.name, 'index.html')))
    .map((d) => d.name)
    .sort()
  : [];
for (const post of blogPosts) {
  sitemapUrls.push(`${SITE_URL}/blog/${post}/`);
}
// 소개와 개인정보처리방침(P-536)
sitemapUrls.push(`${SITE_URL}/about`, `${SITE_URL}/privacy`);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap);

console.log(`SEO 랜딩 페이지 ${pageCount}개, sitemap.xml(${sitemapUrls.length}개 URL) 생성 완료.`);
