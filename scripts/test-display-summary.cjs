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
const { displaySpotSummary, sheetRatingText, cardSpotSummary, setSpots } = new Function(
  `let spots = [];\n${ts.transpile(code, { target: 'es2022' })};return { displaySpotSummary, sheetRatingText, cardSpotSummary, setSpots: (s) => { spots = s; } };`,
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
// 수집기가 앞에 도입구 한 마디를 붙인 같은 틀 문장(P-201): 5행이면 틀로 잡혀 카드는 빈 값, 평점 있는 행은 사실 한 줄이고 4행이면 문장이 남는다
const OPENERS = ['노을이 물드는 저녁,', '북적이는 인파 속에서도,', '정겨운 간판 불빛 아래,', '손을 꼭 잡고 걷다 보면,', '왁자지껄한 분위기 속에서,'];
const openerSpots = (n) => OPENERS.slice(0, n).map((opener, i) => {
  const name = ['고내포구', '황남빵', '협재해변', '애월카페거리', '함덕해수욕장'][i];
  return {
    id: 3 * (i + 1), name, area: '제주시', region: '제주', category: 'cafe', curation_badges: {},
    summary: `${opener} ${name}에서 감각적인 인테리어와 아늑한 분위기를 즐기기 좋아요.`,
    social_links: i === 0 ? { kakaomap: { rating: 4.5, review_count: 120 } } : {},
  };
});
const OPENER_CASES = [
  ['도입구+틀 5행: 평점 행', 5, 0, '', { text: '제주시에서 카카오맵 평점 4.5점(리뷰 120개)을 받은 곳이에요.', isFact: true }],
  ['도입구+틀 5행: 평점 없는 행', 5, 1, '', { text: '북적이는 인파 속에서도, 황남빵에서 감각적인 인테리어와 아늑한 분위기를 즐기기 좋아요.', isFact: false }],
  ['도입구+틀 4행: 평점 행', 4, 0, '노을이 물드는 저녁, 고내포구에서 감각적인 인테리어와 아늑한 분위기를 즐기기 좋아요.',
    { text: '노을이 물드는 저녁, 고내포구에서 감각적인 인테리어와 아늑한 분위기를 즐기기 좋아요.', isFact: false }],
];
for (const [label, n, i, card, expected] of OPENER_CASES) {
  const rows = openerSpots(n);
  setSpots(rows);
  const actualCard = cardSpotSummary(rows[i]);
  const actual = displaySpotSummary(rows[i]);
  if (actualCard !== card || JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL ${label}: ${JSON.stringify(actualCard)} / ${JSON.stringify(actual)}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length + 1 + OPENER_CASES.length}`);
