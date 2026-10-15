// 내연산·장가계 검색 동의어 테스트: node scripts/test-search-naeyeonsan.cjs
// 판정 함수를 src/main.ts에서 떼어 TypeScript로 변환해 실행한다. 새 두 행은 동기화 전이라 spots.json에 없을 수 있어 같은 필드로 직접 만든다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const start = src.indexOf('type SlotKey');
const bizMatches = src.indexOf('function bizMatches(');
const end = src.indexOf(';\n', src.indexOf('const BIZ_SUFFIX')) + 2;
assert.ok(start >= 0 && bizMatches > start && end > bizMatches, '떼어 낼 구간을 찾지 못했다');
const js = ts.transpile(src.slice(start, end).replace(/^export /gm, ''), { target: 'es2022' }).replace(/^export \{\};/gm, '');

const all = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: all, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;return {matchesSearchQuery};`)(...Object.values(env));

const pohang = { region: '영남', area: '포항시', location: '영남 포항시' };
const falls = { ...pohang, name: '내연산 12폭포', category: '관광지', address: '경상북도 포항시 북구 송라면 보경로 53' };
const view = { ...pohang, name: '소금강 전망대', category: '전망대', address: '경북 포항시 북구 송라면 중산리 산 101-1' };
const bogyeong = all.find((s) => s.name === '보경사' && !s.is_closed);
const park = all.find((s) => s.name === '내연산 보경사 시립공원' && !s.is_closed);
const iryeongdae = { ...pohang, name: '영일대 해상누각', category: '관광지', address: '경북 포항시 북구 두호동 685-1' };
assert.ok(bogyeong && park, 'spots.json에서 보경사 두 행을 찾지 못했다');

for (const q of ['내연산', '포항 내연산']) {
  for (const s of [falls, view, bogyeong, park]) assert.strictEqual(m.matchesSearchQuery(s, q), true, `${q} -> ${s.name}`);
  assert.strictEqual(m.matchesSearchQuery(iryeongdae, q), false, `${q}는 영일대에 걸리지 않는다`);
}
for (const q of ['장가계', '포항 장가계']) {
  for (const s of [falls, view, park]) assert.strictEqual(m.matchesSearchQuery(s, q), true, `${q} -> ${s.name}`);
  assert.strictEqual(m.matchesSearchQuery(iryeongdae, q), false, `${q}는 영일대에 걸리지 않는다`);
}
// 지역어가 붙으면 그 지역 안에서만 본다
assert.strictEqual(m.matchesSearchQuery({ ...falls, area: '서울', location: '수도권 서울', address: '서울 중구' }, '포항 장가계'), false);
// 기존 동의어 동작은 그대로다
assert.strictEqual(m.matchesSearchQuery({ name: '스파 포레', category: '스파' }, '스파'), true);
assert.strictEqual(m.matchesSearchQuery({ name: '스파게티 집', category: '양식' }, '스파'), false);
console.log('test-search-naeyeonsan ok');
