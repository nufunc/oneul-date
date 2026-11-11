// 코스 카드 오늘 영업시간 배지(P-372) 회귀 테스트: node scripts/test-today-hours.cjs
// src/main.ts의 todayHoursLabel과 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
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
const queue = ['todayHoursLabel'];
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
const { todayHoursLabel } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { todayHoursLabel };`)();

const sp = (s, extra = {}) => ({ business_hours: { 영업시간: s }, ...extra });
// 2026-11-10은 화요일
const TUE = new Date(2026, 10, 10);
const label = (s, extra) => todayHoursLabel(sp(s, extra), TUE);

// 1. 매일
assert.strictEqual(label('매일 10:30 ~ 20:00'), '오늘 10:30~20:00');
// 2. 요일 나열은 오늘(화) 구간만
assert.strictEqual(label('월 11:00 ~ 22:00 / 화 12:00 ~ 21:00 / 수 11:00 ~ 22:00'), '오늘 12:00~21:00');
// 3. 시간만
assert.strictEqual(label('11:00~22:00'), '오늘 11:00~22:00');
// 4. 상시 개방과 is_24h
assert.strictEqual(label('상시 개방'), '24시간');
assert.strictEqual(todayHoursLabel({ is_24h: true }, TUE), '24시간');
// 5. 해석하지 못하는 형식은 빈 문자열
assert.strictEqual(label('평일 11:00 ~ 22:00 / 주말 휴무'), '');
assert.strictEqual(label('월~금 11:00 ~ 22:00'), '');
assert.strictEqual(label('3월~10월 09:00 ~ 18:00'), '');
assert.strictEqual(todayHoursLabel({}, TUE), '');
// 6. 오늘 요일이 목록에 없으면 빈 문자열
assert.strictEqual(label('월 11:00 ~ 22:00 / 수 11:00 ~ 22:00'), '');
// 이용시간 키도 읽는다
assert.strictEqual(todayHoursLabel({ business_hours: { 이용시간: '매일 09:00 ~ 18:00' } }, TUE), '오늘 09:00~18:00');

console.log('test-today-hours: ok');
