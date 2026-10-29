// 동네 존 넓힘 회귀 테스트: node scripts/test-search-place-zone-area.cjs
// '서촌'의 존(종로구·중구)으로 넓히면 '서촌 술집'에 명동·을지로의 중구 행이 섞였다(P-216)
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

const row = (id, name, category, area, address) => ({ id, name, category, address, location: '', area });
const sample = [
  row(1, '서촌 와인바', '와인바', '종로구', '서울 종로구 자하문로 1'),
  row(2, '서촌 계단포차', '실내포장마차', '종로구', '서울 종로구 필운대로 2'),
  row(3, '체부동 호프', '호프,요리주점', '종로구', '서울 종로구 사직로 3'),
  row(4, '명동 칵테일바', '칵테일바', '중구', '서울 중구 명동길 4'),
  row(5, '을지로 포차', '실내포장마차', '중구', '서울 중구 을지로 5'),
];
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: sample, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;spots=rawSpotsData;return {matchesSearchQuery};`)(...Object.values(env));
const ids = (q) => sample.filter((s) => m.matchesSearchQuery(s, q)).map((s) => s.id);

// 존으로만 드는 행은 서촌 글자 행의 주된 area(종로구)일 때만 남는다
assert.deepStrictEqual(ids('서촌 술집'), [1, 2, 3], '서촌 술집은 종로구 술집만');
console.log('test-search-place-zone-area: ok');
