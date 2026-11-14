// 복사 글 머리줄과 링크줄의 테마 칩 회귀 테스트: node scripts/test-copy-head-theme.cjs (P-294)
// areaThemeLabel과 formatCourseTextAsync를 src/main.ts에서 떼어 실행해 머리줄이 코스 제목 규칙과 같고 링크에 ?t=가 실리는지 본다
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
const code = cut('function areaThemeLabel', '\n}\n') + cut('async function formatCourseTextAsync', '\n}\n');
// courseTitle도 같은 함수를 부르는지(규칙 복제 금지)
assert.ok(/return areaThemeLabel\(/.test(cut('function courseTitle', '\n}\n')), 'courseTitle이 areaThemeLabel을 부르지 않는다');

const stubs = {
  courseAreaLabel: (spots, r) => r.join('·'),
  moodLabel: (m) => (m === 'ALL' ? '모든 분위기' : `분위기${m}`),
  SPOT_EXPLORE_CATEGORIES: [{ key: 'CAFE', emoji: '☕', label: '감성카페' }],
  naverMapUrl: (s) => `https://map.example/${s.id}`,
  displaySpotSummary: () => ({ text: '', isFact: false }),
  getDistanceKm: () => 0.5,
  // 실제 buildShareUrl처럼 유효한 칩 키(CAFE)일 때만 ?t=를 싣는다
  buildShareUrl: (ids, key) => `https://share.example/${key === 'CAFE' ? '?t=CAFE' : ''}#c=${ids.join('.')}`,
  SLOT_META: { day: { emoji: '☀️', label: '낮' } },
  isSpotClosedToday: () => false,
  isOpenAtSlotClock: () => true,
  todayHoursLabel: () => '',
  hasNoHoursInfo: () => false,
  HOURS_UNKNOWN_TEXT: '영업시간 정보 없음',
};
const { formatCourseTextAsync } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { formatCourseTextAsync };`,
)(...Object.values(stubs));

const byId = new Map([[1, { id: 1, name: '카페', category: '카페', address: '성수동 1', lat: 37.5, lng: 127 }]]);
const steps = [{ slot: 'day', spotId: 1 }];
const head = (t) => t.split('\n')[0];
const link = (t) => t.split('\n').pop();

(async () => {
  const chip = await formatCourseTextAsync(steps, byId, ['서울'], 'ALL', [], 'CAFE');
  assert.strictEqual(head(chip), '💖 [오늘 데이트 코스] 서울 · ☕ 감성카페');
  assert.ok(!/^✨ "/m.test(chip), '복사 글에 ✨ " 총평 줄이 있다');
  assert.strictEqual(link(chip), 'https://share.example/?t=CAFE#c=1');
  for (const k of [undefined, 'ALL', 'NOPE']) {
    const none = await formatCourseTextAsync(steps, byId, ['서울'], 'ALL', [], k);
    assert.strictEqual(head(none), '💖 [오늘 데이트 코스] 서울', `칩 ${k}`);
    assert.ok(!/\?t=/.test(link(none)), `칩 ${k}의 링크에 ?t=가 실렸다`);
  }
  // 지역 없는 받은 코스: 칩만 있으면 '전국 어디서나 · 칩'
  assert.strictEqual(head(await formatCourseTextAsync(steps, byId, [], 'ALL', [], 'CAFE')), '💖 [오늘 데이트 코스] 전국 어디서나 · ☕ 감성카페');
  // 분위기를 고른 옛 호출은 그대로
  assert.strictEqual(head(await formatCourseTextAsync(steps, byId, ['서울'], 'R')), '💖 [오늘 데이트 코스] 서울 · 분위기R');
  console.log('ok 복사 글 머리줄과 링크 칩 7');
})().catch((e) => {
  console.error(`FAIL ${e.message}`);
  process.exit(1);
});
