// 역 이름 검색 회귀 테스트: node scripts/test-station-search.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고, 역 좌표(public/data/stations.json)와 스팟(public/data/spots.json)을 실제 파일로 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const slice = (head, end) => {
  const start = src.indexOf(head);
  assert.ok(start >= 0, `${head}를 찾지 못했다`);
  return src.slice(start, src.indexOf(end, start) + end.length);
};
const code = [
  slice('const STATION_RADIUS_KM', ';\n'),
  ...['getDistanceKm', 'matchStationQuery', 'isNearStation'].map((n) => slice(`function ${n}(`, '\n}\n')),
].join('\n');

const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const spots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8')).filter((s) => !s.is_closed);
// 주소 낱말 판정은 앱과 같은 기준(열린 스팟 3곳 이상의 주소·지역에 나오는 말)이다
const isPlaceHead = (head) =>
  head.length >= 2 && spots.filter((s) => `${s.location || ''} ${s.area || ''} ${s.address || ''}`.toLowerCase().includes(head)).length >= 3;
const { matchStationQuery, isNearStation } = new Function(
  'stationCoords',
  'isPlaceHead',
  `${ts.transpile(code, { target: 'es2022' })};return { matchStationQuery, isNearStation };`,
)(stations, isPlaceHead);

const hits = (q) => {
  const st = matchStationQuery(q);
  return st ? spots.filter((s) => isNearStation(s, st.points)).length : 0;
};

assert.ok(hits('건대입구') > 0, '건대입구는 역 반경으로 걸린다');
assert.ok(hits('건대입구역') > 0, '건대입구역은 역 반경으로 걸린다');
assert.ok(hits('신촌역') > 0, '신촌역은 역 반경으로 걸린다');
assert.ok(hits('신촌 역') > 0, '띄어 쓴 신촌 역도 걸린다');
assert.ok(hits('성수역') > 0, '성수역은 역 반경으로 걸린다(기존 결과에 더하는 합집합)');
assert.strictEqual(matchStationQuery('신촌'), null, '주소 낱말인 신촌은 역 없이 치면 기존 동네 검색에 맡긴다');
assert.strictEqual(matchStationQuery('성수'), null, '주소 낱말인 성수는 역 없이 치면 기존 동네 검색에 맡긴다');
assert.strictEqual(matchStationQuery('카페'), null, '역 이름이 아닌 검색어는 걸리지 않는다');
assert.strictEqual(matchStationQuery('역'), null, '한 글자 역은 역 이름이 아니다');
assert.strictEqual(matchStationQuery('constructor'), null, '객체 기본 속성 이름은 역 이름이 아니다');
assert.strictEqual(isNearStation({ lat: 37.5404, lng: 127.0692, _dist: 9999 }, stations['건대입구']), false, '지어낸 좌표(_dist 9999)는 역 반경에 넣지 않는다');
assert.strictEqual(isNearStation({ lat: null, lng: null }, stations['건대입구']), false, '좌표가 없는 스팟은 역 반경에 넣지 않는다');
assert.strictEqual(isNearStation({ lat: 37.5404, lng: 127.0692 }, stations['건대입구']), true, '역 위의 스팟은 반경 안이다');
assert.strictEqual(isNearStation({ lat: 37.5604, lng: 127.0692 }, stations['건대입구']), false, '2km 밖 스팟은 반경 밖이다');
console.log('test-station-search: 모두 통과');
