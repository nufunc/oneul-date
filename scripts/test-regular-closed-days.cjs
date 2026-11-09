// 영업시간 요일에서 읽는 정기 휴무(P-338) 회귀 테스트: node scripts/test-regular-closed-days.cjs
// src/main.ts의 isSpotClosedToday와 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
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
const queue = ['isSpotClosedToday', 'regularClosedDays'];
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
const { regularClosedDays, isSpotClosedToday } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { regularClosedDays, isSpotClosedToday };`)();

const hours = (s, closed_days) => ({ business_hours: { 영업시간: s }, closed_days });
const week = (days) => days.map((d) => `${d} 11:00 ~ 21:00`).join(' / ');
// 2026-11-10은 화요일, 11-15는 일요일
const TUE = new Date(2026, 10, 10);
const SUN = new Date(2026, 10, 15);

// A 형식에서 한 요일이 빠지면 그 요일이 정기 휴무다
const noSun = hours(week(['월', '화', '수', '목', '금', '토']), []);
assert.deepStrictEqual(regularClosedDays(noSun), ['일요일']);
assert.strictEqual(isSpotClosedToday(noSun, SUN), true);
assert.strictEqual(isSpotClosedToday(noSun, TUE), false);
const noMonTue = hours(week(['수', '목', '금', '토', '일']), undefined);
assert.deepStrictEqual(regularClosedDays(noMonTue), ['월요일', '화요일']);
assert.strictEqual(isSpotClosedToday(noMonTue, TUE), true);

// 7요일이 모두 있으면 휴무가 없다
const all7 = hours(week(['월', '화', '수', '목', '금', '토', '일']), []);
assert.deepStrictEqual(regularClosedDays(all7), []);
assert.strictEqual(isSpotClosedToday(all7, TUE), false);

// 범위, 평일/주말, 나열 형식은 건드리지 않는다
for (const s of ['화~일 11:00 ~ 21:00', '평일 11:00 ~ 21:00 / 주말 12:00 ~ 20:00', '화·토 11:00 ~ 21:00', '매일 11:00 ~ 21:00']) {
  assert.deepStrictEqual(regularClosedDays(hours(s, [])), [], s);
  assert.strictEqual(isSpotClosedToday(hours(s, []), TUE), false, s);
}
// 한 구간이라도 A 형식이 아니면 건드리지 않는다
assert.deepStrictEqual(regularClosedDays(hours('화 11:00 ~ 21:00 / 평일 브레이크 15:00', [])), []);

// closed_days가 있는 행은 기존 판정 그대로다: 수요일 휴무로 적힌 행에 빠진 요일(일)을 더하지 않는다
const withClosed = hours(week(['월', '화', '수', '목', '금', '토']), ['수요일']);
assert.deepStrictEqual(regularClosedDays(withClosed), ['수요일']);
assert.strictEqual(isSpotClosedToday(withClosed, SUN), false);
// 요일 7개가 모두 든 closed_days는 수집 오류로 보고 무시하며 영업시간 규칙도 덧대지 않는다
assert.deepStrictEqual(regularClosedDays(hours(week(['월', '화', '수']), ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])), []);

// 용금옥 유형: 빠진 요일을 휴무로 보는 오탐이 남는다는 것을 알리는 표본이다(패널은 일요일 영업)
const yonggeumok = hours(week(['월', '화', '수', '목', '금', '토']), []);
assert.strictEqual(isSpotClosedToday(yonggeumok, SUN), true);

// 영업시간이 없거나 이용시간 키만 있어도 깨지지 않는다
assert.deepStrictEqual(regularClosedDays({}), []);
assert.deepStrictEqual(regularClosedDays({ business_hours: {} }), []);
assert.deepStrictEqual(regularClosedDays({ business_hours: { 이용시간: week(['월', '화', '수', '목', '금', '토']) } }), ['일요일']);
// 같은 문자열은 저장한 결과를 돌려준다
assert.strictEqual(regularClosedDays(noSun), regularClosedDays(hours(week(['월', '화', '수', '목', '금', '토']), [])));

console.log('PASS test-regular-closed-days');
