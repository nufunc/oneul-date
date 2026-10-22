// 복사 텍스트 총평 회귀 테스트: node scripts/test-copy-text-cache.cjs
// formatCourseTextAsync와 총평 캐시 조회를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 캐시에 총평이 있으면 그것을, 없으면 템플릿을 쓰고, 어느 쪽이든 총평 요청을 보내지 않아야 한다
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
  cut('const aiStoryCache', '\n'),
  cut('function normalizeEditorialTone', '\n}\n'),
  cut('function cachedAiBriefing', '\n}\n'),
  cut('async function formatCourseTextAsync', '\n}\n'),
].join('\n');

let fetchCalls = 0;
const stubs = {
  fetchAiBriefing: async () => {
    fetchCalls++;
    return 'AI 서버가 보낸 총평이라 복사에 나오면 안 된다';
  },
  generateCourseStory: () => '템플릿 총평',
  regionsLabel: () => '성수',
  moodLabel: () => '감성',
  naverMapUrl: (s) => `https://map.example/${s.id}`,
  getCleanSpotSummary: () => '',
  getDistanceKm: () => 0.5,
  buildShareUrl: (ids) => `https://share.example/${ids.join('-')}`,
  SLOT_META: { day: { emoji: '☀️' }, evening: { emoji: '🌆' } },
};
const { aiStoryCache, formatCourseTextAsync } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { aiStoryCache, formatCourseTextAsync };`,
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
  // 캐시 없음: 템플릿
  assert.strictEqual(firstLine(await formatCourseTextAsync(steps, byId, [], 'ALL')), '✨ "템플릿 총평"');

  // 캐시 있음: 화면과 같은 총평(빈 칸 스텝은 키에서 빠진다)
  aiStoryCache.set('ROMANTIC_1-2', '두 사람이 천천히 걷기 좋은 성수 코스예요.');
  assert.strictEqual(
    firstLine(await formatCourseTextAsync(steps, byId, [], 'ROMANTIC')),
    '✨ "두 사람이 천천히 걷기 좋은 성수 코스예요."',
  );
  // 무드가 다르면 다른 키라 템플릿
  assert.strictEqual(firstLine(await formatCourseTextAsync(steps, byId, [], 'ALL')), '✨ "템플릿 총평"');

  assert.strictEqual(fetchCalls, 0, '복사 텍스트가 총평 요청을 보냈다');
  console.log('ok 복사 텍스트 총평 캐시 3');
})().catch((e) => {
  console.error(`FAIL ${e.message}`);
  process.exit(1);
});
