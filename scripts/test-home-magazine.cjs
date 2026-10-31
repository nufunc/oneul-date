// 루트 매거진 블록 빌드 결과 시험: npm run build 뒤 node scripts/test-home-magazine.cjs
// dist/index.html에만 블록이 하나 있고 글 링크 4개와 목록 링크 1개가 있는지, 지역 랜딩에는 없는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const root = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const landing = fs.readFileSync(path.join(dist, 'seoul', 'day', 'index.html'), 'utf8');

assert.strictEqual(root.match(/id="home-magazine"/g)?.length, 1, '루트에 매거진 블록이 1개가 아니다');
const section = root.slice(root.indexOf('id="home-magazine"'), root.indexOf('</section>', root.indexOf('id="home-magazine"')));
assert.strictEqual(section.match(/href="\.\/blog\/[a-z0-9-]+\/"/g)?.length, 4, '글 링크가 4개가 아니다');
assert.strictEqual(section.match(/href="\.\/blog\/"/g)?.length, 1, '매거진 목록 링크가 1개가 아니다');
// 블록은 #app 앞에 있어야 앱이 innerHTML을 갈아 끼워도 남는다
assert.ok(root.indexOf('id="home-magazine"') < root.indexOf('<div id="app"></div>'), '블록이 #app 앞에 없다');
assert.ok(!landing.includes('home-magazine'), '지역 랜딩에 매거진 블록이 있다');
console.log('ok home-magazine');
