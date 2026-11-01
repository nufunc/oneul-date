// 네이버 지도 장소 검색(P-049, P-241). 앱 링크(map.naver.com/p/search)가 왼쪽 목록으로 띄우는 pcmap 목록 문서를 직접 열고,
// 문서 안 window.__APOLLO_STATE__의 placeList에서 총 건수와 상위 5곳을 읽는다(allSearch 응답은 2026-11 이후 오지 않는다).
// 입력은 [{key, q, lng, lat}] JSON, 출력은 {key: {q, total, top}} JSON이고 이미 받은 key는 건너뛴다.
// 캡차나 접근 제한이 나오면 그 자리에서 멈추고 종료 코드 2를 낸다. playwright는 저장소 의존성이 아니므로 npx로 돌린다:
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
// 목록 항목의 roadAddress·address에는 시·군이 빠져 있어(도로명이 없는 곳의 address만 시·도부터 적힌다) commonAddress("강원 철원군 동송읍")를 앞에 붙인다
function place(p) {
  const pre = p.commonAddress || '';
  const full = (a) => (!a ? '' : a.startsWith(pre) ? a : `${pre} ${a}`.trim());
  return { name: p.name, cat: p.category || '', road: full(p.roadAddress), jibun: full(p.address), x: p.x, y: p.y };
}
// 음식점 목록(restaurant/list로 넘어간다)에는 "영업 중" 필터(filterOpening:"true")를 건 placeList가 함께 있어 필터가 걸리지 않은 목록을 고른다.
// 관광지 목록(attraction/list)의 키에는 filterCoupon:"false"처럼 빈 filter 입력이 들어 있어 값이 "", "false", false, null인 filter는 걸리지 않은 것으로 본다(P-254)
function placeList(root) {
  const key = Object.keys(root).find((k) => k.startsWith('placeList(') && !/"filter[A-Za-z]*":(?!""|"false"|false\b|null\b)/.test(k));
  return key && root[key]?.businesses;
}
for (const t of todo) {
  if (out[t.key]) continue;
  const coord = t.lng && t.lat ? `&x=${t.lng}&y=${t.lat}` : '';
  const res = await page.goto(`https://pcmap.place.naver.com/place/list?query=${encodeURIComponent(t.q)}${coord}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  if (!res) continue; // 응답을 받지 못한 검색은 저장하지 않아 다음 실행에서 다시 찾는다
  const html = await res.text().catch(() => '');
  const state = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*window\./s);
  let st = null;
  try { st = state && JSON.parse(state[1]); } catch {}
  const biz = st && placeList(st.ROOT_QUERY || {});
  // 캡차·접근 제한("과도한 접근 요청") 화면이나 목록 형식이 바뀐 문서는 placeList가 없다. 0건으로 저장하지 않고 멈춘다
  if (res.status() !== 200 || !biz) {
    console.log(`네이버 목록을 읽지 못해 멈춤: "${t.q}" HTTP ${res.status()}`);
    captcha = true;
    break;
  }
  out[t.key] = { q: t.q, total: biz.total ?? 0, top: (biz.items || []).slice(0, 5).map((r) => place(st[r.__ref] || {})) };
  fs.writeFileSync(outFile, JSON.stringify(out));
  await page.waitForTimeout(800);
}
await browser.close();
console.log(`네이버 검색 ${Object.keys(out).length}건 저장${captcha ? ' · 캡차로 멈춤' : ''}`);
process.exit(captcha ? 2 : 0);
