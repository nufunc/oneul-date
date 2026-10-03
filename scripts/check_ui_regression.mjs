// 화면 회귀 점검(원장 사이클 35 점검 표). 라이브 390px에서 다섯 값을 재서 JSON 한 줄로 내고, 기준치를 벗어나면 종료 코드 1을 낸다.
// playwright는 저장소 의존성이 아니므로 npx로 받아 돌린다(처음 한 번은 브라우저도 받는다):
//   npx -y -p playwright playwright install chromium
//   npx -y -p playwright node scripts/check_ui_regression.mjs
// 환경변수: URL(기본 라이브), OUT(스크린샷 폴더, 없으면 찍지 않음), PREV(직전 회차의 출력 JSON 한 줄. 있으면 상대 기준도 본다)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // npx -p로 받은 패키지는 PATH의 .bin 옆 node_modules에만 있어 ESM import가 찾지 못한다
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const entry = path.join(dir, '..', 'playwright', 'index.mjs');
      if (dir.endsWith(path.join('node_modules', '.bin')) && fs.existsSync(entry)) return import(pathToFileURL(entry).href);
    }
    throw new Error('playwright를 찾지 못했다. 머리 주석의 npx 명령으로 실행한다');
  }
}

const URL = process.env.URL || 'https://nufunc.github.io/oneul-date/';
const OUT = process.env.OUT || '';
const PREV = process.env.PREV ? JSON.parse(process.env.PREV) : null;
const QUERIES = ['', '성수 카페', '부산', '제주', '서울 데이트', '강릉', '홍대'];
const SHEET_SPOTS = ['덕수궁', '대림창고', '경복궁', '매치스 성수'];
const shot = (name) => (OUT ? { path: path.join(OUT, `${name.replace(/\s/g, '_')}.png`) } : null);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL}?v=${Date.now()}`, { waitUntil: 'load' });
// 전체 스팟(spots.json, 약 20MB)을 다 받은 뒤에 잰다. 그 전에는 일부 스팟만으로 카드가 그려진다
await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.includes('spots.json') && r.responseEnd > 0), null, { timeout: 200000 });
const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => s.includes('/index-'))?.split('/').pop() || '');
await page.click('#tab-mode-spots');
await page.waitForSelector('.spot-discovery-grid .discovery-card', { timeout: 60000 });
await page.waitForTimeout(1500);

async function search(q) {
  await page.fill('#discovery-search-input', q);
  await page.waitForTimeout(1800);
}

// 배지가 부모 사진 영역 안에 다 보이는가(보이는 폭 = 폭, 높이 22px 이하)
const badgeFitFn = (root, frameSel) =>
  [...root.querySelectorAll('.badge-card-curation, .badge-hot-floating')].filter((b) => b.closest(frameSel)).map((b) => {
    const r = b.getBoundingClientRect();
    const f = b.closest(frameSel).getBoundingClientRect();
    const visibleW = Math.min(r.right, f.right) - Math.max(r.left, f.left);
    return Math.round(visibleW) >= Math.round(r.width) && r.height <= 22;
  });

// 1~2. 탐색 요약 줄과 🔥 배지 수, 카드 배지 잘림
let cards = 0, withSummary = 0, withText = 0, hot = 0;
const cardBadgeFits = [];
for (const q of QUERIES) {
  await search(q);
  const s = await page.evaluate((fnSrc) => {
    const fit = new Function(`return ${fnSrc}`)();
    const list = [...document.querySelectorAll('.spot-discovery-grid .discovery-card')].slice(0, 18);
    return {
      n: list.length,
      summary: list.filter((c) => c.querySelector('.discovery-card-summary')).length,
      text: list.filter((c) => c.querySelector('.discovery-card-summary, .discovery-card-fact')).length,
      hot: list.filter((c) => c.querySelector('.badge-card-curation.hot')).length,
      fits: list.flatMap((c) => fit(c, '.discovery-card-thumb')),
    };
  }, badgeFitFn.toString());
  cards += s.n; withSummary += s.summary; withText += s.text; hot += s.hot;
  cardBadgeFits.push(...s.fits);
  if (shot(`explore_${q || 'empty'}`)) await page.screenshot(shot(`explore_${q || 'empty'}`));
}

// 3~4. 시트 사진과 시트 배지 잘림
let sheetPhotoOk = 0;
const sheetBadgeFits = [];
for (const q of SHEET_SPOTS) {
  await search(q);
  await page.locator('.spot-discovery-grid .discovery-card').first().click();
  await page.waitForTimeout(3500);
  const r = await page.evaluate((fnSrc) => {
    const fit = new Function(`return ${fnSrc}`)();
    const hero = document.querySelector('.spot-detail-hero');
    const h = hero.getBoundingClientRect();
    const img = hero.querySelector('img');
    const ir = img?.getBoundingClientRect();
    const top = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
    const photo = Boolean(img && img.complete && img.naturalWidth > 0 && ir.top >= h.top - 1 && ir.bottom <= h.bottom + 1 && top === img);
    return { photo, fits: fit(hero, '.spot-detail-hero') };
  }, badgeFitFn.toString());
  if (r.photo) sheetPhotoOk++;
  sheetBadgeFits.push(...r.fits);
  if (shot(`sheet_hero_${q}`)) await page.locator('.spot-detail-hero').screenshot(shot(`sheet_hero_${q}`));
  await page.click('#overlay-close');
  await page.waitForTimeout(500);
}

// 5. 3열·5열에서 거리 배지와 큐레이션 배지의 교차 면적
await search('제주');
const overlap = {};
for (let k = 0; k < 3 && Object.keys(overlap).length < 2; k++) {
  const cols = await page.evaluate(() => document.querySelector('.spot-discovery-grid .discovery-card')?.className.match(/cols-\d/)?.[0]);
  if ((cols === 'cols-3' || cols === 'cols-5') && !(cols in overlap)) {
    overlap[cols] = await page.evaluate(() =>
      Math.max(0, ...[...document.querySelectorAll('.spot-discovery-grid .discovery-card')].slice(0, 18).map((c) => {
        const a = c.querySelector('.discovery-badge-dist')?.getBoundingClientRect();
        const b = c.querySelector('.badge-card-curation')?.getBoundingClientRect();
        if (!a || !b) return 0;
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      })),
    );
    if (shot(`explore_제주_${cols}`)) await page.screenshot(shot(`explore_제주_${cols}`));
  }
  await page.click('#btn-density-cycle');
  await page.waitForTimeout(1200);
}
await browser.close();

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const result = {
  bundle,
  cards,
  summaryPct: pct(withSummary, cards),
  textLinePct: pct(withText, cards),
  hot,
  sheetPhoto: `${sheetPhotoOk}/${SHEET_SPOTS.length}`,
  badgeFitPct: { sheet: pct(sheetBadgeFits.filter(Boolean).length, sheetBadgeFits.length), card: pct(cardBadgeFits.filter(Boolean).length, cardBadgeFits.length) },
  overlapPx2: { 'cols-3': Math.round(overlap['cols-3'] ?? -1), 'cols-5': Math.round(overlap['cols-5'] ?? -1) },
  errors: errors.length,
};

const fails = [];
if (cards !== QUERIES.length * 18) fails.push(`cards ${cards}`);
if (PREV && result.summaryPct < PREV.summaryPct - 10) fails.push(`summaryPct ${PREV.summaryPct}→${result.summaryPct}`);
if (hot === 0 || (PREV && (hot <= PREV.hot / 2 || hot >= PREV.hot * 2))) fails.push(`hot ${PREV?.hot ?? '-'}→${hot}`);
if (sheetPhotoOk !== SHEET_SPOTS.length) fails.push(`sheetPhoto ${result.sheetPhoto}`);
if (result.badgeFitPct.sheet !== 100 || result.badgeFitPct.card !== 100) fails.push('badgeFit');
if (result.overlapPx2['cols-3'] !== 0 || result.overlapPx2['cols-5'] !== 0) fails.push('overlap');
result.fails = fails;
console.log(JSON.stringify(result));
process.exit(fails.length ? 1 : 0);
