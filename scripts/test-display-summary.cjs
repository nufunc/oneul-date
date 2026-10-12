// displaySpotSummary와 sheetRatingText 회귀 테스트: node scripts/test-display-summary.cjs
// TourAPI 폴백 요약 행에도 사실 한 줄을 시도하는지(P-131)와 시트 평점 칸이 사실 한 줄과 겹치지 않는지(P-125)를 본다.
// 함수와 상수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const pick = (decl) => {
  const start = src.indexOf(`\n${decl}`) + 1;
  if (start === 0) throw new Error(`not found: ${decl}`);
  const end = decl.startsWith('function') ? src.indexOf('\n}\n', start) + 3 : src.indexOf(';\n', start) + 2;
  return src.slice(start, end);
};
const code = [
  'const DISALLOWED_YOUTUBE_KEYWORDS', 'const VERIFIED_YOUTUBE_CREATORS', 'function isValidYoutubeHotclip',
  'const YT_GENERIC_NAME_WORDS', 'const normalizeYoutubeMatchText', 'function youtubeTitleNamesSpot',
  'const TOURAPI_TEMPLATE_SUMMARY', 'const SUMMARY_TEMPLATE_MIN_REPEATS', 'let summaryTemplateCache',
  'function summaryTemplateKey', 'function cardSpotSummary', 'function sheetRatingText', 'function cleanSpotSummary',
  'function buildFactSentence', 'function displaySpotSummary',
].map(pick).join('\n');
const { displaySpotSummary, sheetRatingText } = new Function(
  `let spots = [];\n${ts.transpile(code, { target: 'es2022' })};return { displaySpotSummary, sheetRatingText };`,
)();

const fallbackSpot = (km) => ({
  id: 3, name: 'aT센터', area: '서초구', region: '서울', category: 'culture',
  summary: 'aT센터 — 한국관광공사 관광정보 문화시설 명소 (서초구)',
  curation_badges: { tour_api: true }, social_links: km ? { kakaomap: km } : {},
});
const CASES = [
  // (a) 폴백 요약 행: 기준(리뷰 10건 이상, 3.8점 이상)을 넘으면 사실 한 줄, 아니면 빈 값
  ['폴백 + 4.4점 리뷰 1499', fallbackSpot({ rating: 4.4, review_count: 1499 }),
    { text: '서초구에서 카카오맵 평점 4.4점(리뷰 1,499개)을 받은 곳이에요.', isFact: true }, ''],
  ['폴백 + 리뷰 9건', fallbackSpot({ rating: 4.8, review_count: 9 }), { text: '', isFact: false }, '★4.8 · 리뷰 9개'],
  ['폴백 + 3.7점', fallbackSpot({ rating: 3.7, review_count: 500 }), { text: '', isFact: false }, '★3.7 · 리뷰 500개'],
  ['폴백 + 평점 없음', fallbackSpot(null), { text: '', isFact: false }, ''],
  // 정상 요약은 그대로 두고, 평점이 있으면 시트 평점 칸이 보인다
  ['정상 요약', { ...fallbackSpot({ rating: 4.6, review_count: 214 }), summary: '창가 자리에서 한강이 내려다보이는 작은 카페예요.' },
    { text: '창가 자리에서 한강이 내려다보이는 작은 카페예요.', isFact: false }, '★4.6 · 리뷰 214개'],
];

let failed = 0;
for (const [label, spot, expected, rating] of CASES) {
  const actual = displaySpotSummary(spot);
  // (b) 시트와 같은 방식으로 사실 한 줄일 때만 넘긴다: 평점을 담았으면 평점 칸이 빠지고 아니면 보인다
  const actualRating = sheetRatingText(spot, actual.isFact ? actual.text : '');
  if (JSON.stringify(actual) !== JSON.stringify(expected) || actualRating !== rating) {
    failed++;
    console.error(`FAIL ${label}: ${JSON.stringify(actual)} / ${JSON.stringify(actualRating)}`);
  }
}
// 사실 한 줄이 평점 없이 유튜브만 담으면 평점 칸은 보인다
if (sheetRatingText(fallbackSpot({ rating: 4.6, review_count: 9 }), "유튜브 'aT센터 전시'에서 소개된 서초구의 장소예요.") !== '★4.6 · 리뷰 9개') {
  failed++;
  console.error('FAIL 유튜브만 담은 사실 한 줄');
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length + 1}`);
