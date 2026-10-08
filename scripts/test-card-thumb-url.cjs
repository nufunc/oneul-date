// toCardThumbUrl 회귀 테스트: node scripts/test-card-thumb-url.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function toCardThumbUrl');
const end = src.indexOf('\n}\n', start) + 3;
const toThumb = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return toCardThumbUrl;`)();

const wrap = (u) => `https://img1.daumcdn.net/thumb/R400x400/?fname=${encodeURIComponent(u)}`;
const K = 'https://t1.kakaocdn.net/mystore/BEFA474F?x=1&y=2';
const D = 'http://t1.daumcdn.net/local/kakaomapPhoto/review/abc?original';
const CASES = [
  ['kakaocdn', K, wrap(K)],
  ['daumcdn http', D, wrap(D)],
  ['visitkorea 유지', 'https://tong.visitkorea.or.kr/cms/a.jpg', 'https://tong.visitkorea.or.kr/cms/a.jpg'],
  ['unsplash 유지', 'https://images.unsplash.com/photo-1?w=800', 'https://images.unsplash.com/photo-1?w=800'],
  ['호스트 접두 위장 유지', 'https://t1.kakaocdn.net.evil.com/a.jpg', 'https://t1.kakaocdn.net.evil.com/a.jpg'],
  ['다른 daumcdn 서브도메인 유지', 'https://img1.daumcdn.net/thumb/x.jpg', 'https://img1.daumcdn.net/thumb/x.jpg'],
];

let failed = 0;
for (const [label, input, expected] of CASES) {
  const actual = toThumb(input);
  if (actual !== expected) {
    failed++;
    console.error(`FAIL ${label}: ${actual} != ${expected}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
