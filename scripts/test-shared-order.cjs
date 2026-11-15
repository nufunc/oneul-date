// 공유·저장 코스 순서 회귀 테스트(P-454): node scripts/test-shared-order.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} 없음`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const code = ['stepsInGivenOrder', 'buildSharedSteps', 'resolveSavedSteps'].map(cut).join('\n');
const make = new Function('spotById', 'isCourseEligible', 'SLOT_ORDER',
  `${ts.transpile(code, { target: 'es2022' })};return { buildSharedSteps, resolveSavedSteps };`);

const SLOT_ORDER = ['day', 'evening', 'night', 'stay'];
const SPOTS = [
  { id: 1, slot: 'day' }, { id: 2, slot: 'evening' }, { id: 3, slot: 'night' }, { id: 4, slot: 'stay' },
  { id: 5, slot: 'day' }, { id: 6, slot: 'night' }, { id: 7, slot: '' }, { id: 8, slot: 'evening', bad: true },
];
const spotById = new Map(SPOTS.map((s) => [s.id, s]));
const isCourseEligible = (s) => SLOT_ORDER.includes(s.slot) && !s.bad;
const { buildSharedSteps, resolveSavedSteps } = make(spotById, isCourseEligible, SLOT_ORDER);

// 고치기 전 규칙: 장소 slot으로 칸을 정하고 SLOT_ORDER로 정렬
const oldRule = (ids) => ids
  .map((id) => spotById.get(id))
  .filter((s) => s && isCourseEligible(s))
  .map((s) => ({ slot: s.slot, spotId: s.id }))
  .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

const fmt = (steps) => steps.map((s) => `${s.spotId}:${s.slot}`).join(' ');
const CASES = [
  // ⚡ 뒤 순서: 장소 순서를 지키고 칸 이름은 자리 순서
  ['⚡ 뒤 순서', [1, 3, 2], '1:day 3:evening 2:night'],
  ['⚡ 뒤 순서 + 숙소', [2, 1, 3, 4], '2:day 1:evening 3:night 4:stay'],
  ['⚡ 뒤 순서 + 빠진 id', [3, 999, 1, 2], '3:day 1:evening 2:night'],
  ['⚡ 뒤 순서 + slot 없음·검증 실패', [6, 7, 8, 1], '6:day 1:night'],
];
// 칸 순서 주소는 고치기 전과 같아야 함
const SORTED = [[1, 2, 3], [1, 2, 3, 4], [1, 3], [2, 3, 4], [1, 5, 2, 6], [1, 999, 2, 3], [7, 1, 8, 2, 3], [], [4]];
for (const ids of SORTED) CASES.push([`칸 순서 ${ids.join('.')}`, ids, fmt(oldRule(ids))]);

let failed = 0;
for (const [label, ids, expected] of CASES) {
  const shared = fmt(buildSharedSteps(ids));
  const saved = resolveSavedSteps(ids);
  const expectDropped = ids.length - (expected ? expected.split(' ').length : 0);
  if (shared !== expected) { failed++; console.error(`FAIL 공유 ${label}: ${shared} != ${expected}`); }
  if (fmt(saved.steps) !== expected) { failed++; console.error(`FAIL 저장 ${label}: ${fmt(saved.steps)} != ${expected}`); }
  if (saved.dropped !== expectDropped) { failed++; console.error(`FAIL 저장 dropped ${label}: ${saved.dropped} != ${expectDropped}`); }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
