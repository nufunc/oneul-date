// buildFactSentence 회귀 테스트: node scripts/test-fact-sentence.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function buildFactSentence');
const end = src.indexOf('\n}\n', start) + 3;
const build = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return buildFactSentence;`)();

const spot = (id, km, area = '마포구') => ({ id, area, region: '서울', social_links: km ? { kakaomap: km } : {} });
const CASES = [
  ['평점 문형 0', spot(3, { rating: 4.6, review_count: 1625 }), null, '마포구에서 카카오맵 평점 4.6점(리뷰 1,625개)를 받은 곳이에요.'],
  ['평점 문형 1', spot(4, { rating: 4.2, review_count: 10 }), null, '카카오맵 평점 4.2점(리뷰 10개)를 기록한 마포구의 장소예요.'],
  ['평점 문형 2', spot(5, { rating: 3.8, review_count: 58 }), null, '마포구에 있고, 카카오맵 평점 3.8점(리뷰 58개)이에요.'],
  ['리뷰 9건은 제외', spot(3, { rating: 4.8, review_count: 9 }), null, ''],
  ['3.7점은 제외', spot(3, { rating: 3.7, review_count: 500 }), null, ''],
  ['재료 없음', spot(3, null), null, ''],
  ['지역 없음', spot(3, { rating: 4.0, review_count: 20 }, ''), null, '서울에서 카카오맵 평점 4.0점(리뷰 20개)를 받은 곳이에요.'],
  ['영상 제목 정리', spot(3), { title: '🔥부산 여행의 꽃 청사포 도희네 조개구이 | 맛집 #부산 #맛집', views: 500 }, "유튜브 '부산 여행의 꽃 청사포 도희네 조개구이'에서 소개된 마포구의 장소예요."],
  ['제목 ㅋㅋ는 조회수로', spot(4), { title: '대박이다 ㅋㅋㅋ', views: 72000 }, '마포구의 장소로, 유튜브 영상(조회 7.2만)에서 다뤘어요.'],
  ['제목도 조회수도 부족', spot(3), { title: 'ㅋㅋ', views: 9000 }, ''],
  ['평점과 영상', spot(3, { rating: 4.2, review_count: 54 }), { title: '최애산 등극 가야산' }, "마포구에서 카카오맵 평점 4.2점(리뷰 54개)를 받은 곳이에요. 유튜브 '최애산 등극 가야산'에도 나와요."],
];

let failed = 0;
for (const [label, s, yt, expected] of CASES) {
  const actual = build(s, yt);
  if (actual !== expected) {
    failed++;
    console.error(`FAIL ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
