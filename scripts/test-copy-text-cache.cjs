// 복사 텍스트 회귀 테스트: node scripts/test-copy-text-cache.cjs
// formatCourseTextAsync를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 머리 다음이 곧바로 1차 블록이고 `✨ "총평"` 줄이 없으며 네트워크 요청을 보내지 않아야 한다(P-274 AI 총평 요청 제거, P-301 총평 줄 제거)
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
  cut('const WALK_MAX_KM', ';\n'),
  cut('function describeTransit', '\n}\n'),
  cut('function areaThemeLabel', '\n}\n'),
  // P-427: 카드 배지와 같은 영업시간 판정을 실제 코드로 돌린다
  cut('const KOREAN_DAY_NAMES', ';\n'),
  cut('const SLOT_CLOCK_MIN', ';\n'),
  cut('const SLOT_CLOSE_MARGIN_MIN', ';\n'),
  cut('const slotClockOpenCache', ';\n'),
  cut('function isOpenAtSlotClock', '\n}\n'),
  cut('const HOURS_RANGE_RE', ';\n'),
  cut('function parseOpenAtClock', '\n}\n'),
  cut('function todayHoursLabel', '\n}\n'),
  cut('const HOURS_UNKNOWN_TEXT', ';\n'),
  cut('function hasNoHoursInfo', '\n}\n'),
  cut('async function formatCourseTextAsync', '\n}\n'),
].join('\n');

let fetchCalls = 0;
const stubs = {
  fetch: async () => {
    fetchCalls++;
    throw new Error('복사 텍스트가 네트워크 요청을 보냈다');
  },
  courseAreaLabel: () => '성수',
  moodLabel: () => '감성',
  SPOT_EXPLORE_CATEGORIES: [],
  naverMapUrl: (s) => `https://map.example/${s.id}`,
  displaySpotSummary: () => ({ text: '', isFact: false }),
  getDistanceKm: () => 0.5,
  buildShareUrl: (ids) => `https://share.example/${ids.join('-')}`,
  isSpotClosedToday: (s) => Boolean(s.closedToday),
  SLOT_META: { day: { emoji: '☀️', label: '낮' }, evening: { emoji: '🌆', label: '저녁' }, night: { emoji: '🌙', label: '밤' } },
};
const { formatCourseTextAsync } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { formatCourseTextAsync };`,
)(...Object.values(stubs));

const byId = new Map([
  [1, { id: 1, name: '카페', category: '카페', address: '성수동 1', lat: 37.5, lng: 127 }],
  [2, { id: 2, name: '식당', category: '한식', address: '성수동 2', lat: 37.5, lng: 127 }],
]);
const steps = [
  { slot: 'day', spotId: 1 },
  { slot: 'evening', spotId: null },
  { slot: 'evening', spotId: 2 },
];
const secondLine = (text) => text.split('\n')[2];

(async () => {
  // 머리줄 다음은 빈 줄 하나를 두고 곧바로 1차 블록이며 총평 줄(`✨ "`)이 없다
  for (const mood of ['ALL', 'ROMANTIC']) {
    const text = await formatCourseTextAsync(steps, byId, [], mood);
    assert.ok(!/^✨ "/m.test(text), `${mood}: 복사 글에 ✨ " 줄이 있다`);
    assert.ok(!text.includes('\n\n\n'), `${mood}: 빈 줄이 겹쳤다`);
    assert.strictEqual(text.split('\n')[1], '', `${mood}: 머리줄 다음이 빈 줄이 아니다`);
    assert.ok(secondLine(text).startsWith('1차 '), `${mood}: 머리 다음이 1차 블록이 아니다`);
  }
  assert.ok(!/generateCourseStory/.test(code), '복사 텍스트가 총평 생성기를 부른다');
  // 지운 AI 총평 캐시와 요청을 다시 부르지 않는다
  assert.ok(!/cachedAiBriefing|fetchAiBriefing|aiStoryCache/.test(code), '복사 텍스트가 AI 총평 캐시나 요청을 부른다');
  assert.strictEqual(fetchCalls, 0, '복사 텍스트가 총평 요청을 보냈다');
  // P-427: 칸 시각에 닫은 장소는 카드와 같은 경고와 오늘 영업시간 줄, 영업시간을 모르면 줄 없음
  const hoursById = new Map([
    [1, { id: 1, name: '낙원장', category: '주점', address: '종로 1', business_hours: { 영업시간: '매일 17:00 ~ 01:00' } }],
    [2, { id: 2, name: '휴무집', category: '한식', address: '종로 2', closedToday: true, business_hours: { 영업시간: '매일 11:00 ~ 22:00' } }],
    [3, { id: 3, name: '모름집', category: '카페', address: '종로 3' }],
  ]);
  const hoursText = await formatCourseTextAsync(
    [{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }, { slot: 'night', spotId: 3 }], hoursById, [], 'ALL',
  );
  const [b1, b2, b3] = hoursText.split(/\n(?=\d차 )/).slice(1);
  // P-428: 장소 줄에 카드 칸 표시와 같은 칸 이름
  assert.ok(b1.startsWith('1차 ☀️ 낮 낙원장 (주점)\n'), `낮 칸 장소 줄: ${b1}`);
  assert.ok(b2.startsWith('2차 🌆 저녁 휴무집 (한식)\n'), `저녁 칸 장소 줄: ${b2}`);
  assert.ok(b3.startsWith('3차 🌙 밤 모름집 (카페)\n'), `밤 칸 장소 줄: ${b3}`);
  assert.ok(b1.includes('\n⚠️ 영업시간 확인\n🕒 오늘 17:00~01:00\n📍 종로 1'), `낮 칸 17시 개점 블록: ${b1}`);
  assert.ok(b2.includes('\n⚠️ 오늘 휴무\n📍 종로 2'), `휴무 블록: ${b2}`);
  assert.ok(!/🕒|영업시간 확인/.test(b2), '휴무 블록에 영업시간 줄이 있다');
  // P-437: 영업시간을 모르면 경고 없이 카드와 같은 '영업시간 정보 없음' 줄
  assert.ok(b3.includes('\n🕒 영업시간 정보 없음\n📍 종로 3'), `영업시간 모르는 블록: ${b3}`);
  assert.ok(!/⚠️/.test(b3), `영업시간 모르는 블록에 경고: ${b3}`);
  assert.ok(!/영업시간 정보 없음/.test(b1 + b2), '영업시간을 아는 블록이나 휴무 블록에 정보 없음 줄');
  const noHours = await formatCourseTextAsync(steps, byId, [], 'ALL');
  assert.ok(!/⚠️/.test(noHours), '영업시간 없는 코스에 경고');
  assert.strictEqual(noHours.match(/🕒 영업시간 정보 없음/g).length, 2, '영업시간 없는 칸마다 정보 없음 줄');
  console.log('ok 복사 텍스트 총평 줄 없음, 영업시간 줄, 칸 이름 22');
})().catch((e) => {
  console.error(`FAIL ${e.message}`);
  process.exit(1);
});
