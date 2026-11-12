// 본문 건너뛰기와 main 랜드마크 시험(P-387): node scripts/test-skip-link.cjs
// 홈 화면이 머리 앞에 건너뛰기 링크를 두고, 코스 조건과 결과를 main으로 감싸며,
// 링크가 해시를 바꾸지 않고(hashchange가 받은 코스 판정을 다시 한다) 포커스만 옮기는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

const home = src.slice(src.indexOf('<a class="skip-link"'), src.indexOf('<footer class="app-footer">'));
assert.ok(home.length > 0, '건너뛰기 링크가 없다');
assert.ok(home.indexOf('skip-link') < home.indexOf('<header class="topbar">'), '건너뛰기 링크가 머리 앞에 없다');
assert.match(home, /<main id="main-content" tabindex="-1">[\s\S]*id="conditions-area"[\s\S]*id="results-area"[\s\S]*<\/main>/, 'main이 조건과 결과를 감싸지 않는다');
assert.strictEqual((src.match(/<main\b/g) || []).length, 1, 'main 랜드마크가 둘 이상이다');

assert.match(src, /'skip-to-main'\)\?\.addEventListener\('click', \(e\) => \{\s*e\.preventDefault\(\);\s*document\.getElementById\('main-content'\)\?\.focus\(\);/, '건너뛰기가 해시를 바꾸거나 포커스를 옮기지 않는다');

assert.match(css, /\.skip-link \{[^}]*top: -100px;/, '건너뛰기 링크가 평소에 보인다');
assert.match(css, /\.skip-link:focus \{[^}]*top:/, '건너뛰기 링크가 포커스 때 보이지 않는다');

console.log('test-skip-link: 통과');
