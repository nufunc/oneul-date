// 코스 지역 이름 회귀 테스트: node scripts/test-course-area-label.cjs (P-350)
// courseAreaLabel과 spotSigunguLabel을 src/main.ts에서 떼어 실행한다. 존 > 한 시·군·구 > 시·군 둘 > 선택한 지역 라벨 순서를 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const code = [
  cut('function spotSido', '\n}\n'),
  cut('function spotSigunguLabel', '\n}\n'),
  cut('function courseAreaLabel', '\n}\n'),
].join('\n');

const POPULAR_ZONES = [{ key: 'seongsu', label: '성수·건대' }];
const REGIONS = [
  { key: 'CHUNGCHEONG', label: '충청' },
  { key: 'YEONGNAM', label: '영남' },
];
const stubs = {
  POPULAR_ZONES,
  matchesZone: (spot, keys) => keys.includes('seongsu') && /성동구|광진구/.test(spot.address),
  regionsLabel: (regions, zones) => (zones.length > 0 ? zones.map((k) => POPULAR_ZONES.find((z) => z.key === k).label).join('·') : regions.map((k) => REGIONS.find((r) => r.key === k).label).join('·')),
};
const { courseAreaLabel } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { courseAreaLabel };`,
)(...Object.values(stubs));

const at = (...addresses) => addresses.map((address) => ({ address }));
const label = (addresses, regions = [], zones = []) => courseAreaLabel(at(...addresses), regions, zones);

// 1) 모든 장소가 든 존이 있으면 존 이름
assert.strictEqual(label(['서울 성동구 아차산로 1', '서울 광진구 능동로 2']), '성수·건대');
assert.strictEqual(label(['서울 성동구 아차산로 1'], ['SEOUL'], ['seongsu']), '성수·건대');
// 2) 존이 없고 모든 장소가 같은 시·군·구면 그 이름: 시는 '시'를 떼고, 군은 그대로, 광역시의 구는 시 이름을 앞에 붙인다
assert.strictEqual(label(['충북 충주시 목벌동 1', '충청북도 충주시 목벌안길 26', '충북 충주시 소태면 3'], ['CHUNGCHEONG']), '충주');
assert.strictEqual(label(['경북 영덕군 영덕읍 3', '경상북도 영덕군 강구면 411'], ['YEONGNAM']), '영덕군');
assert.strictEqual(label(['울산 남구 대공원로 138-1', '울산광역시 남구 달삼로23번길 8'], ['YEONGNAM']), '울산 남구');
assert.strictEqual(label(['강원특별자치도 속초시 중앙로 1', '강원 속초시 영랑해안길 2']), '속초');
assert.strictEqual(label(['경기 수원시 권선구 호매실로 70', '경기 수원시 팔달구 창룡대로 15']), '수원');
// 같은 이름의 구는 시가 다르면 다른 곳이다
assert.strictEqual(label(['울산 중구 신기9길 45', '대전 중구 중앙로 1'], ['YEONGNAM']), '영남');
// 3) 시·군이 둘이면 A·B. 광역시의 구가 끼면 쓰지 않는다
assert.strictEqual(label(['경기 포천시 신북면 1', '경기 남양주시 별내동 2'], ['GYEONGGI']), '포천·남양주');
assert.strictEqual(courseAreaLabel(at('울산 남구 대공원로 1', '울산 중구 태화동 2'), ['YEONGNAM'], []), '영남');
// 시·군이 셋이거나 정하지 못한 장소가 섞이면 선택한 지역 라벨, 선택도 없으면 빈 이름
assert.strictEqual(label(['충북 충주시 1', '충북 제천시 2', '충북 단양군 3'], ['CHUNGCHEONG']), '충청');
assert.strictEqual(label(['충북 충주시 1', '세종 도움3로 105-6'], ['CHUNGCHEONG']), '충청');
assert.strictEqual(label(['충북 충주시 1', '충북 제천시 2', '충북 단양군 3']), '');
assert.strictEqual(courseAreaLabel([], ['YEONGNAM'], []), '영남');
assert.strictEqual(courseAreaLabel([], [], []), '');

console.log('test-course-area-label: ok');
