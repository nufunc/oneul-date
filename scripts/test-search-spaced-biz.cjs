// 띄어 친 '동네 업종' 검색 회귀 테스트: node scripts/test-search-spaced-biz.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고, 스팟은 고정 소형 표본 행을 쓴다(P-204)
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

// 지역어 목록 밖 동네(신촌, 망원, 종로)와 목록 안 동네(홍대)의 업종 안팎 행. 동네 판정(활성 3곳 이상 주소)을 넘도록 동네마다 3행 이상 둔다
const row = (id, name, category, address) => ({ id, name, category, address, location: '', area: '' });
const sample = [
  row(1, '신촌 커피하우스', '카페', '서울 서대문구 신촌로 11'),
  row(2, '신촌 아트홀', '문화시설', '서울 서대문구 신촌로 12'),
  row(3, '신촌 실내양궁장', '스포츠', '서울 서대문구 신촌로 13'),
  row(4, '신촌 국밥', '한식', '서울 서대문구 신촌로 14'),
  row(5, '신촌 포차', '술집', '서울 서대문구 신촌로 15'),
  row(6, '망원 로스터리', '카페', '서울 마포구 망원로 21'),
  row(7, '망원 한강공원', '공원', '서울 마포구 망원로 22'),
  row(8, '망원 공간대여', '공간대여', '서울 마포구 망원로 23'),
  row(9, '종로 호프', '술집', '서울 종로구 종로 31'),
  row(10, '종로 전통주 주점', '주점', '서울 종로구 종로 32'),
  row(11, '종로 갤러리', '문화시설', '서울 종로구 종로 33'),
  row(12, '종로 커피', '카페', '서울 종로구 종로 34'),
  row(13, '홍대 디저트 카페', '카페', '서울 마포구 홍대로 41'),
  row(14, '홍대 공연장', '문화시설', '서울 마포구 홍대로 42'),
  row(15, '홍대 술집', '술집', '서울 마포구 홍대로 43'),
  row(16, '성수 디저트 카페', '디저트카페', '서울 성동구 성수로 51'),
  // 시군 이름 + 사전어(P-308): 시군은 활성 3곳 이상 주소에 나와야 지역으로 본다. 시군 밖 같은 업종 행을 함께 둔다
  row(17, '하트해변', '해수욕장', '전남 신안군 비금면 하누넘길 1'),
  row(18, '돈목해변', '해수욕장', '전남 신안군 흑산면 돈목길 2'),
  row(19, '신안 갯벌센터', '전시관', '전남 신안군 증도면 갯벌길 3'),
  row(20, '속초해변', '해수욕장', '강원 속초시 해변로 4'),
  row(21, '양양해변', '해수욕장', '강원 양양군 해변로 5'),
  row(22, '진천 자연휴양림', '휴양림', '충북 진천군 백곡면 휴양림길 6'),
  row(23, '진천 중앙공원', '공원', '충북 진천군 진천읍 공원길 7'),
  row(24, '진천 국밥', '한식', '충북 진천군 진천읍 장터길 8'),
  row(25, '담양 정원', '정원', '전남 담양군 담양읍 정원길 9'),
  row(26, '단양 도담삼봉', '관광명소', '충북 단양군 단양읍 삼봉길 10'),
  row(27, '단양 구경시장', '시장', '충북 단양군 단양읍 시장길 11'),
  row(28, '단양 만천하스카이워크', '전망대', '충북 단양군 단양읍 스카이길 12'),
];
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: sample, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;spots=rawSpotsData;return {matchesSearchQuery};`)(...Object.values(env));
const ids = (q) => sample.filter((s) => m.matchesSearchQuery(s, q)).map((s) => s.id);

// 목록 밖 동네를 띄어 친 업종 검색은 붙여 친 검색과 같은 집합이다(고치기 전에는 첫 토큰만 보고 동네 전체가 나왔다)
for (const [spaced, compact] of [['신촌 카페', '신촌카페'], ['망원 카페', '망원카페'], ['종로 술집', '종로술집']]) {
  assert.deepStrictEqual(ids(spaced), ids(compact), `${spaced}는 ${compact}와 같은 집합이어야 한다`);
}
assert.deepStrictEqual(ids('신촌 카페'), [1], '신촌 카페는 신촌의 카페만');
assert.deepStrictEqual(ids('종로 술집'), [9, 10], '종로 술집은 종로의 술집만');

// 업종어가 아닌 검색, 목록 안 동네, 업종 수식어, 띄어 친 맛집은 결과가 그대로다
assert.deepStrictEqual(ids('신촌'), [1, 2, 3, 4, 5], '신촌은 동네 전체');
assert.deepStrictEqual(ids('홍대 카페'), [6, 13], '홍대 카페는 지역어 분기 그대로(홍대 권역에 망원 포함)');
assert.deepStrictEqual(ids('디저트 카페'), [1, 6, 12, 13, 16], '디저트 카페는 사전 판정 그대로');
assert.deepStrictEqual(ids('신촌 맛집'), [1, 2, 3, 4, 5], '신촌 맛집은 앞말만으로 판정(spacedMatjip) 그대로');

// 시군 이름 뒤에 사전어를 띄어 친 검색은 그 시군 안에서만 답한다(고치기 전에는 사전어만 보고 전국 해변·공원이 나왔다)
assert.deepStrictEqual(ids('신안 바다'), [17, 18], '신안 바다는 신안의 해변만');
assert.deepStrictEqual(ids('진천 힐링'), [22, 23], '진천 힐링은 진천의 휴양림·공원만');
// 시군 안에 나머지가 맞는 곳이 없으면 0건 대신 시군 전체를 낸다
assert.deepStrictEqual(ids('단양 바다'), [26, 27, 28], '단양 바다는 맞는 곳이 없어 단양 전체');
// 앞말이 지역이 아닌 사전어이거나 사전 밖 조합이면 기존 판정 그대로다
assert.deepStrictEqual(ids('바다 전망'), [17, 18, 20, 21], '바다 전망은 사전 판정 그대로(전국 해변)');
assert.deepStrictEqual(ids('힐링 카페'), [7, 22, 23, 25], '힐링 카페는 사전 판정 그대로(전국 힐링 장소)');

console.log('test-search-spaced-biz: 모두 통과');
