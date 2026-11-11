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
  SLOT_META: { day: { emoji: '☀️' }, evening: { emoji: '🌆' } },
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
  console.log('ok 복사 텍스트 총평 줄 없음 11');
})().catch((e) => {
  console.error(`FAIL ${e.message}`);
  process.exit(1);
});
