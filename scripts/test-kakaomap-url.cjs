// getKakaomapUrl 회귀 테스트: node scripts/test-kakaomap-url.cjs
// 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function getKakaomapUrl');
const end = src.indexOf('\n}\n', start) + 3;
const mapQuery = (s) => s.name; // 좌표 없는 장소의 검색어 링크는 mapQuery 결과를 그대로 쓰는지만 본다
const getUrl = new Function('mapQuery', `${ts.transpile(src.slice(start, end), { target: 'es2022' })};return getKakaomapUrl;`)(mapQuery);

const ID = 'https://place.map.kakao.com/1227629811';
const SEARCH = (n) => `https://map.kakao.com/link/search/${encodeURIComponent(n)}`;
const CASES = [
  ['id 있음 + 좌표 있음: id 링크 유지', { name: '가게', lat: 37.5, lng: 127.1, social_links: { kakaomap: { url: ID } } }, ID],
  ['id 없음(검색어 저장) + 좌표 있음: 좌표 핀 링크', { name: '뜰아래석등', lat: 37.55, lng: 127.02, social_links: { kakaomap: { url: SEARCH('뜰아래석등') } } }, `https://map.kakao.com/link/map/${encodeURIComponent('뜰아래석등')},37.55,127.02`],
  ['저장값 없음 + 좌표 있음: 좌표 핀 링크', { name: '테라스룸 청담', lat: 37.52, lng: 127.05 }, `https://map.kakao.com/link/map/${encodeURIComponent('테라스룸 청담')},37.52,127.05`],
  ['쉼표 든 이름: 쉼표는 %2C', { name: '카페, 하루', lat: 37.5, lng: 127 }, 'https://map.kakao.com/link/map/%EC%B9%B4%ED%8E%98%2C%20%ED%95%98%EB%A3%A8,37.5,127'],
  ['슬래시 든 이름: 슬래시는 %2F', { name: 'A/B', lat: 37.5, lng: 127 }, 'https://map.kakao.com/link/map/A%2FB,37.5,127'],
  ['id 없음 + 좌표 없음 + 저장값 있음: 저장값 유지', { name: '가게', social_links: { kakaomap: { url: SEARCH('가게') } } }, SEARCH('가게')],
  ['둘 다 없음: 검색어 링크', { name: '가게' }, SEARCH('가게')],
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
