// 저장한 매거진 코스의 칸 표시 회귀 테스트: node scripts/test-saved-blog-course-slot.cjs (P-549)
// 받은 화면(매거진 코스)은 칸 표시를 뺀다(P-484). 그 코스를 저장해 다시 열 때도 카드·목록 칸·복사 글이 같은 규칙을 따르는지 본다
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

// 1. 목록 칸: blogSlug 항목은 slot 이모지 대신 📍, 일반 항목은 그대로
const stubs = {
  spotById: new Map([
    [1, { id: 1, name: '미술관', slot: 'day' }],
    [2, { id: 2, name: '찻집', slot: 'evening' }],
  ]),
  SLOT_META: { day: { emoji: '☀️' }, evening: { emoji: '🌆' } },
  escapeHtml: (s) => s,
  fullSpotsPending: false,
  spotsWaitLabel: () => '',
};
const { savedCourseSpotsHtml } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(cut('function savedCourseSpotsHtml', '\n}\n'), { target: 'es2022' })};return { savedCourseSpotsHtml };`,
)(...Object.values(stubs));
const emojis = (html) => [...html.matchAll(/saved-step-emoji">([^<]*)</g)].map((m) => m[1]);
assert.deepStrictEqual(emojis(savedCourseSpotsHtml({ spotIds: [1, 2], conditions: {} })), ['☀️', '🌆']);
assert.deepStrictEqual(emojis(savedCourseSpotsHtml({ spotIds: [1, 2], conditions: {}, blogSlug: 'jeongdong' })), ['📍', '📍']);

// 2. 받은 화면 저장이 blogSlug를 남긴다
const receiver = cut("receiverSave?.addEventListener('click'", 'saveCourseWithToast(item);');
assert.ok(/blogSlug: blogSlug \?\? undefined/.test(receiver), '받은 화면 저장에 blogSlug가 없다');

// 3. 불러오기가 조건에 blogSlug를 옮기고, 결과 카드·🔄 교체 카드·결과 복사가 hideSlot을 쓴다
assert.ok(/blogSlug: item\.blogSlug/.test(cut('function restoreCourse', '\n}\n')), 'restoreCourse가 blogSlug를 옮기지 않는다');
assert.ok(/renderStepCard\(step, i, \{ usedImages, hideSlot: Boolean\(cond\.blogSlug\) \}\)/.test(src), '결과 카드에 hideSlot이 없다');
assert.ok(/renderStepCard\(state\.course\[index\], index, \{ usedImages, hideSlot: Boolean\(state\.courseConditions\?\.blogSlug\) \}\)/.test(src), '교체 카드에 hideSlot이 없다');
assert.ok(/Boolean\(state\.courseConditions\.blogSlug\),\s*\);/.test(src), '결과 화면 복사에 hideSlot이 없다');

// 4. 저장한 코스 📋 복사가 hideSlot을 넘긴다
const savedCopy = cut("querySelectorAll<HTMLButtonElement>('.saved-item-copy')", 'copyOrShowText');
assert.ok(/Boolean\(item\.blogSlug\),\s*\);/.test(savedCopy), '저장한 코스 복사에 hideSlot이 없다');

// 5. 결과 화면에서 다시 저장해도 출처가 남는다
assert.ok(/title: courseTitle\(state\.courseConditions, state\.course\),\s*blogSlug: state\.courseConditions\.blogSlug,/.test(src), '결과 저장에 blogSlug가 없다');

console.log('test-saved-blog-course-slot: ok');
