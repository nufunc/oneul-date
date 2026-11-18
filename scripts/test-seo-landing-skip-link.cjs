// 지역 랜딩 건너뛰기 링크 시험(P-500): node scripts/test-seo-landing-skip-link.cjs
// 랜딩은 #seo-landing(링크 24개)이 #app 앞에 있어 건너뛰기 링크가 Tab 25번째였다. 앱이 랜딩에서만 두 링크를 body 맨 앞으로 옮기고,
// 다시 그릴 때 옮긴 사본을 걷어 id가 겹치지 않으며, 실패 띠는 랜딩에서 건너뛰기 링크 뒤·#seo-landing 앞에 붙는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');

// 루트 셸 마크업은 그대로 #app 안 머리 앞에 두 링크를 둔다
const shell = src.slice(src.indexOf('function renderShell('), src.indexOf('<header class="topbar">', src.indexOf('function renderShell(')));
assert.ok(shell.includes('id="skip-to-main"') && shell.includes('id="skip-to-conditions"'), '셸에 건너뛰기 링크 두 개가 없다');

// 랜딩에서만 셸의 두 링크를 body 맨 앞으로 옮긴다(복제가 아니라 이동)
const afterShell = src.slice(src.indexOf('<div class="overlay-root" id="overlay-root"></div>'), src.indexOf("'skip-to-main')?.addEventListener"));
assert.match(afterShell, /if \(document\.getElementById\('seo-landing'\)\) document\.body\.prepend\(\.\.\.app\.querySelectorAll\(':scope > \.skip-link'\)\);/, '랜딩에서 건너뛰기 링크를 문서 맨 앞으로 옮기지 않는다');

// 셸·받은 코스 화면이 모두 거치는 setSharedCourseView가 옮긴 사본을 먼저 걷는다
const shared = src.slice(src.indexOf('function setSharedCourseView('), src.indexOf('\n}\n', src.indexOf('function setSharedCourseView(')));
assert.match(shared, /document\.querySelectorAll\('body > \.skip-link'\)\.forEach\(\(el\) => el\.remove\(\)\);/, '다시 그릴 때 옮긴 건너뛰기 링크를 걷지 않아 두 벌이 된다');
for (const fn of ['function renderShell(', 'function renderReceiverLoading(', 'function renderReceiverView(']) {
  const body = src.slice(src.indexOf(fn), src.indexOf('app.innerHTML', src.indexOf(fn)));
  assert.ok(/setSharedCourseView\((true|false)\)/.test(body), `${fn}가 화면을 그리기 전에 setSharedCourseView를 부르지 않는다`);
}

// 실패 띠: 랜딩은 #seo-landing 앞(건너뛰기 링크 뒤), 루트는 body 맨 앞(P-496 그대로)
const banner = src.slice(src.indexOf('function showSpotsFailedBanner('), src.indexOf('\n}\n', src.indexOf('function showSpotsFailedBanner(')));
assert.match(banner, /const landing = document\.getElementById\('seo-landing'\);\s*if \(landing\) landing\.before\(bar\);\s*else document\.body\.prepend\(bar\);/, '실패 띠가 랜딩에서 건너뛰기 링크 앞에 온다');

// 생성된 랜딩은 정적 건너뛰기 링크를 따로 싣지 않는다(앱 링크와 id가 겹치지 않게)
const dist = path.join(root, 'dist');
let count = 0;
if (fs.existsSync(dist)) {
  for (const r of fs.readdirSync(dist)) {
    for (const s of ['day', 'evening', 'night', 'stay']) {
      const f = path.join(dist, r, s, 'index.html');
      if (!fs.existsSync(f)) continue;
      count += 1;
      const html = fs.readFileSync(f, 'utf8');
      assert.ok(!html.includes('skip-to-main') && !html.includes('skip-link'), `${r}/${s}: 정적 건너뛰기 링크가 있어 id가 겹친다`);
      assert.ok(html.indexOf('<section id="seo-landing"') < html.indexOf('<div id="app">'), `${r}/${s}: 랜딩 구획이 #app 앞에 없다`);
    }
  }
}
assert.ok(count === 0 || count === 32, `지역 랜딩이 32쪽이 아니다: ${count}`);

console.log('test-seo-landing-skip-link: 통과');
