// 지역어 검색 코스의 앵커 범위·채움 회귀 테스트: node scripts/test-region-scope.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const slice = (head, end) => {
  const start = src.indexOf(head);
  assert.ok(start >= 0, `${head}를 찾지 못했다`);
  return src.slice(start, src.indexOf(end, start) + end.length);
};
const code = [
  slice('const DISTRICT_END', ';\n'),
  slice('const FAMOUS_AREAS', '];\n'),
  ...['pickRandom<T>', 'getDistanceKm', 'spotArea', 'spotSido', 'pickNearRandom', 'placeScopeOf'].map((n) => slice(`function ${n}(`, '\n}\n')),
].join('\n');
const { pickNearRandom, placeScopeOf } = new Function(
  `${ts.transpile(code, { target: 'es2022' })};return { pickNearRandom, placeScopeOf };`,
)();

const spot = (name, address, lat, lng, region = '영남') => ({
  name, address, area: address.split(' ')[1], location: '', lat, lng, region,
});
// 울산 북구 앵커. 10km 안에는 후보가 없고, 대구 북구(약 90km)와 울산 남구(약 12km)만 있다
const ulsanBukgu = spot('울산 북구 카페', '울산 북구 화봉동 1', 35.5826, 129.3613);
const daeguBukgu = spot('대구 칠성야시장', '대구 북구 칠성동 1', 35.8857, 128.5828);
const ulsanNamgu = spot('울산 남구 식당', '울산광역시 남구 삼산동 1', 35.5384, 129.3381);
const tongyeong = spot('울산다찌', '경남 통영시 항남동 1', 34.8448, 128.4237);

const first = () => 0;
assert.strictEqual(
  pickNearRandom([daeguBukgu, ulsanNamgu], ulsanBukgu, first),
  ulsanNamgu,
  '울산 북구 앵커에 같은 이름의 대구 북구를 붙이지 않는다',
);

const scope = placeScopeOf('울산');
assert.strictEqual(scope(ulsanNamgu), true, '주소가 울산광역시로 시작하면 울산 범위 안이다');
assert.strictEqual(scope(tongyeong), false, '이름에만 울산이 든 통영 스팟은 울산 범위 밖이다(앵커 후보가 아니다)');
assert.strictEqual(placeScopeOf('카페'), null, '지역어가 아닌 검색은 범위를 두지 않는다');
assert.strictEqual(placeScopeOf('울산 카페'), null, '두 단어 검색은 범위를 두지 않는다');
assert.strictEqual(placeScopeOf('북구')(daeguBukgu), true, '구 검색어는 주소 단어로 범위를 정한다');

// 10km 안 후보가 없을 때 넓은 폴백은 검색 지역 안을 먼저 쓴다(통영이 더 가까워도 울산을 고른다)
const ulju = spot('울주 식당', '울산 울주군 상북면 1', 35.5650, 129.0430);
const yangsan = spot('양산 식당', '경남 양산시 물금읍 1', 35.3100, 129.0100);
assert.strictEqual(pickNearRandom([yangsan, ulju], ulsanBukgu, first, scope), ulju, '지역어 검색 폴백은 검색 지역 안을 고른다');
assert.strictEqual(pickNearRandom([yangsan], ulsanBukgu, first, scope), yangsan, '검색 지역 안 후보가 없으면 종전 폴백을 쓴다');
console.log('test-region-scope: 모두 통과');
