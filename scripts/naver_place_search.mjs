// 네이버 지도 장소 검색(P-049). 앱 링크와 같은 map.naver.com/p/search 주소를 열어 allSearch 응답의 상위 5곳을 받는다.
// 입력은 [{key, q, lng, lat}] JSON, 출력은 {key: {q, captcha, total, top}} JSON이고 이미 받은 key는 건너뛴다.
// 캡차가 나오면 그 자리에서 멈추고 종료 코드 2를 낸다. playwright는 저장소 의존성이 아니므로 npx로 돌린다:
//   npx -y -p playwright node scripts/naver_place_search.mjs in.json out.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // npx -p로 받은 패키지는 PATH의 .bin 옆 node_modules에만 있어 ESM import가 찾지 못한다(check_ui_regression.mjs와 같다)
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const entry = path.join(dir, '..', 'playwright', 'index.mjs');
      if (dir.endsWith(path.join('node_modules', '.bin')) && fs.existsSync(entry)) return import(pathToFileURL(entry).href);
    }
    throw new Error('playwright를 찾지 못했다. 머리 주석의 npx 명령으로 실행한다');
  }
}

const [inFile, outFile] = process.argv.slice(2);
const todo = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const ctx = await browser.newContext({
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
});
const page = await ctx.newPage();
let captcha = false;
for (const t of todo) {
  if (out[t.key]) continue;
  let data = null;
  const onResponse = async (res) => {
    if (res.url().includes('allSearch')) data = await res.json().catch(() => null);
  };
  page.on('response', onResponse);
  const coord = t.lng && t.lat ? `?c=${t.lng},${t.lat},16,0,0,0,dh` : '';
  await page.goto(`https://map.naver.com/p/search/${encodeURIComponent(t.q)}${coord}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 20 && !data; i++) await page.waitForTimeout(500);
  page.off('response', onResponse);
  if (data?.result?.ncaptcha) {
    captcha = true;
    break;
  }
  if (!data) continue; // 응답을 받지 못한 검색은 저장하지 않아 다음 실행에서 다시 찾는다
  const list = data.result?.place?.list || [];
  out[t.key] = {
    q: t.q,
    total: data.result?.place?.totalCount ?? 0,
    top: list.slice(0, 5).map((p) => ({ name: p.name, cat: (p.category || []).join('>'), road: p.roadAddress || '', jibun: p.address || '', x: p.x, y: p.y })),
  };
  fs.writeFileSync(outFile, JSON.stringify(out));
  await page.waitForTimeout(800);
}
await browser.close();
console.log(`네이버 검색 ${Object.keys(out).length}건 저장${captcha ? ' · 캡차로 멈춤' : ''}`);
process.exit(captcha ? 2 : 0);
