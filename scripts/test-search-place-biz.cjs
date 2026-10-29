// 지역어 목록 동네 + 업종 검색 회귀 테스트: node scripts/test-search-place-biz.cjs
// '성수 술집'이 지역어 분기에서 업종 동의어(bizMatches)를 거치지 않고 '술집' 글자만 찾아 성수 술집 19곳 중 1곳만 나왔다(P-213)
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

// 라이브 행에서 이름·업종·주소만 옮긴 표본. 성수는 지역어 목록(FAMOUS_AREAS)에 있다
const row = (id, name, category, address) => ({ id, name, category, address, location: '', area: '' });
const sample = [
  row(1, '씰리 아페리티보', '칵테일바', '서울 성동구 성수이로 18'),
  row(2, '쏘쏘포차', '실내포장마차', '서울 성동구 성수일로 5'),
  row(3, '금호동술집', '호프,요리주점', '서울 성동구 성수이로 20'),
  row(4, '성수 디저트 카페', '카페', '서울 성동구 성수로 51'),
  row(5, '성수 갤러리', '문화시설', '서울 성동구 성수로 52'),
  row(6, '청담 와인바', '와인바', '서울 강남구 청담로 1'),
];
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: sample, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;spots=rawSpotsData;return {matchesSearchQuery};`)(...Object.values(env));
const ids = (q) => sample.filter((s) => m.matchesSearchQuery(s, q)).map((s) => s.id);

// 지역어 동네의 업종 검색은 업종 동의어로 판정하고, 띄어 친 것·붙여 친 것·'동'을 붙인 것이 같은 집합이다
assert.deepStrictEqual(ids('성수 술집'), [1, 2, 3], '성수 술집은 성수의 칵테일바·포차·호프');
for (const q of ['성수술집', '성수동술집']) assert.deepStrictEqual(ids(q), ids('성수 술집'), `${q}는 성수 술집과 같은 집합이어야 한다`);
// 카페와 동네 전체는 그대로다
assert.deepStrictEqual(ids('성수 카페'), [4], '성수 카페는 성수의 카페만');
assert.deepStrictEqual(ids('성수'), [1, 2, 3, 4, 5], '성수는 동네 전체');

console.log('test-search-place-biz: 모두 통과');
