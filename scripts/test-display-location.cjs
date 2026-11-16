// 코스 카드 위치줄 회귀 테스트: node scripts/test-display-location.cjs
// getDisplayLocation과 spotSido를 src/main.ts에서 그대로 떼어 실행한다.
// 정식 도 이름('경상남도')도 약칭('경남')과 같은 위치줄이 되어 '경상 거제시'처럼 남북이 사라지지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const code = [cut('function spotSido'), cut('function getDisplayLocation')].join('\n');
const { getDisplayLocation } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { getDisplayLocation };`)();
const loc = (address) => getDisplayLocation({ address });

assert.strictEqual(loc('경상남도 거제시 일운면 와현리 1'), '경남 거제시');
assert.strictEqual(loc('경남 거제시 일운면 와현리 1'), '경남 거제시');
assert.strictEqual(loc('충청북도 청주시 상당구 용암동 1'), '충북 청주시 상당구');
assert.strictEqual(loc('전라남도 여수시 돌산읍 1'), '전남 여수시');
assert.strictEqual(loc('강원특별자치도 강릉시 교동 1'), '강원 강릉시');
assert.strictEqual(loc('서울특별시 성동구 성수동 1'), '서울 성동구');
assert.strictEqual(loc('서울 성동구 성수동 1'), '서울 성동구');
console.log('test-display-location: ok');
