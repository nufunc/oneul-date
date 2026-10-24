// saveButtonLabels 회귀 테스트: node scripts/test-save-button-labels.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function saveButtonLabels');
const end = src.indexOf('\n}\n', start) + 3;
const labels = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return saveButtonLabels;`)();

const CASES = [
  ['담기 전', ['서촌 카페', false], { label: '서촌 카페 보관함에 담기', title: '보관함에 담기' }],
  ['담은 뒤', ['서촌 카페', true], { label: '서촌 카페 보관함에서 제외', title: '보관함에서 제외' }],
];

let failed = 0;
for (const [name, args, expected] of CASES) {
  const actual = labels(...args);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
