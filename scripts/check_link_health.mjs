// 사용자에게 보이는 외부 링크의 깨짐 비율과 수집기 단계 실행 여부를 한 번에 재는 점검이다(P-509).
// 사용자가 직접 눌러 보지 않아도 깨진 링크와 출력 없이 끝나는 수집기 단계를 알 수 있게 하려고 만들었다.
//   node scripts/check_link_health.mjs                          # 배포된 권역 장소 파일 표본 링크 점검만
//   node scripts/check_link_health.mjs --collector opc@HOST     # 수집기 로그 단계 요약까지(ssh)
//   node scripts/check_link_health.mjs --naver 30                # 네이버 지도 검색 표본까지(playwright)
//   node scripts/check_link_health.mjs --spots public/data/spots.json --sample 40 --max-rate 0.05
// 앱 링크 함수를 src/main.ts에서 떼어 쓰므로 npm ci로 typescript가 있어야 한다.
// 기준을 넘으면 종료 코드 1, 측정 자체가 안 되면 2. 마지막 줄은 JSON 한 줄이다.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
// URL이 /로 끝나면 배포된 권역 파일 폴더(index.json과 <권역>.cols.json)다. 단일 spots.json은 배포하지 않는다(P-513)
const SPOTS = opt('spots', 'https://nufunc.github.io/oneul-date/data/spots/');
const SAMPLE = Number(opt('sample', '40'));
const KAKAO_PANEL_LIMIT = Math.min(Number(opt('kakao-sample', '40')), 50); // 카카오 한도는 수집기와 공유라 50회 이하
const MAX_RATE = Number(opt('max-rate', '0.05')); // 표본 종류별 깨짐 비율 상한
const MAX_STATIC = Number(opt('max-static', '20')); // 정적 판정으로 깨지는 링크 수 상한(2026-11-19 측정 13건·2건 위에 둔다)
const COLLECTOR = opt('collector', '');
const NAVER = Number(opt('naver', '0')); // 네이버 지도 검색 표본 수. 0이면 건너뛴다(playwright 필요)
const NAVER_MAX_RATE = Number(opt('naver-max-rate', '0.2'));
const SINCE_HOURS = Number(opt('since-hours', '26'));
const SEED = Number(opt('seed', String(Math.floor(Date.now() / 86400000))));

// 같은 날에는 같은 표본이 나오게 시드 난수를 쓴다
let seed = SEED >>> 0 || 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const sample = (arr, n) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (k < items.length) {
      const i = k++;
      out[i] = await fn(items[i]);
      await sleep(150);
    }
  }));
  return out;
}
async function get(url, init = {}, readBody = true) {
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init });
    const body = readBody ? await r.text().catch(() => '') : '';
    return { status: r.status, location: r.headers.get('location') || '', body };
  } catch (e) {
    return { status: 0, location: '', body: String(e.message || e) };
  }
}

async function loadSpots() {
  const getJson = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  };
  if (/^https?:.*\/$/.test(SPOTS)) {
    // 권역 열 형식 파일({칸: 값 배열})을 행으로 되돌린다(src/supabase.ts rowsFromColumns와 같다)
    const { files } = await getJson(`${SPOTS}index.json`);
    const parts = await Promise.all(Object.keys(files).map((n) => getJson(`${SPOTS}${n}.cols.json`)));
    return parts.flatMap((c) => c.id.map((_, i) => Object.fromEntries(Object.keys(c).map((k) => [k, c[k][i]]))));
  }
  if (/^https?:/.test(SPOTS)) return getJson(SPOTS);
  return JSON.parse(fs.readFileSync(SPOTS, 'utf8'));
}

// 앱이 실제로 만드는 링크를 재려고 src/main.ts의 링크 함수를 그대로 떼어 변환해 쓴다(scripts/test-kakaomap-url.cjs와 같은 방식).
// 정의되지 않은 이름이 나오면 그 함수나 상수를 더 떼어 온다
function loadAppLinkFns(spots) {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const src = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const piece = (n) => {
    let i = src.search(new RegExp(`\\nfunction ${n}\\(`));
    if (i >= 0) return src.slice(i + 1, src.indexOf('\n}\n', i + 1) + 3);
    i = src.search(new RegExp(`\\nconst ${n}[: =]`));
    if (i < 0) throw new Error(`src/main.ts에서 ${n}을 찾지 못했다`);
    const line = src.slice(i + 1, src.indexOf('\n', i + 1));
    const open = line.trim().slice(-1);
    const close = { '{': '}', '[': ']', '(': ')' }[open];
    return close ? src.slice(i + 1, src.indexOf(`\n${close}`, i + 1) + 3) : line + '\n';
  };
  const names = ['mapQuery', 'naverMapUrl', 'getKakaomapUrl', 'kakaoNaviUrl'];
  for (let tries = 0; tries < 30; tries++) {
    try {
      const js = ts.transpile(names.map(piece).join('\n'), { target: 'es2022' });
      const fns = new Function(`${js};return { mapQuery, naverMapUrl, getKakaomapUrl, kakaoNaviUrl };`)();
      for (const s of spots) Object.values(fns).forEach((f) => f(s)); // 모든 행에 한 번씩 돌려 빠진 이름을 찾는다
      return fns;
    } catch (e) {
      const m = String(e.message).match(/^(\w+) is not defined/);
      if (!m) throw e;
      names.unshift(m[1]);
    }
  }
  throw new Error('src/main.ts 링크 함수의 의존 이름이 30개를 넘는다');
}
let app;
const norm = (t) => String(t || '').replace(/\(.*?\)/g, '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
function sameName(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const grams = (t) => new Set(Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2)));
  const gx = grams(x), gy = grams(y);
  const inter = [...gx].filter((g) => gy.has(g)).length;
  return inter / Math.min(gx.size, gy.size) >= 0.5;
}

// 종류별 깨짐 판정. broken은 상한 계산에 넣고, suspect는 표에만 남긴다
const CHECKS = {
  // 카카오 장소 페이지(💛 카카오 단추): 패널 API가 404 code NONE이면 "카카오맵에 존재하지 않는 장소"다
  kakao_place: async (s) => {
    const id = s.social_links.kakaomap.url.match(/place\.map\.kakao\.com\/(\d+)/)[1];
    const r = await get(`https://place-api.map.kakao.com/places/panel3/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', pf: 'web', Referer: 'https://map.kakao.com/' },
    });
    if (r.status === 404) return { verdict: 'broken', note: '존재하지 않는 장소(404)' };
    if (r.status !== 200) return { verdict: 'error', note: `HTTP ${r.status}` };
    let sm = {};
    try { sm = JSON.parse(r.body).summary || {}; } catch { return { verdict: 'error', note: 'JSON 아님' }; }
    if (sm.status && sm.status !== 'Y') return { verdict: 'suspect', note: `패널 status=${sm.status} ${sm.name || ''}` };
    if (!sameName(s.name, sm.name)) return { verdict: 'suspect', note: `다른 이름: ${sm.name}` };
    return { verdict: 'ok' };
  },
  // 유튜브(▶️ 단추): oEmbed가 400·404면 없는 영상, 401·403은 비공개나 퍼가기 금지라 suspect
  youtube: async (s) => {
    const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(s.social_links.youtube.url)}`);
    if (r.status === 400 || r.status === 404) return { verdict: 'broken', note: `oEmbed ${r.status}` };
    if (r.status === 401 || r.status === 403) return { verdict: 'suspect', note: `oEmbed ${r.status}(비공개 또는 퍼가기 금지)` };
    if (r.status !== 200) return { verdict: 'error', note: `HTTP ${r.status}` };
    return { verdict: 'ok' };
  },
  // 카카오 좌표 핀(장소 id가 없는 행의 💛 카카오 단추): 404 페이지나 핀 없는 첫 화면으로 보내면 깨짐
  kakao_map_pin: async (s) => kakaoRedirect(app.getKakaomapUrl(s), /[?&]urlX=/),
  // 카카오 길찾기(🧭 길찾기 단추): 도착지(rt2) 없이 첫 화면으로 보내면 깨짐
  kakao_navi: async (s) => kakaoRedirect(app.kakaoNaviUrl(s), /[?&]rt2=[^&]/),
};
async function kakaoRedirect(url, okPattern) {
  const r = await get(url, {}, false);
  if (r.status === 0) return { verdict: 'error', note: r.body.slice(0, 60) };
  if (/404/.test(r.location) || r.status >= 400) return { verdict: 'broken', note: `→ ${r.location || r.status}` };
  if (!okPattern.test(r.location)) return { verdict: 'broken', note: `→ ${r.location}` };
  return { verdict: 'ok' };
}

async function checkLinks(spots) {
  const open = spots.filter((s) => !s.is_closed);
  const hasCoord = (s) => typeof s.lat === 'number' && typeof s.lng === 'number';
  const km = (s) => s.social_links?.kakaomap?.url || '';
  const pop = {
    kakao_place: open.filter((s) => /place\.map\.kakao\.com\/\d+/.test(km(s))),
    youtube: open.filter((s) => /youtube\.com\/watch\?v=|youtu\.be\//.test(s.social_links?.youtube?.url || '')),
    kakao_map_pin: open.filter((s) => !/place\.map\.kakao\.com\//.test(km(s)) && hasCoord(s)),
    kakao_navi: open.filter(hasCoord),
  };
  const sizes = { kakao_place: KAKAO_PANEL_LIMIT, youtube: SAMPLE, kakao_map_pin: Math.ceil(SAMPLE / 2), kakao_navi: Math.ceil(SAMPLE / 2) };
  const kinds = {};
  const brokenRows = [];
  for (const [kind, rows] of Object.entries(pop)) {
    const picked = sample(rows, sizes[kind]);
    const res = await pool(picked, 3, CHECKS[kind]);
    const c = { population: rows.length, sampled: picked.length, ok: 0, broken: 0, suspect: 0, error: 0 };
    res.forEach((r, i) => {
      c[r.verdict]++;
      if (r.verdict !== 'ok') brokenRows.push({ kind, verdict: r.verdict, id: picked[i].id, name: picked[i].name, note: r.note });
    });
    const judged = c.sampled - c.error;
    c.broken_rate = judged ? +(c.broken / judged).toFixed(3) : null;
    kinds[kind] = c;
  }
  if (NAVER > 0) {
    const rows = open.filter((s) => hasCoord(s) && app.naverMapUrl(s).startsWith('https://map.naver.com/p/search/'));
    const picked = sample(rows, NAVER);
    const c = { population: rows.length, sampled: picked.length, ok: 0, broken: 0, suspect: 0, error: 0 };
    const res = searchNaver(picked);
    picked.forEach((s) => {
      const r = res[String(s.id)];
      let v = { verdict: 'ok' };
      if (!r) v = { verdict: 'error', note: '응답 없음(캡차 또는 시간 초과)' };
      else if (!r.total) v = { verdict: 'broken', note: `검색 결과 0건: ${r.q}` };
      else if (!r.top.some((p) => sameName(s.name, p.name))) v = { verdict: 'suspect', note: `상위 5곳에 없음: ${r.q} → ${r.top[0].name}` };
      c[v.verdict]++;
      if (v.verdict !== 'ok') brokenRows.push({ kind: 'naver_search', id: s.id, name: s.name, ...v });
    });
    const judged = c.sampled - c.error;
    c.broken_rate = judged ? +(c.broken / judged).toFixed(3) : null;
    kinds.naver_search = c;
  }
  // 정적 판정: 표본에 잘 안 걸리지만 규칙으로 깨짐이 확실한 링크는 전수로 센다
  // 이름 칸(link/to/<이름>,위도,경도)에 %2C나 %2F가 남으면 카카오가 구분자로 읽어 404나 도착지 없는 첫 화면으로 보낸다
  const navComma = open.filter((s) => /%2C|%2F/i.test(app.kakaoNaviUrl(s).split('/link/to/')[1]?.split(',')[0] || ''));
  const instaNotProfile = open.filter((s) => /instagram\.com\/(search|explore|p)\//.test(s.source?.url || '') && !s.social_links?.instagram);
  const staticBroken = {
    kakao_navi_comma_slash: navComma.map((s) => ({ id: s.id, name: s.name })),
    // "📸 인스타 공식 피드" 단추가 프로필이 아닌 태그 검색·게시물을 연다
    instagram_not_profile: instaNotProfile.map((s) => ({ id: s.id, name: s.name, url: s.source.url })),
  };
  return { kinds, brokenRows, staticBroken };
}

// 🗺️ 지도 단추(naverMapUrl)는 네이버 지도 검색 페이지라 HTTP 상태로는 판정할 수 없다. 앱 검색어와 좌표로 실제 검색해 결과 수를 본다
function searchNaver(spots) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-health-'));
  const inFile = path.join(dir, 'in.json'), outFile = path.join(dir, 'out.json');
  fs.writeFileSync(inFile, JSON.stringify(spots.map((s) => ({ key: String(s.id), q: app.mapQuery(s), lng: s.lng, lat: s.lat }))));
  const script = new URL('./naver_place_search.mjs', import.meta.url).pathname;
  spawnSync('node', [script, inFile, outFile], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 600000 });
  return fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
}

// 수집기 로그에서 단계별 마지막 두 번의 실행을 찾는다. 단계 구간은 "▶ N단계" 줄부터 다음 "▶"나 "💤" 줄 앞까지다
const STAGE_RESULT = /완료|자동 병합|반영|쓸 행|등록/;
function summarizeCollector(text, sinceHours) {
  const lines = text.split('\n');
  const ts = (l) => (l.match(/^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\]/) || [])[1];
  const now = Date.now();
  const toMs = (t) => Date.parse(t.replace(' ', 'T') + '+09:00'); // 수집기 로그 시각은 KST
  const runs = [];
  let cur = null;
  const close = (endTs) => {
    if (!cur) return;
    cur.end = endTs || cur.lastTs;
    const body = cur.body.join('\n');
    cur.status = /\[ERROR\]|Traceback|오류/.test(body) ? 'error' : STAGE_RESULT.test(body) ? 'ok' : 'silent';
    cur.result = (cur.body.filter((l) => STAGE_RESULT.test(l)).pop() || '').replace(/^\[[^\]]+\]\s*\[\w+\]\s*/, '').trim().slice(0, 110);
    delete cur.body;
    runs.push(cur);
    cur = null;
  };
  for (const l of lines) {
    const t = ts(l);
    if (/▶ \d+단계/.test(l) || /💤/.test(l)) close(t);
    const m = l.match(/▶ (\d+)단계/);
    if (m) cur = { stage: Number(m[1]), start: t, lastTs: t, body: [] };
    else if (cur) {
      cur.body.push(l);
      if (t) cur.lastTs = t;
    }
  }
  close();
  const recent = runs.filter((r) => r.start && now - toMs(r.start) <= sinceHours * 3600e3);
  const stages = [...new Set(runs.map((r) => r.stage))].sort((a, b) => a - b);
  const perStage = stages.map((n) => {
    const all = runs.filter((r) => r.stage === n);
    const inWindow = recent.filter((r) => r.stage === n);
    return {
      stage: n,
      runs_in_window: inWindow.length,
      ok_in_window: inWindow.filter((r) => r.status === 'ok').length,
      last_two: all.slice(-2),
    };
  });
  return { perStage, window_hours: sinceHours };
}

function readCollectorLog(target) {
  // docker logs는 컨테이너 재시작 때 비워지므로 볼륨의 누적 로그 끝부분을 읽는다(읽기만 한다)
  const cmd = "docker exec oneul-collector tail -n 30000 /mnt/data/logs/collector.log | grep -E '▶ [0-9]+단계|💤|완료|자동 병합|반영|쓸 행|등록|ERROR|Traceback|오류' | grep -v '소셜 마이닝 중'";
  const r = spawnSync('ssh', ['-o', 'ConnectTimeout=20', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', target, cmd], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ssh 실패(${r.status}): ${(r.stderr || '').trim().slice(0, 200)}`);
  return r.stdout;
}

const pad = (v, n) => String(v ?? '').padEnd(n);
async function main() {
  const failures = [];
  const report = { checked_at: new Date().toISOString(), spots: SPOTS, seed: SEED };
  const raw = await loadSpots();
  const spots = Array.isArray(raw) ? raw : raw.spots;
  app = loadAppLinkFns(spots);
  const { kinds, brokenRows, staticBroken } = await checkLinks(spots);
  report.links = kinds;
  report.static = Object.fromEntries(Object.entries(staticBroken).map(([k, v]) => [k, v.length]));

  console.log('## 표본 링크 점검');
  console.log(`${pad('종류', 15)}${pad('모집단', 8)}${pad('표본', 6)}${pad('정상', 6)}${pad('깨짐', 6)}${pad('의심', 6)}${pad('측정실패', 9)}깨짐 비율`);
  for (const [k, c] of Object.entries(kinds)) {
    console.log(`${pad(k, 15)}${pad(c.population, 8)}${pad(c.sampled, 6)}${pad(c.ok, 6)}${pad(c.broken, 6)}${pad(c.suspect, 6)}${pad(c.error, 9)}${c.broken_rate}`);
    const cap = k === 'naver_search' ? NAVER_MAX_RATE : MAX_RATE;
    if (c.broken_rate !== null && c.broken_rate > cap) failures.push(`${k} 깨짐 비율 ${c.broken_rate} > ${cap}`);
    // 네이버는 캡차가 실행 환경 IP에 따라 나오므로 측정 실패를 기준 초과로 세지 않고 표에만 남긴다
    if (k !== 'naver_search' && c.sampled && c.error > c.sampled / 2) failures.push(`${k} 측정 실패 ${c.error}/${c.sampled}`);
  }
  if (brokenRows.length) {
    console.log('\n## 깨짐·의심 표본');
    for (const r of brokenRows) console.log(`- [${r.kind}] ${r.verdict} id=${r.id} ${r.name} · ${r.note}`);
  }
  console.log('\n## 정적 판정(전수)');
  for (const [k, v] of Object.entries(staticBroken)) {
    console.log(`- ${k}: ${v.length}건${v.length ? ' · ' + v.slice(0, 5).map((s) => s.name).join(', ') : ''}`);
    if (v.length > MAX_STATIC) failures.push(`${k} ${v.length}건 > ${MAX_STATIC}`);
  }

  if (COLLECTOR) {
    try {
      const sum = summarizeCollector(readCollectorLog(COLLECTOR), SINCE_HOURS);
      report.collector = sum.perStage.map((s) => ({ stage: s.stage, runs: s.runs_in_window, ok: s.ok_in_window, last: s.last_two.at(-1)?.status }));
      console.log(`\n## 수집기 단계(최근 ${SINCE_HOURS}시간, 시각 KST)`);
      console.log(`${pad('단계', 5)}${pad('실행', 5)}${pad('정상', 5)}마지막 두 번(시작~끝 상태 · 결과 줄)`);
      for (const s of sum.perStage) {
        const last = s.last_two.map((r) => `${r.start.slice(5, 16)}~${(r.end || '').slice(11, 16)} ${r.status} · ${r.result || '(결과 줄 없음)'}`);
        console.log(`${pad(s.stage, 5)}${pad(s.runs_in_window, 5)}${pad(s.ok_in_window, 5)}${last.join('\n               ')}`);
        if (s.runs_in_window === 0) failures.push(`수집기 ${s.stage}단계가 ${SINCE_HOURS}시간 안에 시작하지 않음`);
        else if (s.ok_in_window === 0) failures.push(`수집기 ${s.stage}단계가 ${SINCE_HOURS}시간 안에 결과 줄 없이 끝남(${s.last_two.at(-1).status})`);
      }
    } catch (e) {
      failures.push(`수집기 로그 읽기 실패: ${e.message}`);
    }
  }

  report.failures = failures;
  report.ok = failures.length === 0;
  console.log(`\n## 판정: ${report.ok ? '통과' : '기준 초과'}`);
  for (const f of failures) console.log(`- ${f}`);
  console.log(JSON.stringify(report));
  process.exit(report.ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  console.log(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(2);
});
