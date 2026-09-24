// parsePriceRangeWon 회귀 테스트: node scripts/test-price-parser.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function parsePriceRangeWon');
const end = src.indexOf('\n}\n', start) + 3;
const parse = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return parsePriceRangeWon;`)();

const CASES = [
  ['디너 코스 190,000원', [190000, 190000]],
  ['2~4만원대', [20000, 40000]],
  ['1인 45,000원', [45000, 45000]],
  ['9,000원', [9000, 9000]],
  ['1.5만원', [15000, 15000]],
  ['5천원', [5000, 5000]],
  ['런치 45,000원 / 디너 150,000원', [45000, 150000]],
  ['성인 입장권 31,000원, 패스트패스 50,000원', [31000, 50000]],
  ['무료', null],
  ['', null],
];

let failed = 0;
for (const [input, expected] of CASES) {
  const actual = parse(input);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL ${JSON.stringify(input)}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
