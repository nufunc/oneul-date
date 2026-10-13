// 매거진 글의 네이버 지도 검색 링크가 글이 다루는 지역과 장소를 가리키는지 검사한다.
// 괴산 글이 "군산 군강불빛공원"을 검색해 다른 곳으로 연결된 일(2026-10-14)을 다시 막으려는 검사다.
//   node scripts/check_blog_map_links.mjs              # public/blog/*/index.html 전부
//   node scripts/check_blog_map_links.mjs goesan       # 지정한 slug만
//   node scripts/check_blog_map_links.mjs --live [slug] # 네이버 지도에서 실제로 검색해 결과가 있고
//                                                       # 첫 결과 주소가 글의 시·군인지까지 본다(캡차면 종료 코드 2)
// 오류가 하나라도 있으면 종료 코드 1을 낸다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BLOG = path.join(ROOT, 'public/blog');
const PROVINCES = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|강원도|강원특별자치도|경기도|제주도|제주특별자치도)$/;

// 시·군 이름은 스팟 주소의 두 번째 낱말에서 모은다(괴산군 → 괴산, 군산시 → 군산)
function loadCityNames() {
  const spots = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/spots.json'), 'utf8'));
  const names = new Set();
  for (const s of Array.isArray(spots) ? spots : spots.spots || []) {
    const m = String(s.address || '').split(/\s+/)[1]?.match(/^(.{2,})(시|군)$/);
    if (m) names.add(m[1]);
  }
  return names;
}

const strip = (s) => s.replace(/\s+/g, '');
const visibleText = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');

export function checkPost(html, cities) {
  const text = visibleText(html);
  const flat = strip(text);
  // 글이 다루는 시·군: 본문 주소에 나오는 시·군
  const postCities = new Set();
  for (const m of text.matchAll(/(?:도|특별시|광역시|특별자치시|특별자치도)\s+(\S{2,}?)(시|군)\s/g)) postCities.add(m[1]);
  const errors = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="https:\/\/map\.naver\.com\/p\/search\/([^"]+)"/g)) {
    let q;
    try { q = decodeURIComponent(m[1]); } catch { errors.push(`디코딩 실패: ${m[1]}`); continue; }
    if (seen.has(q)) continue;
    seen.add(q);
    const tokens = q.trim().split(/\s+/);
    const core = [];
    for (const t of tokens) {
      const city = t.replace(/(시|군)$/, '');
      if (PROVINCES.test(t)) continue;
      if (cities.has(city) && tokens.length > 1) {
        if (postCities.size && !postCities.has(city)) errors.push(`"${q}": 지역 "${t}"이 글의 주소(${[...postCities].join(', ')})에 없다`);
        continue;
      }
      core.push(t);
    }
    // 검색어에는 구·동 이름 같은 보조어가 붙으므로 네 글자 이상 낱말만 본문과 대조한다
    for (const t of core) {
      if (t.length >= 4 && !/(구|동|읍|면|리)$/.test(t) && !flat.includes(t))
        errors.push(`"${q}": 낱말 "${t}"이 본문에 없다(오타나 다른 장소)`);
    }
  }
  return { errors, queries: [...seen], links: seen.size, postCities: [...postCities] };
}

// 네이버 검색 결과 판정: 결과가 없거나 첫 결과 주소가 글의 시·군 밖이면 오류다
export function judgeLive(q, res, postCities) {
  if (!res) return `"${q}": 네이버 응답을 받지 못했다`;
  if (!res.total) return `"${q}": 네이버 지도 검색 결과 0건`;
  const top = res.top[0];
  const addr = `${top.road} ${top.jibun}`;
  if (postCities.length && !postCities.some((c) => addr.includes(c)))
    return `"${q}": 첫 결과 "${top.name}"(${top.road || top.jibun})이 글의 지역(${postCities.join(', ')}) 밖이다`;
  return null;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const cities = loadCityNames();
  const picked = args.filter((a) => !a.startsWith('--'));
  const slugs = picked.length ? picked : fs.readdirSync(BLOG).filter((d) => fs.existsSync(path.join(BLOG, d, 'index.html')));
  const posts = slugs.map((slug) => ({ slug, ...checkPost(fs.readFileSync(path.join(BLOG, slug, 'index.html'), 'utf8'), cities) }));
  let captcha = false;
  if (live) {
    // 검색 결과는 OS 임시 폴더에 날짜별로 쌓아 두고, 같은 날 다시 돌리면 받은 검색어는 건너뛴다
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'blog-map-'));
    const inFile = path.join(dir, 'in.json');
    const outFile = path.join(process.env.TMPDIR || '/tmp', `blog-map-live-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(inFile, JSON.stringify(posts.flatMap((p) => p.queries.map((q) => ({ key: q, q })))));
    const r = spawnSync('npx', ['-y', '-p', 'playwright', 'node', path.join(ROOT, 'scripts/naver_place_search.mjs'), inFile, outFile], { stdio: 'inherit' });
    captcha = r.status === 2;
    const res = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
    for (const p of posts) for (const q of p.queries) {
      const e = judgeLive(q, res[q], p.postCities);
      // 실제 검색이 글의 지역 안 장소를 찾으면 본문 낱말 대조(추정)는 버린다(예: 본문 "통인시장", 검색어 "통인전통시장")
      if (e) p.errors.push(e);
      else p.errors = p.errors.filter((x) => !(x.startsWith(`"${q}":`) && x.includes('본문에 없다')));
    }
  }
  let bad = 0;
  for (const p of posts) {
    if (p.errors.length) {
      bad += p.errors.length;
      console.log(`✗ ${p.slug} (링크 ${p.links})`);
      for (const e of p.errors) console.log(`  - ${e}`);
    }
  }
  console.log(bad ? `오류 ${bad}건` : `ok ${slugs.length}편`);
  process.exit(captcha ? 2 : bad ? 1 : 0);
}
