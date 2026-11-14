// 영업시간 모름 문구 회귀 테스트(P-437): node scripts/test-hours-unknown-text.cjs
// 카드 영업시간 배지 분기와 hasNoHoursInfo를 src/main.ts에서 그대로 떼어 실행하고, 시트 연결은 소스 문자열로 확인한다
// 복사 글 줄은 test-copy-text-cache.cjs가 본다
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const decls = [cut('const HOURS_UNKNOWN_TEXT', ';\n'), cut('function hasNoHoursInfo', '\n}\n')].join('\n');
const cardBranch = cut("  const hoursLabel = isClosedToday ? '' : todayHoursLabel(spot);", '\n  }\n');
const card = new Function(
  'spot', 'isClosedToday', 'todayHoursLabel',
  `${ts.transpile(decls, { target: 'es2022' })};const metaBadges = [];${ts.transpile(cardBranch, { target: 'es2022' })};return metaBadges.join('').replace(/<[^>]+>/g, '');`,
);
const label = (spot) => (spot.business_hours?.영업시간 === '매일 11:00 ~ 22:00' ? '오늘 11:00~22:00' : '');

// 영업시간 원문이 없으면 카드에 정보 없음 배지
assert.strictEqual(card({}, false, label), '🕒 영업시간 정보 없음');
assert.strictEqual(card({ business_hours: {} }, false, label), '🕒 영업시간 정보 없음');
// 오늘 휴무 카드는 ⚠️ 배지가 있으므로 그리지 않는다
assert.strictEqual(card({}, true, label), '');
// 영업시간을 알면 시간만, 원문은 있으나 형식을 못 읽으면 아무것도 없음
assert.strictEqual(card({ business_hours: { 영업시간: '매일 11:00 ~ 22:00' } }, false, label), '🕒 오늘 11:00~22:00');
assert.strictEqual(card({ business_hours: { 영업시간: '평일 11:00 ~ 22:00' } }, false, label), '');
assert.strictEqual(card({ business_hours: { 휴무일: '월요일' } }, false, label), '');
assert.strictEqual(card({ is_24h: true }, false, () => '24시간'), '🕒 24시간');

// 시트는 영업시간 칸을 늘 그리고 원문이 없으면 같은 문구를 쓴다
assert.ok(src.includes("const shortItems = ['hours', parkingText"));
assert.ok(src.includes('${escapeHtml(hoursText || HOURS_UNKNOWN_TEXT)}'));
assert.ok(!src.includes('${hoursText || closedText ? `'), '시트가 영업시간 칸을 조건부로 그린다');
console.log('ok hours unknown text');
