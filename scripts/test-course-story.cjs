// generateCourseStory 회귀 테스트: node scripts/test-course-story.cjs
// 조사 함수와 업종 판정과 총평 템플릿을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const code = [
  cut('function escapeHtml', '\n}\n'),
  cut('const CURATED_CATEGORY_IMAGES', '\n};\n'),
  cut('/** 업종 키워드로 큐레이션 풀을', '\n}\n'),
  cut('function hasKoreanBatchim', '\n}\n'),
  cut('const KOREAN_PARTICLES', '\n'),
  cut('function withParticle', '\n}\n'),
  cut('function joinWithParticle', '\n}\n'),
  cut('function isFoodVenue', '\n}\n'),
  cut('function joinKoreanList', '\n}\n'),
  cut('function generateCourseStory', '\n}\n'),
].join('\n');
const { withParticle, isFoodVenue, generateCourseStory } = new Function(
  `${ts.transpile(code, { target: 'es2022' })};return { withParticle, isFoodVenue, generateCourseStory };`,
)();

let failed = 0;
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failed++;
    console.error(`FAIL ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
};

// 조사: 받침 없음, 받침 있음, ㄹ받침(으로/로 예외), 한글이 아닌 끝
const PARTICLE_CASES = [
  ['대화', '으로/로', '대화로'],
  ['한 끼', '으로/로', '한 끼로'],
  ['쉼', '으로/로', '쉼으로'],
  ['테이블', '으로/로', '테이블로'],
  ['식탁', '이/가', '식탁이'],
  ['여유', '이/가', '여유가'],
  ['무드', '와/과', '무드와'],
  ['휴식', '와/과', '휴식과'],
  ['테이블', '와/과', '테이블과'],
  ['A', '이/가', 'A가'],
];
for (const [text, pair, expected] of PARTICLE_CASES) check(`조사 ${text} ${pair}`, withParticle(text, pair), expected);

// 업종 판정: 식당·카페·술집만 참
const spot = (id, name, category) => ({ id, name, category });
const VENUE_CASES = [
  [spot(1, '한식당', '음식점>한식'), 'evening', true],
  [spot(2, '대림창고', '카페'), 'day', true],
  [spot(3, '신데렐라', '칵테일바'), 'night', true],
  [spot(4, '도두봉', '관광지'), 'day', false],
  [spot(5, '이호테우 말등대', '등대'), 'evening', false],
  [spot(6, '볼더프렌즈 홍대점', '클라이밍'), 'evening', false],
  [spot(7, '요트탈래 부산본점', '수상스포츠'), 'evening', false],
  [spot(8, '영종진공원', '공원'), 'evening', false],
  // 수집기의 세부 식음 카테고리(P-087): 카테고리만 볼 때 식음으로 잡고, 이름에서는 새로 잡지 않는다
  [spot(9, '라 칸티나', '이탈리안'), 'evening', true],
  [spot(11, '해오름', '한정식'), 'evening', true],
  [spot(12, '백설대학', '분식'), 'day', true],
  [spot(13, '청수물회', '회'), 'day', true],
  [spot(14, '키사', '술집'), 'night', true],
  [spot(15, '밥도사술도사', '실내포장마차'), 'night', true],
  [spot(16, '아이스랩', '아이스크림'), 'day', true],
  [spot(17, '국제시장 먹자골목', '관광지'), 'evening', false],
  [spot(18, '한정식거리 입구', '관광지'), 'evening', false],
  [spot(19, '구봉도 노을길', '계곡'), 'day', false],
];
for (const [s, slot, expected] of VENUE_CASES) check(`업종 ${s.name}`, isFoodVenue(s, slot), expected);

// 총평: 10패턴(id 합 % 10) x 슬롯 조합 전부를 돌려 조사 오류와 업종 어긋남을 찾는다
const FOOD_PHRASES = /미식|티타임|한잔|한 끼|요리|풍미|테이블|식탁|식사|맛으로/;
// 앞 음절의 받침을 보고 틀린 조사를 찾는다(으로는 ㄹ받침 앞에서도 틀리다)
const jong = (ch) => (ch.charCodeAt(0) - 0xac00) % 28;
function wrongParticle(text) {
  for (const m of text.matchAll(/([가-힣])(으로|과|와|가) /g)) {
    const [, prev, particle] = m;
    const j = jong(prev);
    if ((particle === '으로' && (j === 0 || j === 8)) || (particle === '과' && j === 0) || (particle === '와' && j !== 0) || (particle === '가' && j !== 0)) {
      return `${prev}${particle}`;
    }
  }
  return '';
}
const FOODS = {
  day: spot(10, '대림창고', '카페'),
  evening: spot(20, '서정', '음식점>한식'),
  night: spot(30, '신데렐라', '칵테일바'),
  stay: spot(40, '오션뷰', '호텔'),
};
const NONFOODS = {
  day: spot(10, '도두봉', '관광지'),
  evening: spot(20, '볼더프렌즈 홍대점', '클라이밍'),
  night: spot(30, '레일바이크', '체험여행'),
  stay: spot(40, '오션뷰', '호텔'),
};
const SLOT_COMBOS = [['day', 'evening', 'night'], ['day', 'evening'], ['evening', 'night'], ['day', 'evening', 'night', 'stay']];
const STEP_ORDER = ['day', 'evening', 'night', 'stay'];
let sweeps = 0;
for (const slots of SLOT_COMBOS) {
  for (let offset = 0; offset < 10; offset++) {
    for (const spots of [FOODS, NONFOODS]) {
      const steps = slots.map((slot, i) => ({ slot, spotId: spots[slot].id + (i === 0 ? offset : 0) }));
      const byId = new Map(steps.map((st) => [st.spotId, { ...(spots[st.slot] || NONFOODS[st.slot]), id: st.spotId }]));
      const out = generateCourseStory(steps, byId, 'romantic', false);
      sweeps++;
      const wrong = wrongParticle(out);
      if (wrong) {
        failed++;
        console.error(`FAIL 조사 ${slots} offset=${offset} ${wrong}: ${out}`);
      }
      if (spots === NONFOODS && FOOD_PHRASES.test(out)) {
        failed++;
        console.error(`FAIL 업종 어긋남 ${slots} offset=${offset}: ${out}`);
      }
    }
  }
}
// 세부 식음 카테고리의 총평: 같은 풀의 기존 카테고리(한식·칵테일바·카페)와 10패턴 모두에서 같은 문구를 받고, 비식음과는 달라진다(P-087)
const DETAIL_FOODS = [['이탈리안', 'evening', '한식'], ['한정식', 'evening', '한식'], ['분식', 'day', '한식'], ['술집', 'night', '칵테일바'], ['아이스크림', 'day', '카페']];
for (const [category, slot, reference] of DETAIL_FOODS) {
  const otherSlot = slot === 'evening' ? 'day' : 'evening';
  let differsFromNeutral = 0;
  for (let offset = 0; offset < 10; offset++) {
    const story = (cat) => {
      const steps = [{ slot: otherSlot, spotId: 20 }, { slot, spotId: 100 + offset }];
      const byId = new Map([[20, spot(20, '도두봉', '관광지')], [100 + offset, spot(100 + offset, '시험 가게', cat)]]);
      return generateCourseStory(steps, byId, 'romantic', false);
    };
    sweeps++;
    if (story(category) !== story(reference)) {
      failed++;
      console.error(`FAIL 식음 문구 어긋남 ${category} offset=${offset}: ${story(category)} != ${story(reference)}`);
    }
    if (story(category) !== story('관광지')) differsFromNeutral++;
  }
  if (differsFromNeutral === 0) {
    failed++;
    console.error(`FAIL 시험이 비어 있음 ${category}: 중립 문구와 다른 패턴이 없다`);
  }
}
if (failed) process.exit(1);
console.log(`ok 조사 ${PARTICLE_CASES.length} + 업종 ${VENUE_CASES.length} + 총평 ${sweeps}`);
