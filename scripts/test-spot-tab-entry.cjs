// 탐색 탭 진입 상태 회귀 테스트: node scripts/test-spot-tab-entry.cjs
// spotTabEntry를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 다른 탭에서 돌아오면 정렬·페이지를 유지하고, 탐색 중 다시 누르면 처음으로, 검색어를 새로 옮겨 오면 1페이지다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function spotTabEntry');
assert(start >= 0, 'src/main.ts에 function spotTabEntry가 없다');
const code = src.slice(start, src.indexOf('\n}\n', start) + 3);
const spotTabEntry = new Function(`${ts.transpile(code, { target: 'es2022' })};return spotTabEntry;`)();

const browsed = { spotSort: 'popular', spotPage: 3, spotSearchQuery: '' };

// 다른 탭에서 복귀: 유지
assert.deepStrictEqual(spotTabEntry({ ...browsed, mainMode: 'course' }, ''), browsed);
// 코스 검색어가 있어도 탐색 검색어가 이미 있으면 옮기지 않고 유지
assert.deepStrictEqual(
  spotTabEntry({ ...browsed, spotSearchQuery: '성수', mainMode: 'course' }, '홍대'),
  { ...browsed, spotSearchQuery: '성수' },
);
// 탐색 중 재선택: 거리순·1페이지
assert.deepStrictEqual(
  spotTabEntry({ ...browsed, mainMode: 'spots' }, ''),
  { spotSort: 'distance', spotPage: 1, spotSearchQuery: '' },
);
// 검색어 새로 옮김: 1페이지, 정렬은 유지
assert.deepStrictEqual(
  spotTabEntry({ ...browsed, mainMode: 'course' }, '홍대'),
  { spotSort: 'popular', spotPage: 1, spotSearchQuery: '홍대' },
);

console.log('test-spot-tab-entry: 4건 통과');
