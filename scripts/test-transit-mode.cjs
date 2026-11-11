// 이동 구간 도보·차량 기준 시험(P-376): node scripts/test-transit-mode.cjs
// describeTransit과 WALK_MAX_KM, 📋 복사 글의 이동 줄 블록을 src/main.ts에서 떼어 TypeScript로 변환해 실행한다
// 1.5km 미만은 도보와 walk, 이상은 차량·이동과 transit인지, 복사 글 이동 줄이 화면과 같은 문구인지 본다
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
const code = [cut('const WALK_MAX_KM', ';\n'), cut('function describeTransit', '\n}\n')].join('\n');
const { WALK_MAX_KM, describeTransit } = new Function(
  `${ts.transpile(code, { target: 'es2022' })};return { WALK_MAX_KM, describeTransit };`,
)();

assert.strictEqual(WALK_MAX_KM, 1.5);
// 1km 미만 도보는 m 표기
assert.deepStrictEqual(describeTransit(0.931), { distanceText: '931m', timeText: '도보 약 14분', icon: '🚶‍♂️', mode: 'walk' });
// 1.0~1.5km는 도보로 바뀜, 거리는 km
assert.deepStrictEqual(describeTransit(1.1), { distanceText: '1.1km', timeText: '도보 약 17분', icon: '🚶‍♂️', mode: 'walk' });
assert.deepStrictEqual(describeTransit(1.4), { distanceText: '1.4km', timeText: '도보 약 21분', icon: '🚶‍♂️', mode: 'walk' });
// 1.5km부터 차량
assert.deepStrictEqual(describeTransit(1.5), { distanceText: '1.5km', timeText: '차량·이동 약 7분', icon: '🚗', mode: 'transit' });
// 30km 분기(P-016)
assert.deepStrictEqual(describeTransit(37), { distanceText: '37km', timeText: '차량·이동 약 1시간 22분', icon: '🚗', mode: 'transit' });

// 길찾기 링크 두 곳이 describeTransit의 mode를 쓰고 1.0 기준이 남지 않았는지
assert.strictEqual((src.match(/< 1\.0\) \? 'walk'|dist < 1\.0 \? 'walk'/g) || []).length, 0, '1.0km 링크 기준이 남아 있다');
assert.ok(src.includes("/-/${mode}`;"), '내 위치 출발 띠 링크가 mode를 쓰지 않는다');
assert.ok(src.includes('const { mode } = describeTransit(getDistanceKm(s1.lat, s1.lng, s2.lat, s2.lng));'), '구간 띠 링크가 describeTransit을 쓰지 않는다');

// 📋 복사 글 이동 줄: formatCourseTextAsync 안의 블록을 떼어 실행
const fmt = cut('async function formatCourseTextAsync', '\n}\n');
const blockStart = fmt.indexOf('const dist = getDistanceKm(spot.lat');
assert(blockStart >= 0, '복사 글 이동 줄 블록이 없다');
const block = fmt.slice(blockStart, fmt.indexOf('} else {', blockStart));
const copyLine = (km) => {
  const lines = [];
  new Function('describeTransit', 'getDistanceKm', 'spot', 'nextSpot', 'lines', ts.transpile(block, { target: 'es2022' }))(
    describeTransit, () => km, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }, lines,
  );
  return lines;
};
assert.deepStrictEqual(copyLine(37), ['\n   ↓ 🚗 차량·이동 약 1시간 22분 (37km)']);
assert.deepStrictEqual(copyLine(1.4), ['\n   ↓ 🚶‍♂️ 도보 약 21분 (1.4km)']);
assert.deepStrictEqual(copyLine(1.5), ['\n   ↓ 🚗 차량·이동 약 7분 (1.5km)']);

console.log('test-transit-mode: 통과');
