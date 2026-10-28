// 붙여 친 '동네+업종'에서 동·역 등을 뗀 한 글자 동네 회귀 테스트: node scripts/test-search-one-char-head.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고, 스팟은 고정 소형 표본 행을 쓴다(P-207)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const start = src.indexOf('type SlotKey');
const end = src.indexOf(';\n', src.indexOf('const BIZ_SUFFIX')) + 2;
assert.ok(start >= 0 && end > start, '떼어 낼 구간을 찾지 못했다');
const js = ts.transpile(src.slice(start, end).replace(/^export /gm, ''), { target: 'es2022' }).replace(/^export \{\};/gm, '');

// 명동(동 앞이 한 글자)과 익선동(동 앞이 두 글자)의 업종 안팎 행, 주소나 이름에 '명'만 든 다른 지역 카페.
// 동네 판정(활성 3곳 이상 주소)을 넘도록 동네마다 3행 이상 둔다
const row = (id, name, category, address) => ({ id, name, category, address, location: '', area: '' });
const sample = [
  row(1, '명동 커피', '카페', '서울 중구 명동길 11'),
  row(2, '명동 디저트', '디저트카페', '서울 중구 명동8길 12'),
  row(3, '명동 교자', '한식', '서울 중구 명동10길 13'),
  row(4, '명동 호프', '술집', '서울 중구 명동길 14'),
  row(5, '광명 로스터리', '카페', '경기 광명시 범안로 21'),
  row(6, '명륜 찻집', '카페', '충북 제천시 명륜로 22'),
  row(7, '유명로 카페', '카페', '경기 가평군 설악면 유명로 23'),
  row(8, '명장 베이커리', '제과,베이커리', '경기 고양시 일산서구 덕이로 24'),
  row(9, '익선 커피', '카페', '서울 종로구 익선동 31'),
  row(10, '익선 한옥', '한식', '서울 종로구 익선동 32'),
  row(11, '익선 술집', '술집', '서울 종로구 익선동 33'),
];
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: sample, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;spots=rawSpotsData;return {matchesSearchQuery};`)(...Object.values(env));
const ids = (q) => sample.filter((s) => m.matchesSearchQuery(s, q)).map((s) => s.id);

// '명동카페'는 '동'을 뗀 '명' 한 글자로 주소를 보지 않는다(고치기 전에는 광명시·명륜로·유명로·이름의 '명'이 걸렸다)
assert.deepStrictEqual(ids('명동카페'), [1, 2], '명동카페는 명동의 카페만');
assert.deepStrictEqual(ids('명동술집'), [4], '명동술집은 명동의 술집만');

// 두 글자 동네, 업종 없는 동네 검색, 업종만 친 검색은 그대로다
assert.deepStrictEqual(ids('익선동카페'), [9], '익선동카페는 익선동의 카페만');
assert.deepStrictEqual(ids('명동'), [1, 2, 3, 4], '명동은 동네 전체');
assert.deepStrictEqual(ids('카페'), [1, 2, 5, 6, 7, 8, 9], '카페는 사전 판정 그대로');

console.log('test-search-one-char-head: 모두 통과');
