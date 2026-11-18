// 지역 랜딩과 마지막 코스 복원 시험(P-489): node scripts/test-landing-last-course.cjs
// 이 탭 마지막 코스는 랜딩·?r=&s= 진입의 지역이고 랜딩 시간대 칸을 품을 때만(P-490) 되살리고, 다르면 지우지 않고 건너뛰어 랜딩 값으로 시작하는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function applyDailyCourseIfEmpty(');
const fn = src.slice(start, src.indexOf('\n}\n', start));
const m = fn.match(/const sameEntry = ([\s\S]*?);\n/);
assert.ok(m, 'sameEntry 판정이 없다');

// 판정식을 그대로 꺼내 경우마다 돌린다
const sameEntry = new Function('entryArea', 'last', 'steps', `return ${m[1]};`);
const seoulDaily = { conditions: { regions: ['SEOUL'] } };
const daySteps = [{ slot: 'day' }, { slot: 'evening' }, { slot: 'night' }];
const nightSteps = [{ slot: 'night' }, { slot: 'night' }];
const none = { region: null, slot: null };
assert.strictEqual(sameEntry(none, seoulDaily, daySteps), true, '루트 진입은 마지막 코스를 그대로 되살려야 한다');
assert.strictEqual(sameEntry({ region: 'JEJU', slot: 'night' }, seoulDaily, daySteps), false, '다른 지역 코스가 랜딩을 덮는다');
assert.strictEqual(sameEntry({ region: 'SEOUL', slot: 'stay' }, seoulDaily, daySteps), false, '랜딩 시간대 칸이 없는 코스가 랜딩을 덮는다');
assert.strictEqual(sameEntry({ region: 'SEOUL', slot: 'night' }, seoulDaily, [{ slot: 'day' }, { slot: 'evening' }]), false, '랜딩 시간대 칸이 빠진 코스가 랜딩을 덮는다');
assert.strictEqual(sameEntry({ region: 'SEOUL', slot: 'night' }, seoulDaily, nightSteps), true, '같은 랜딩에서 만든 코스를 새로 고침에서 되살리지 않는다');
// P-490: 랜딩 첫 시간대가 기본 칸 ∪ 랜딩 시간대라 그 랜딩에서 만든 코스는 여러 시간대가 섞인다
assert.strictEqual(sameEntry({ region: 'SEOUL', slot: 'night' }, seoulDaily, daySteps), true, '같은 지역, 랜딩 시간대 칸을 품은 코스를 되살리지 않는다');
assert.strictEqual(sameEntry({ region: 'SEOUL', slot: 'stay' }, seoulDaily, [...daySteps, { slot: 'stay' }]), true, '숙박 랜딩에서 만든 코스를 되살리지 않는다');
assert.strictEqual(sameEntry({ region: 'JEJU', slot: null }, { conditions: { regions: ['JEJU', 'SEOUL'] } }, nightSteps), false, '여러 지역 코스가 한 지역 진입을 덮는다');
assert.strictEqual(sameEntry({ region: null, slot: 'night' }, seoulDaily, nightSteps), true, '?s=만 있는 진입에서 같은 시간대 코스를 되살리지 않는다');

// 복원 판정이 entryArea 검사보다 먼저 오고, 건너뛴 코스는 지우지 않는다
assert.ok(/if \(sameEntry && steps\.length > 0 && steps\.length === last\.ids\.length\) \{/.test(fn), '복원이 sameEntry를 거치지 않는다');
assert.ok(/if \(sameEntry\) try \{ sessionStorage\.removeItem\(LAST_COURSE_STORAGE_KEY\); \} catch \{\}/.test(fn), '랜딩 값과 달라 건너뛴 코스를 지운다');
assert.ok(fn.indexOf('const sameEntry') < fn.indexOf('state.course = steps'), '판정 전에 코스를 되살린다');
// 공유 #c= 화면은 이 함수 첫 줄에서 빠진다
assert.ok(/if \(state\.course \|\| location\.hash\.startsWith\('#c='\) \|\| spots\.length === 0\) return;/.test(fn), '공유 #c= 화면을 건너뛰지 않는다');

console.log('test-landing-last-course: 통과');
