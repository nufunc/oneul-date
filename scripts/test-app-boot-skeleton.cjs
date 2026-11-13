// 첫 HTML 골격 시험: npm run build 뒤 node scripts/test-app-boot-skeleton.cjs
// 앱 JS가 실행되기 전에도 보이는 머리 제목과 불러오는 중 문구가 루트 #app 안에 있는지 본다(P-412)
// 앱이 #app을 통째로 바꿔야 골격 h1과 앱 h1이 둘이 되지 않으므로 그 대입도 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const app = root.match(/<div id="app">([\s\S]*?)<\/div>/)?.[1];
assert.ok(app, '루트에 #app이 없다');
assert.ok(/<header class="topbar"><h1 class="app-title">오늘 데이트<\/h1><\/header>/.test(app), '#app 골격에 보이는 머리 제목이 없다');
assert.ok(app.includes('<p class="app-boot" role="status">불러오는 중이에요</p>'), '#app 골격에 불러오는 중 문구가 없다');
assert.ok(!/class="sr-only">오늘 데이트/.test(app), '머리 제목이 아직 sr-only다');
// 받은 링크에서도 같은 골격이 보이므로 홈에만 맞는 말을 넣지 않는다
for (const banned of ['코스 만들기', '오늘의 코스', '공유받은']) assert.ok(!app.includes(banned), `골격에 ${banned} 문구가 있다`);
assert.strictEqual(root.match(/<h1[\s>]/g)?.length, 1, '루트 h1이 1개가 아니다');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
assert.ok(/\n\.app-boot \{/.test(css), '.app-boot 규칙이 없다');
// 골격 머리가 앱 머리(단추 44px)보다 낮으면 앱이 그릴 때 제목이 내려간다
assert.ok(/\.topbar:has\(\+ \.app-boot\) > \.app-title \{\s*min-height: 44px;/.test(css), '골격 제목 줄 높이가 앱 머리와 다르다');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
assert.ok(main.includes("const app = document.getElementById('app')!;"), '앱 루트를 #app으로 잡지 않는다');
for (const fn of ['function renderShell', 'function renderReceiverLoading', 'function renderReceiverView']) {
  const start = main.indexOf(fn);
  assert.ok(start >= 0, `${fn}가 없다`);
  assert.ok(main.slice(start, main.indexOf('\n}\n', start)).includes('app.innerHTML = '), `${fn}가 #app을 통째로 바꾸지 않는다`);
}
console.log('ok app-boot-skeleton');
