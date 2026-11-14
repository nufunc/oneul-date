// 받은 코스 '바꿔서 쓰기' 회귀 테스트: node scripts/test-receiver-edit-button.cjs
// courseHasHoursWarning을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 휴무나 칸 시각 영업 외 장소가 하나라도 있을 때만 참이고, 받은 코스 화면이 그때만 버튼을 그리는지 본다(P-449)
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

const spotById = new Map([
  [1, { id: 1 }],
  [2, { id: 2, closed: true }],
  [3, { id: 3, shut: ['night'] }],
]);
const calls = [];
const stubs = {
  spotById,
  isSpotClosedToday: (s) => s.closed === true,
  isOpenAtSlotClock: (s, slot, date, withMargin) => {
    calls.push(withMargin);
    return !(s.shut || []).includes(slot);
  },
};
const { courseHasHoursWarning } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(cut('function courseHasHoursWarning', '\n}\n'), { target: 'es2022' })};return { courseHasHoursWarning };`,
)(...Object.values(stubs));

// 경고 없는 코스: 거짓
assert.strictEqual(courseHasHoursWarning([{ slot: 'day', spotId: 1 }, { slot: 'night', spotId: 1 }]), false);
// 오늘 휴무 장소가 하나라도 있으면 참
assert.strictEqual(courseHasHoursWarning([{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }]), true);
// 칸 시각에 닫은 장소(영업시간 확인)도 참, 같은 장소라도 연 칸이면 거짓
assert.strictEqual(courseHasHoursWarning([{ slot: 'night', spotId: 3 }]), true);
assert.strictEqual(courseHasHoursWarning([{ slot: 'day', spotId: 3 }]), false);
// 카드 배지와 같이 여유 없이 칸 시각 한 점만 본다
assert(calls.length > 0 && calls.every((m) => m === false));
// 빈 칸과 못 찾은 장소는 경고로 세지 않는다
assert.strictEqual(courseHasHoursWarning([{ slot: 'day', spotId: null }, { slot: 'day', spotId: 99 }]), false);
assert.strictEqual(courseHasHoursWarning([]), false);

// 받은 코스 화면은 경고가 있을 때만 버튼을 그리고, 저장하지 않고 restoreCourse로 결과 화면에 연다
const view = cut('function renderReceiverView', '\n}\n');
assert(/\$\{courseHasHoursWarning\(steps\) \? `<button[^`]*id="btn-receiver-edit"[^`]*바꿔서 쓰기<\/button>` : ''\}/.test(view));
const handler = view.slice(view.indexOf("getElementById('btn-receiver-edit')"));
const body = handler.slice(0, handler.indexOf('});'));
assert(body.includes('restoreCourse('));
assert(!/saveCourse|saveCourseWithToast/.test(body), '바꿔서 쓰기는 저장 목록에 넣지 않는다');

console.log('test-receiver-edit-button: ok');
