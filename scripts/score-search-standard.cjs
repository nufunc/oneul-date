// 표준 질의 셋 점수: node scripts/score-search-standard.cjs [--verbose]
// 앱 탐색 탭 검색 경로(renderSpotDiscovery: 후보 거름 → 기본 거리순 → 관련도 등급 안정 정렬)를 src/main.ts에서 그대로 떼어 실행한다.
// 질의와 기대 결과는 scripts/search-standard-queries.json, 장소와 역 좌표는 public/data 실제 파일이다. 네트워크 호출 없음.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const start = src.indexOf('type SlotKey');
const end = src.indexOf(';\n', src.indexOf('const BIZ_SUFFIX')) + 2;
const fn = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}을 찾지 못했다`);
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};
// 인기순 동점 판정이 쓰는 유튜브 판정 구간(상수 포함)은 한 덩어리로 떼어 온다
const ytStart = src.indexOf('const DISALLOWED_YOUTUBE_KEYWORDS');
const ytEnd = src.indexOf('\n}\n', src.indexOf('function youtubeTitleNamesSpot(')) + 3;
assert.ok(ytStart >= 0 && ytEnd > ytStart, '유튜브 판정 구간을 찾지 못했다');
const extra = [src.slice(ytStart, ytEnd), ...['getDistanceKm', 'trustedRating', 'getSpotPopularityScore', 'searchRegionHead', 'searchRegionCenter', 'isNearNameMatch'].map(fn)].join('\n');
const regionCache = 'const searchRegionCenterCache = new Map(); let searchRegionCenterSource = null;';
const body = src.slice(start, end).replace(/^export /gm, '');
const js = ts
  .transpile(`let userCoords = null;\n${body}\n${regionCache}\n${extra}`, { target: 'es2022' })
  .replace(/^export \{\};/gm, '');

const all = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: all, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const names = 'isCourseEligible,deduplicateSpotList,matchesSearchQuery,searchRelevanceTier,searchStationCenter,searchRegionHead,searchRegionCenter,getDistanceKm,getSpotPopularityScore,roundDistanceForDisplay,getSpotCoordinates,isNearNameMatch';
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;return {${names}};`)(...Object.values(env));

const open = all.filter((s) => !s.is_closed);
const base = m.deduplicateSpotList(open.filter((s) => m.isCourseEligible(s)));
const cache = new Map();
const candidatesFor = (lat, lng) => {
  const key = `${lat},${lng}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      base.map((s) => {
        const real = s.lat != null && s.lng != null;
        return { ...s, _dist: real ? m.getDistanceKm(lat, lng, s.lat, s.lng) : 9999 };
      }),
    );
  }
  return cache.get(key);
};

// 모의(src 수정 없음): --sim-fuzzy=zero|union. 공백 뺀 이름이 검색어와 같은 길이에 한 글자만 다르고 그 두 글자가 초성이나 중성을 공유하면 근사 이름으로 본다
const simMode = (process.argv.find((a) => a.startsWith('--sim-fuzzy=')) || '').split('=')[1] || null;
const jamo = (ch) => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? [Math.floor(c / 588), Math.floor((c % 588) / 28)] : null;
};
const similarChar = (a, b) => {
  if (a === b) return false;
  const x = jamo(a), y = jamo(b);
  return x && y ? x[0] === y[0] || x[1] === y[1] : false;
};
const fuzzyName = (s, cq) => {
  const n = (s.name || '').replace(/\s+/g, '').toLowerCase();
  if (n.length !== cq.length) return false;
  let diff = -1;
  for (let i = 0; i < n.length; i++) {
    if (n[i] === cq[i]) continue;
    if (diff >= 0) return false;
    diff = i;
  }
  return diff >= 0 && similarChar(n[diff], cq[diff]);
};
const FUZZY_MIN = 5;

// 앱과 같은 순서: 위치 없음, 검색어가 역이나 지역이면 그 중심, 아니면 성수 기본 좌표
function search(q) {
  let c = { lat: 37.5413, lng: 127.0564 };
  const st = m.searchStationCenter(q);
  const head = st?.label ?? m.searchRegionHead(q);
  const center = st ?? (head ? m.searchRegionCenter(head) : null);
  if (head && center) c = center;
  const list = candidatesFor(c.lat, c.lng).filter((s) => m.matchesSearchQuery(s, q));
  list.sort((a, b) => {
    const ad = m.roundDistanceForDisplay(a._dist ?? 9999);
    const bd = m.roundDistanceForDisplay(b._dist ?? 9999);
    if (ad !== bd) return ad - bd;
    return m.getSpotPopularityScore(b) - m.getSpotPopularityScore(a);
  });
  const cq = q.replace(/\s+/g, '').toLowerCase();
  const fz = simMode && cq.length >= FUZZY_MIN ? candidatesFor(c.lat, c.lng).filter((s) => fuzzyName(s, cq)) : [];
  list.sort((a, b) => m.searchRelevanceTier(a, q) - m.searchRelevanceTier(b, q));
  // 앱과 같이 0건일 때만 근사 이름 판정(isNearNameMatch)을 쓴다. 정상 검색 결과가 있으면 타지 않는다
  if (list.length === 0 && m.isNearNameMatch) return candidatesFor(c.lat, c.lng).filter((s) => m.isNearNameMatch(s, q));
  if (simMode === 'zero' && list.length === 0) return fz;
  if (simMode === 'union') {
    // 이름이 검색어와 같은 장소가 먼저, 그다음 근사 이름, 그다음 나머지
    const fzIds = new Set(fz.map((s) => s.id));
    const exact = list.filter((s) => m.searchRelevanceTier(s, q) === 0);
    return [...exact, ...fz, ...list.filter((s) => !fzIds.has(s.id) && m.searchRelevanceTier(s, q) !== 0)];
  }
  return list;
}

const BIZ = { 카페: /카페|커피|디저트|베이커리|제과/, 술집: /술집|주점|바|호프|펍|이자카야|포차|맥주/, 맛집: /음식점|식당|한식|양식|일식|중식|분식|고기|구이|국밥|면|맛집|치킨|해물|횟집|뷔페/, 호텔: /호텔|숙박|리조트|펜션|게스트|스테이/ };
const judge = (s, e) => {
  if (e.rule === 'place') return e.any.some((w) => [s.address, s.area, s.location, e.withName ? s.name : ''].join(' ').includes(w));
  if (e.rule === 'place_biz') return e.any.some((w) => [s.address, s.area, s.location].join(' ').includes(w)) && BIZ[e.biz].test(`${s.category} ${s.name}`);
  if (e.rule === 'station') {
    const pts = stations[e.station];
    return s.lat != null && s.lng != null && pts.some(([la, ln]) => m.getDistanceKm(la, ln, s.lat, s.lng) <= (e.km || 1));
  }
  throw new Error(`알 수 없는 규칙 ${e.rule}`);
};

const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'search-standard-queries.json'), 'utf8'));
const verbose = process.argv.includes('--verbose');
const byType = {};
for (const item of set.queries) {
  const list = search(item.query);
  const top = list.slice(0, 3);
  if (process.argv.includes('--dump')) console.log(`DUMP\t${item.type}\t${item.query}\t${list.length}\t${top.map((s) => s.id).join(',')}`);
  let r1, r3, p3;
  if (item.expectIds) {
    // 장소 하나를 찾는 질의: 기대 id가 상위 k 안에 있는가. 같은 이름의 다른 지점은 기대 id 목록에 모두 넣었다
    r1 = top.length > 0 && item.expectIds.includes(top[0].id);
    r3 = top.some((s) => item.expectIds.includes(s.id));
    p3 = null;
  } else {
    const ok = top.map((s) => judge(s, item.expect));
    r1 = ok[0] === true;
    r3 = ok.some(Boolean);
    p3 = top.length === 3 && ok.every(Boolean);
  }
  const t = (byType[item.type] ||= { n: 0, top1: 0, top3: 0, p3: 0, p3n: 0, zero: 0, fails: [] });
  t.n++;
  t.top1 += r1;
  t.top3 += r3;
  t.zero += list.length === 0;
  if (p3 !== null) {
    t.p3n++;
    t.p3 += p3;
  }
  if (!r3 || (verbose && !r1)) t.fails.push({ q: item.query, total: list.length, top: top.map((s) => `${s.id}:${s.name}`), want: item.expectIds || item.expect });
}
const pct = (a, b) => `${((a / b) * 100).toFixed(0)}%`;
console.log('유형\t질의\t상위1\t상위3\t상위3 모두 규칙통과\t0건');
let n = 0, a1 = 0, a3 = 0;
for (const [type, t] of Object.entries(byType)) {
  console.log(`${type}\t${t.n}\t${t.top1}/${t.n} ${pct(t.top1, t.n)}\t${t.top3}/${t.n} ${pct(t.top3, t.n)}\t${t.p3n ? `${t.p3}/${t.p3n}` : '-'}\t${t.zero}`);
  n += t.n; a1 += t.top1; a3 += t.top3;
}
console.log(`전체\t${n}\t${a1}/${n} ${pct(a1, n)}\t${a3}/${n} ${pct(a3, n)}`);
for (const [type, t] of Object.entries(byType)) for (const f of t.fails) console.log(`FAIL[${type}] ${JSON.stringify(f)}`);

// 모의 잡음 측정: 열린 후보에서 고정 간격으로 뽑은 정확한 장소명 1,000개를 그대로 쳤을 때 근사 이름이 더해지는 비율
if (process.argv.includes('--fuzzy-noise')) {
  const pool = base.filter((s) => s.name.replace(/\s+/g, '').length >= FUZZY_MIN);
  const step = Math.floor(pool.length / 1000);
  const sample = pool.filter((_, i) => i % step === 0).slice(0, 1000);
  let withNeighbor = 0, total = 0, over = 0;
  for (const s of sample) {
    const cq = s.name.replace(/\s+/g, '').toLowerCase();
    const nb = base.filter((o) => o.id !== s.id && fuzzyName(o, cq));
    if (nb.length) withNeighbor++;
    total += nb.length;
    if (nb.length >= 3) over++;
  }
  console.log(`잡음 표본 ${sample.length}개: 근사 이름이 하나 이상 더해지는 질의 ${withNeighbor}개(${pct(withNeighbor, sample.length)}), 평균 ${(total / sample.length).toFixed(2)}곳, 3곳 이상 ${over}개`);
}
