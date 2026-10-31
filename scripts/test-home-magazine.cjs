// 루트 매거진 블록 빌드 결과 시험: npm run build 뒤 node scripts/test-home-magazine.cjs
// dist/index.html에만 블록이 하나 있고 글 링크 4개와 목록 링크 1개가 있는지, 지역 랜딩에는 없는지 본다
// 지역 랜딩 링크 목록도 루트에만 하나 있고 링크 32개가 모두 dist의 실제 랜딩을 가리키는지 본다
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

assert.strictEqual(root.match(/id="home-regions"/g)?.length, 1, '루트에 지역 링크 목록이 1개가 아니다');
const nav = root.slice(root.indexOf('id="home-regions"'), root.indexOf('</nav>', root.indexOf('id="home-regions"')));
const regionLinks = [...nav.matchAll(/href="\.\/([a-z]+)\/(day|evening|night|stay)\/"/g)];
assert.strictEqual(regionLinks.length, 32, '지역 랜딩 링크가 32개가 아니다');
for (const [, region, slot] of regionLinks) {
  assert.ok(fs.existsSync(path.join(dist, region, slot, 'index.html')), `링크 대상이 dist에 없다: ${region}/${slot}`);
}
assert.ok(root.indexOf('<div id="app"></div>') < root.indexOf('id="home-regions"'), '지역 링크 목록이 #app 뒤에 없다');
assert.ok(!landing.includes('home-regions'), '지역 랜딩에 지역 링크 목록이 있다');
console.log('ok home-magazine');
