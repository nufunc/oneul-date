// 찜 코스가 열린 찜을 먼저 고르는지 회귀 테스트(P-424): node scripts/test-saved-course-open.cjs
// src/main.ts의 buildCourseFromSavedSpots와 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다.
// 화면과 상태(state, spotById, renderResults 등)는 가짜로 넘긴다
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

const ctx = { state: {}, spotById: new Map(), toasts: [] };
const { buildCourseFromSavedSpots } = new Function(
  'ctx',
  `let state = ctx.state, spotById = ctx.spotById, spots = [], prevCourse = null;
   const showToast = (m) => ctx.toasts.push(m), updateModeView = () => {}, renderResults = () => {}, scrollMotion = () => 'auto';
   const app = { scrollIntoView() {} };
   const getCandidates = () => [];
   ${ts.transpile(code, { target: 'es2022' })};
   return { buildCourseFromSavedSpots };`,
)(ctx);

// 같은 동네에 모인 찜. 저녁 칸에 맞는 찜 둘: 하나는 18:00 마감(19시 닫힘), 하나는 22:00 마감
let id = 1;
const sp = (slot, hours, extra = {}) => ({ id: id++, name: `s${id}`, slot, lat: 37.5, lng: 127.0, region: 'SEOUL', area: '종로구', business_hours: { 영업시간: hours }, ...extra });
const run = (list) => {
  ctx.spotById.clear();
  list.forEach((s) => ctx.spotById.set(s.id, s));
  Object.assign(ctx.state, { savedSpotIds: new Set(list.map((s) => s.id)), regions: [], subZones: [], mood: 'ALL', indoorOnly: false, course: [] });
  assert.strictEqual(buildCourseFromSavedSpots(), true);
  return ctx.state.course;
};

// 저장 순서상 닫힌 찜이 먼저여도 열린 찜을 고른다
{
  const day = sp('day', '매일 10:00 ~ 22:00');
  const eveClosed = sp('evening', '매일 11:00 ~ 18:00');
  const eveOpen = sp('evening', '매일 11:00 ~ 22:00');
  const night = sp('night', '매일 18:00 ~ 02:00');
  const course = run([day, eveClosed, eveOpen, night]);
  assert.strictEqual(course.find((s) => s.slot === 'evening').spotId, eveOpen.id);
}

// 오늘 정기휴무인 찜도 뒤로 민다
{
  const today = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
  const dayClosed = sp('day', '', { closed_days: [`${today}요일`] });
  const dayOpen = sp('day', '매일 10:00 ~ 22:00');
  const course = run([dayClosed, dayOpen]);
  assert.strictEqual(course.find((s) => s.slot === 'day').spotId, dayOpen.id);
}

// 칸에 맞는 찜이 모두 닫혔으면 기존대로 닫힌 찜을 넣어 칸을 비우지 않는다
{
  const day = sp('day', '매일 10:00 ~ 22:00');
  const eveClosed = sp('evening', '매일 11:00 ~ 18:00');
  const course = run([day, eveClosed]);
  assert.strictEqual(course.find((s) => s.slot === 'evening').spotId, eveClosed.id);
}

console.log('test-saved-course-open: ok');
