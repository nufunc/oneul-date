// 복사 텍스트 총평 회귀 테스트: node scripts/test-copy-text-cache.cjs
// formatCourseTextAsync를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 총평 줄은 로컬 템플릿(generateCourseStory)으로 쓰고 네트워크 요청을 보내지 않아야 한다(P-274에서 AI 총평 요청 제거)
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
const code = cut('async function formatCourseTextAsync', '\n}\n');

let fetchCalls = 0;
const stubs = {
  fetch: async () => {
    fetchCalls++;
    throw new Error('복사 텍스트가 네트워크 요청을 보냈다');
  },
  generateCourseStory: (_steps, _byId, mood) => `템플릿 총평 ${mood}`,
  regionsLabel: () => '성수',
  moodLabel: () => '감성',
  naverMapUrl: (s) => `https://map.example/${s.id}`,
  getCleanSpotSummary: () => '',
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
const firstLine = (text) => text.split('\n')[1];

(async () => {
  // 총평 줄은 무드에 맞춘 로컬 템플릿
  assert.strictEqual(firstLine(await formatCourseTextAsync(steps, byId, [], 'ALL')), '✨ "템플릿 총평 ALL"');
  assert.strictEqual(firstLine(await formatCourseTextAsync(steps, byId, [], 'ROMANTIC')), '✨ "템플릿 총평 ROMANTIC"');
  // 지운 AI 총평 캐시와 요청을 다시 부르지 않는다
  assert.ok(!/cachedAiBriefing|fetchAiBriefing|aiStoryCache/.test(code), '복사 텍스트가 AI 총평 캐시나 요청을 부른다');
  assert.strictEqual(fetchCalls, 0, '복사 텍스트가 총평 요청을 보냈다');
  console.log('ok 복사 텍스트 총평 템플릿 3');
})().catch((e) => {
  console.error(`FAIL ${e.message}`);
  process.exit(1);
});
