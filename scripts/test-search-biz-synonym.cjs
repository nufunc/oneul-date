// 업종 동의어 판정 회귀 테스트: node scripts/test-search-biz-synonym.cjs
// '술집' 동의어 '바'가 이름의 글자(기차바위, 바이 버틀러리, 바게트, 조르바)에 걸려 업종 밖 행이 '종로 술집'에 섞였다(P-210)
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

// 라이브 행에서 이름·업종·주소만 옮긴 표본. 종로는 동네 판정(활성 3곳 이상 주소)을 넘는다
const row = (id, name, category, address) => ({ id, name, category, address, location: '', area: '' });
const sample = [
  row(1, '바 공간', '칵테일바', '서울 종로구 율곡로3길 66-4'),
  row(2, '익선포차', '실내포장마차', '서울 종로구 돈화문로11길 34'),
  row(3, '우리술집 다람쥐', '호프,요리주점', '서울 종로구 서순라길 101 1층'),
  row(4, '타이거 내추럴와인', '와인바', '서울 종로구 율곡로10길 85-5 1층'),
  row(5, '인왕산 기차바위', '바위', '서울 종로구 부암동 산 22-1'),
  row(6, '선바위', '관광지', '서울특별시 종로구 통일로18가길 26 (무악동)'),
  row(7, '예린당 바이 버틀러리', '숙박', '서울특별시 종로구 자하문로5가길 17-8'),
  row(8, '루브르바게트', '제과,베이커리', '서울 종로구 종로32길 5'),
  row(9, '정독바', '카페', '서울 종로구 율곡로3길 82'),
  row(10, '조르바', '카페', '경북 경주시 태종로 735'),
  row(11, '종로 커피', '카페', '서울 종로구 종로 34'),
];
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: sample, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;spots=rawSpotsData;return {matchesSearchQuery};`)(...Object.values(env));
const ids = (q) => sample.filter((s) => m.matchesSearchQuery(s, q)).map((s) => s.id);

// 업종이 술집인 행만 남고, 이름 글자에 '바'가 든 바위·숙박·빵집·카페는 빠진다. 포차는 업종 칸이 '실내포장마차'라 이름으로 찾는다
assert.deepStrictEqual(ids('종로 술집'), [1, 2, 3, 4], '종로 술집은 종로의 술집만');
assert.deepStrictEqual(ids('종로술집'), ids('종로 술집'), '붙여 친 종로술집도 같은 집합');
// 카페 판정은 그대로다
assert.deepStrictEqual(ids('종로 카페'), [8, 9, 10, 11], '종로 카페는 그대로(조르바는 태종로의 종로로 걸린다. 이 수정의 대상이 아니다)');

console.log('test-search-biz-synonym: 모두 통과');
