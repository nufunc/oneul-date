// 토스트 표시 시간 회귀 테스트(P-440): node scripts/test-toast-duration.cjs
// toastDuration을 src/main.ts에서 그대로 떼어 실행한다(앱 번들과 같은 코드)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function toastDuration');
assert(start >= 0, 'src/main.ts에 toastDuration이 없다');
const end = src.indexOf('\n}\n', start) + 3;
const toastDuration = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return toastDuration;`)();

// 짧은 문구는 이전과 같은 2.2초
assert.strictEqual(toastDuration('저장했어요'), 2200);
// P-431 교체 소진 문구는 2.2초보다 길게
assert.ok(toastDuration('이 조건의 장소를 모두 보여 드렸어요. 처음부터 다시 보여 드려요') > 3000);
// 아주 긴 문구도 7초에서 멈춘다
assert.strictEqual(toastDuration('가'.repeat(200)), 7000);
// 공백은 세지 않는다
assert.strictEqual(toastDuration('가 나 다'), toastDuration('가나다'));
// showToast가 이 함수를 쓴다
assert.ok(src.includes('}, toastDuration(msg));'));
console.log('ok toast duration');
