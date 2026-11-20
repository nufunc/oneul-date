// 장소 중심 코스의 영업시간 있는 곳 우선 회귀 테스트: node scripts/test-anchor-course-known-hours.cjs
// buildAnchorCourse는 pickNearRandom을 거치지 않으므로 앵커 밖 칸에도 preferKnownHours를 따로 건다(P-531 후속).
// buildAnchorCourse와 그 함수가 부르는 선언을 src/main.ts에서 떼어 실행하고, 전역 spots·state는 주입한다
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
const INJECT = ['spots', 'state'];
const need = new Set();
const queue = ['buildAnchorCourse'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name) || INJECT.includes(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  if (decls.has(name)) walk(decls.get(name));
}
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const make = new Function('rawSpotsData', ...INJECT, `${ts.transpile(code, { target: 'es2022' })};return buildAnchorCourse;`);

const HOURS = { mon: '10:00-22:00' };
const spot = (id, slot, lat, lng, hours, extra = {}) => ({
  id, name: `장소${id}`, slot, region: 'SEOUL', area: '마포구', category: '카페', categoryKey: 'cafe',
  lat, lng, business_hours: hours, ...extra,
});
const state = { slots: { day: true, evening: true, night: true, stay: false } };

// 좌표 있는 앵커: 저녁 칸 8km 안에 영업시간 없는 가까운 두 곳과 있는 조금 먼 한 곳
const anchor = spot(1, 'day', 37.55, 126.92, HOURS);
const withCoords = [
  anchor,
  spot(2, 'evening', 37.551, 126.921, null),
  spot(3, 'evening', 37.552, 126.922, null),
  spot(4, 'evening', 37.56, 126.93, HOURS),
  spot(5, 'night', 37.553, 126.923, HOURS),
];
const build1 = make([], withCoords, state);
for (let i = 0; i < 200; i++) {
  const ev = build1(anchor).find((s) => s.slot === 'evening');
  assert.strictEqual(ev.spotId, 4, `좌표 있는 앵커 ${i}회: 영업시간 없는 ${ev.spotId}을 뽑았다`);
}

// 영업시간 있는 후보가 없으면 지금처럼 칸을 채운다
const noneKnown = [anchor, spot(2, 'evening', 37.551, 126.921, null), spot(5, 'night', 37.553, 126.923, HOURS)];
const build2 = make([], noneKnown, state);
for (let i = 0; i < 50; i++) assert.strictEqual(build2(anchor).find((s) => s.slot === 'evening').spotId, 2, '있는 후보가 없으면 빈 칸으로 남겼다');

// 좌표 없는 앵커: 같은 구 후보 가운데 영업시간 있는 곳
const anchorNoCoords = spot(10, 'day', null, null, HOURS);
const sameArea = [anchorNoCoords, spot(11, 'evening', null, null, null), spot(12, 'evening', null, null, HOURS), spot(13, 'night', null, null, HOURS)];
const build3 = make([], sameArea, state);
for (let i = 0; i < 200; i++) {
  const ev = build3(anchorNoCoords).find((s) => s.slot === 'evening');
  assert.strictEqual(ev.spotId, 12, `좌표 없는 앵커 ${i}회: 영업시간 없는 ${ev.spotId}을 뽑았다`);
}

console.log('ok 장소 중심 코스 영업시간 우선 3');
