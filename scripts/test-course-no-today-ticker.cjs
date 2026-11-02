// 맞춤 코스 탭 오늘의 코스 줄 제거 시험(P-278): node scripts/test-course-no-today-ticker.cjs
// 오늘의 코스 줄과 그 줄만 쓰던 코드와 스타일이 없고, 위치(userCoords, requestUserGeolocation)와 첫 화면 자동 오늘 추천 코스는 남았는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

for (const name of ['today-area', 'btn-today-course', 'renderTodayCourse', 'buildNearbyCourse', 'getLiveAmbientInfo', 'LiveAmbientInfo', 'todayArea']) {
  assert.ok(!src.includes(name), `main.ts에 ${name}가 남았다`);
}
for (const sel of ['.live-ambient-ticker', '.today-course-area', '.ticker-', 'ticker-glow']) {
  assert.ok(!css.includes(sel), `style.css에 ${sel} 규칙이 남았다`);
}

// 결과 출발지 안내와 스팟 탐색 탭 거리순이 쓰는 위치는 남긴다
assert.ok(/let userCoords: \{ lat: number; lng: number \} \| null = null;/.test(src), 'userCoords가 빠졌다');
assert.ok(/function requestUserGeolocation\(/.test(src), 'requestUserGeolocation이 빠졌다');
assert.ok(/requestUserGeolocation\(false\);/.test(src), '첫 화면 위치 요청이 빠졌다');
assert.ok(/function renderUserOriginTransitDivider\(/.test(src), '결과 출발지 안내가 빠졌다');
assert.ok(/const daily = buildDailyRecommendedCourse\(spots\);/.test(src), '첫 화면 자동 오늘 추천 코스 호출이 빠졌다');

console.log('test-course-no-today-ticker: 통과');
