// getInstagramUrl 회귀 테스트: node scripts/test-instagram-url.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function getInstagramUrl');
const end = src.indexOf('\n}\n', start) + 3;
const getUrl = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return getInstagramUrl;`)();

const PROFILE = 'https://www.instagram.com/some_cafe/';
const CASES = [
  ['프로필 주소: 그대로', { social_links: { instagram: { url: PROFILE } } }, PROFILE],
  ['검색 주소: 링크 없음', { social_links: { instagram: { url: 'https://www.instagram.com/search/?q=가게' } } }, null],
  ['게시물 주소: 링크 없음', { social_links: { instagram: { url: 'https://www.instagram.com/p/ABC123/' } } }, null],
  ['source가 게시물 주소: 링크 없음', { source: { url: 'https://www.instagram.com/p/ABC123/' } }, null],
  ['social이 검색이고 source가 프로필: source 프로필', { social_links: { instagram: { url: 'https://www.instagram.com/search/?q=a' } }, source: { url: PROFILE } }, PROFILE],
  ['없음: 링크 없음', {}, null],
];

let failed = 0;
for (const [label, spot, expected] of CASES) {
  const actual = getUrl(spot);
  if (actual !== expected) {
    failed++;
    console.error(`FAIL ${label}: ${actual} != ${expected}`);
  }
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
