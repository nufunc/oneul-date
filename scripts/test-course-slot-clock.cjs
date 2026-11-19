// 칸 표시 기준 시각 시험(P-535): node scripts/test-course-slot-clock.cjs
// slotLabelWithClock을 src/main.ts에서 떼어 실행하고, 시각이 isOpenAtSlotClock과 같은 SLOT_CLOCK_MIN에서 오는지,
// 카드 칸 표시와 복사 글 칸 줄이 이 함수를 쓰는지, 숙박 칸과 매거진 코스(hideSlot)에는 시각이 없는지 본다
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
const code = [cut('const SLOT_META', '};\n'), cut('const SLOT_CLOCK_MIN', ';\n'), cut('function slotLabelWithClock', '\n}\n')].join('\n');
const { slotLabelWithClock, SLOT_CLOCK_MIN } = new Function(
  `${ts.transpile(code, { target: 'es2022' })};return { slotLabelWithClock, SLOT_CLOCK_MIN };`,
)();

// 1) 낮·저녁·밤은 판정 기준 시각을 붙이고 숙박은 이름만
assert.strictEqual(slotLabelWithClock('day'), '낮 · 13시');
assert.strictEqual(slotLabelWithClock('evening'), '저녁 · 19시');
assert.strictEqual(slotLabelWithClock('night'), '밤 · 21시');
assert.strictEqual(slotLabelWithClock('stay'), '숙박');
assert.strictEqual(SLOT_CLOCK_MIN.stay, undefined, '숙박에 판정 시각이 생겼다');

// 2) 시각은 isOpenAtSlotClock이 쓰는 SLOT_CLOCK_MIN 하나에서 온다(따로 둔 시각 상수 없음)
const fn = cut('function slotLabelWithClock', '\n}\n');
assert.ok(/SLOT_CLOCK_MIN\[slot\]/.test(fn), 'slotLabelWithClock이 SLOT_CLOCK_MIN을 읽지 않는다');
assert.ok(/const clock = SLOT_CLOCK_MIN\[slot\];/.test(cut('function isOpenAtSlotClock', '\n}\n')), 'isOpenAtSlotClock의 기준이 바뀌었다');
assert.ok(!/1[39]|21/.test(fn), 'slotLabelWithClock에 시각 숫자가 따로 있다');

// 3) 카드: 칸 표시는 slotLabelWithClock 한 곳이고 hideSlot이면 칸 표시 자체가 없다
const card = cut('function renderStepCard(', '\nfunction ');
assert.ok(
  card.includes("const slotTag = opts.hideSlot ? '' : `<div class=\"step-slot\">${meta.emoji} ${slotLabelWithClock(step.slot)}</div>`;"),
  '카드 칸 표시가 slotLabelWithClock을 hideSlot 분기 뒤에서 쓰지 않는다',
);
assert.ok(!/meta\.label/.test(card), '카드에 시각 없는 칸 이름이 남았다');

// 4) 받은 코스 화면은 같은 renderStepCard로 그린다
const recv = cut('function renderReceiverView(', '\nfunction ');
assert.ok(/renderStepCard\(step, i, \{ swappable: false, usedImages, hideSlot: Boolean\(blogSlug\) \}\)/.test(recv), '받은 코스가 renderStepCard를 쓰지 않는다');

// 5) 복사 글 칸 줄도 같은 함수
const copy = cut('async function formatCourseTextAsync', '\n}\n');
assert.ok(copy.includes('lines.push(`${i + 1}차 ${meta.emoji} ${slotLabelWithClock(step.slot)} ${spot.name}${catText}`);'), '복사 글 칸 줄이 slotLabelWithClock을 쓰지 않는다');
assert.ok(!/meta\.label/.test(copy), '복사 글에 시각 없는 칸 이름이 남았다');

console.log('ok 칸 표시 기준 시각 12');
