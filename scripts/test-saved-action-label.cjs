// 저장한 코스 동작 단추 이름 회귀 테스트(P-464): node scripts/test-saved-action-label.cjs
// savedCourseFirstSpotName을 src/main.ts에서 떼어 실행한다
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function savedCourseFirstSpotName');
assert(start >= 0, 'savedCourseFirstSpotName이 없다');
const end = src.indexOf('\n}\n', start) + 3;
const make = new Function('spotById', `${ts.transpile(src.slice(start, end), { target: 'es2022' })};return savedCourseFirstSpotName;`);
const first = make(new Map([['b', { name: '카멜커피' }], ['c', { name: '대림창고' }]]));
// 지워진 장소는 건너뛰고 남은 첫 장소 이름을 쓴다
assert.strictEqual(first({ spotIds: ['a', 'b', 'c'] }), '카멜커피');
assert.strictEqual(first({ spotIds: ['x'] }), '');
// 단추 이름에 첫 장소를 붙인다
assert.ok(src.includes("${firstSpotName ? `, ${firstSpotName}부터` : ''}"), '단추 이름에 첫 장소가 붙지 않는다');
console.log('ok saved action label');
