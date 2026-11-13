// 칸의 대표 시각(낮 13, 저녁 19, 밤 21)과 영업시간 대조(P-340) 회귀 테스트: node scripts/test-slot-hours.cjs
// src/main.ts의 isOpenAtSlotClock과 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const need = new Set();
const queue = ['isOpenAtSlotClock'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const { isOpenAtSlotClock } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { isOpenAtSlotClock };`)();

const sp = (s, extra = {}) => ({ business_hours: { 영업시간: s }, ...extra });
// 2026-11-10은 화요일, 11-11은 수요일
const TUE = new Date(2026, 10, 10);
const WED = new Date(2026, 10, 11);
const open = (s, slot, d = TUE, extra) => isOpenAtSlotClock(sp(s, extra), slot, d);

// 18:00 마감은 저녁(19시)과 밤 칸에서 거르고 낮 칸은 남긴다
assert.strictEqual(open('매일 11:00 ~ 18:00', 'day'), true);
assert.strictEqual(open('매일 11:00 ~ 18:00', 'evening'), false);
assert.strictEqual(open('매일 11:00 ~ 18:00', 'night'), false);
assert.strictEqual(open('11:00~18:00', 'evening'), false);
// 열기 전이면 거른다
assert.strictEqual(open('14:00 ~ 22:00', 'day'), false);
assert.strictEqual(open('14:00 ~ 22:00', 'evening'), true);

// 자정 넘김
assert.strictEqual(open('18:00 ~ 02:00', 'evening'), true);
assert.strictEqual(open('18:00 ~ 02:00', 'night'), true);
assert.strictEqual(open('18:00 ~ 02:00', 'day'), false);
assert.strictEqual(open('00:00 ~ 00:00', 'night'), true);
// 전날 구간이 오늘 낮까지 이어지는 경우(화 14:00 ~ 다음 날 14:00)
assert.strictEqual(open('월 14:00 ~ 14:00 / 화 15:00 ~ 16:00', 'day'), true);
assert.strictEqual(open('월 14:00 ~ 14:00 / 수 15:00 ~ 16:00', 'day', WED), false);

// 저녁과 밤 칸은 칸 시각 뒤 60분 더 열려 있어야 한다(P-425). 낮 칸은 칸 시각 한 점만 본다
assert.strictEqual(open('매일 11:00 ~ 20:00', 'evening'), false);
assert.strictEqual(open('매일 11:00 ~ 20:01', 'evening'), true);
assert.strictEqual(open('매일 10:00 ~ 19:30', 'evening'), false);
assert.strictEqual(open('18:00 ~ 22:00', 'night'), false);
assert.strictEqual(open('18:00 ~ 22:30', 'night'), true);
assert.strictEqual(open('매일 09:00 ~ 13:30', 'day'), true);
// 전날 구간이 넘어온 새벽에도 같은 여유를 본다(월 23:00 ~ 화 22:00은 화 21시 밤 칸에 60분이 모자란다)
assert.strictEqual(open('월 23:00 ~ 22:00 / 화 10:00 ~ 12:00', 'night'), false);
assert.strictEqual(open('월 23:00 ~ 22:30 / 화 10:00 ~ 12:00', 'night'), true);

// 7요일 목록은 그날 요일 구간만 본다
const week = '월 11:00 ~ 21:00 / 화 11:00 ~ 18:00 / 수 11:00 ~ 23:00 / 목 11:00 ~ 21:00 / 금 11:00 ~ 21:00 / 토 11:00 ~ 21:00 / 일 11:00 ~ 21:00';
assert.strictEqual(open(week, 'evening', TUE), false);
assert.strictEqual(open(week, 'evening', WED), true);
assert.strictEqual(open(week, 'night', WED), true);
assert.strictEqual(open(week, 'night', TUE), false);
// 오늘 요일이 목록에 없으면 정기휴무 판정 몫이라 여기서는 거르지 않는다
assert.strictEqual(open('월 11:00 ~ 18:00 / 수 11:00 ~ 18:00', 'night', TUE), true);

// 상시 개방과 is_24h는 거르지 않는다
assert.strictEqual(open('상시 개방', 'night'), true);
assert.strictEqual(open('', 'night', TUE, { is_24h: true }), true);
assert.strictEqual(isOpenAtSlotClock(sp('11:00 ~ 18:00', { is_24h: true }), 'night', TUE), true);

// 형식 밖 문자열, 영업시간 없음, 숙박 칸은 거르지 않는다
for (const s of ['[하절기] 09:00 ~ 18:00', '평일 11:00 ~ 18:00 / 주말 12:00 ~ 20:00', '화~일 11:00 ~ 18:00', '월 11:00 ~ 18:00 / 브레이크 15:00', '매일 입장 마감 17:30', '매일 11:00 ~ 18:00 (라스트오더 17:00)']) {
  for (const slot of ['day', 'evening', 'night']) assert.strictEqual(open(s, slot), true, `${s} ${slot}`);
}
assert.strictEqual(isOpenAtSlotClock({ business_hours: {} }, 'night', TUE), true);
assert.strictEqual(isOpenAtSlotClock({}, 'night', TUE), true);
assert.strictEqual(open('매일 11:00 ~ 18:00', 'stay'), true);

console.log('test-slot-hours: ok');
