// 찜 코스 빈 칸 채우기의 영업시간 있는 곳 우선 시험: node scripts/test-saved-course-known-hours.cjs
// buildCourseFromSavedSpots는 렌더와 상태를 함께 바꿔 통째로 실행하기 어렵다. 채움 줄의 형태를 확인하고,
// 그 줄이 쓰는 preferKnownHours를 떼어 가까운 3곳 안에서의 고르기를 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const body = src.slice(src.indexOf('function buildCourseFromSavedSpots('), src.indexOf('function buildAnchorCourse('));
assert.ok(body.includes('place(slot, preferKnownHours(candidates.slice(0, 3))[0]);'), '찜 코스 채움 칸이 영업시간 있는 곳을 먼저 고르지 않는다');

const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const get = (name) => sf.statements.find((st) => ts.isFunctionDeclaration(st) && st.name?.text === name);
const js = ['hasNoHoursInfo', 'preferKnownHours'].map((n) => ts.transpile(get(n).getText(), { target: 'es2022' })).join('\n');
const preferKnownHours = new Function(`${js}\nreturn preferKnownHours;`)();

const s = (id, hours) => ({ id, business_hours: hours });
const pick = (sorted) => preferKnownHours(sorted.slice(0, 3))[0].id;
assert.strictEqual(pick([s(1, null), s(2, { mon: '10:00-22:00' }), s(3, null)]), 2, '가까운 3곳 안의 영업시간 있는 곳');
assert.strictEqual(pick([s(1, null), s(2, null), s(3, null), s(4, { mon: '10:00-22:00' })]), 1, '4번째는 멀어 가장 가까운 곳 유지');
assert.strictEqual(pick([s(1, { mon: '10:00-22:00' }), s(2, { mon: '10:00-22:00' })]), 1, '둘 다 있으면 가까운 곳');
console.log('ok 찜 코스 채움 칸 영업시간 우선 3');
