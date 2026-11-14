// 찜 코스 칸 배정 두 단계와 완성 알림 회귀 테스트(P-429): node scripts/test-saved-course-slots.cjs
// src/main.ts의 buildCourseFromSavedSpots와 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다.
// 화면과 상태(state, spotById, renderResults 등)는 가짜로 넘기고 getCandidates는 주어진 후보 배열을 돌려준다
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
const STUBS = ['state', 'spotById', 'spots', 'showToast', 'updateModeView', 'app', 'scrollMotion', 'renderResults', 'getCandidates', 'prevCourse'];
const need = new Set();
const queue = ['buildCourseFromSavedSpots'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name) || STUBS.includes(name)) continue;
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

const ctx = { state: {}, spotById: new Map(), toasts: [], candidates: [] };
const { buildCourseFromSavedSpots } = new Function(
  'ctx',
  `let state = ctx.state, spotById = ctx.spotById, spots = [], prevCourse = null;
   const showToast = (m) => ctx.toasts.push(m), updateModeView = () => {}, renderResults = () => {}, scrollMotion = () => 'auto';
   const app = { scrollIntoView() {} };
   const getCandidates = () => ctx.candidates;
   ${ts.transpile(code, { target: 'es2022' })};
   return { buildCourseFromSavedSpots };`,
)(ctx);

let id = 1;
const sp = (slot, hours, extra = {}) => ({ id: id++, name: `s${id}`, slot, lat: 37.5, lng: 127.0, region: 'SEOUL', area: '종로구', business_hours: { 영업시간: hours }, ...extra });
const run = (saved, candidates = []) => {
  ctx.spotById.clear();
  ctx.toasts.length = 0;
  ctx.candidates = candidates;
  [...saved, ...candidates].forEach((s) => ctx.spotById.set(s.id, s));
  Object.assign(ctx.state, { savedSpotIds: new Set(saved.map((s) => s.id)), regions: [], subZones: [], mood: 'ALL', indoorOnly: false, course: [] });
  assert.strictEqual(buildCourseFromSavedSpots(), true);
  return Object.fromEntries(ctx.state.course.map((s) => [s.slot, s.spotId]));
};
const today = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];

// 밤 찜 하나만 있으면 낮 칸이 아니라 밤 칸에 들어간다
{
  const night = sp('night', '매일 10:00 ~ 02:00');
  const c = run([night]);
  assert.strictEqual(c.night, night.id);
  assert.notStrictEqual(c.day, night.id);
  assert.strictEqual(ctx.toasts[0], '❤️ 찜 1곳으로 코스를 만들었어요');
}

// 저녁 찜이 둘이면 남는 하나는 그 시각에 열린 경우에만 다른 칸에 들어간다
{
  const eveA = sp('evening', '매일 11:00 ~ 22:00');
  const eveB = sp('evening', '매일 17:00 ~ 22:00');
  const c = run([eveA, eveB]);
  assert.ok([eveA.id, eveB.id].includes(c.evening));
  assert.notStrictEqual(c.day, eveB.id);
  assert.strictEqual(ctx.toasts[0], '❤️ 찜 2곳 중 1곳으로 코스를 만들었어요');
}

// 숙박 찜만 있으면 숙소를 기준점으로 근처 후보를 고르고 숙소를 코스에 남긴다
{
  const stay = sp('stay', '', { lat: 33.45, lng: 126.56, region: '제주', area: '제주시' });
  const farDay = sp('day', '매일 10:00 ~ 22:00', { lat: 37.27, lng: 127.43, region: '경기', area: '이천시' });
  const nearDay = sp('day', '매일 10:00 ~ 22:00', { lat: 33.46, lng: 126.55, region: '제주', area: '제주시' });
  const c = run([stay], [farDay, nearDay]);
  assert.strictEqual(c.stay, stay.id);
  assert.strictEqual(c.day, nearDay.id);
}

// 오늘 휴무 찜만 남으면 넣되 알림에 휴무를 밝힌다
{
  const dayClosed = sp('day', '', { closed_days: [`${today}요일`] });
  const c = run([dayClosed]);
  assert.strictEqual(c.day, dayClosed.id);
  assert.strictEqual(ctx.toasts[0], '❤️ 찜 1곳으로 코스를 만들었어요. 오늘 휴무인 찜 1곳이 들어 있어요');
}

console.log('test-saved-course-slots: ok');
