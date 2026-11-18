// 실패 띠 Tab 순서 회귀 테스트: node scripts/test-failed-banner-tab-order.cjs
// P-496이 막은 결함: 장소 정보 실패 띠를 body 끝에 붙여 「다시 받기」가 1280px에서 Tab 64번째였다(WCAG 2.4.3).
// 띠를 #app 앞에 두어 Tab 첫 번째로 닿게 하고, 띠가 있어도 1100px 이상 루트 홈의 결과 영역 최소 높이 규칙이 걸려야 한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
const start = main.indexOf('function showSpotsFailedBanner(');
assert.ok(start >= 0, 'showSpotsFailedBanner가 없다');
const code = main.slice(start, main.indexOf('\n}\n', start) + 2);

// 1. 실제 함수를 body에 #app과 #sr-announce가 있는 대역으로 실행하면 띠가 첫 자식이 된다
const makeEl = (tag) => ({
  tag, id: '', className: '', innerHTML: '',
  setAttribute() {}, addEventListener() {}, remove() {},
  querySelector() { return { addEventListener() {}, textContent: '안내' }; },
});
const app = { id: 'app' };
const live = { id: 'sr-announce' };
const body = {
  children: [app, live],
  appendChild(el) { this.children.push(el); },
  prepend(el) { this.children.unshift(el); },
  insertBefore(el, ref) { this.children.splice(this.children.indexOf(ref), 0, el); },
};
const doc = { body, createElement: makeEl, getElementById: (id) => body.children.find((c) => c.id === id) || null };
const show = new Function('document', 'location', 'announce', `${ts.transpile(code, { target: 'es2022' })};return showSpotsFailedBanner;`)(doc, {}, () => {});
show(251);
assert.strictEqual(body.children[0].id, 'spots-failed-banner', '띠가 #app 앞에 오지 않아 Tab 순서 끝에 남는다');
assert.strictEqual(body.children[1], app, '#app 순서가 바뀌었다');
show(251);
assert.strictEqual(body.children.length, 3, '띠가 두 번 붙었다');

// 2. 띠는 화면에서 아래에 고정된 채다(P-255)
const i = css.indexOf('\n.data-failed-banner {');
assert.ok(css.slice(i, css.indexOf('}', i)).includes('position: fixed;'), '띠가 고정 위치가 아니다');

// 3. 1100px 이상 루트 홈 최소 높이 규칙이 띠가 앞에 붙은 경우도 잡는다
const minRule = css.match(/\n\s*(html:not\(\[data-shared-course\]\) body > [^{]*#results-area:has\(> \.results-empty\)) \{/);
assert.ok(minRule, '결과 영역 최소 높이 규칙이 없다');
assert.ok(minRule[1].includes('.data-failed-banner:first-child + #app'), '띠가 #app 앞에 있으면 최소 높이 규칙이 빠진다');
assert.ok(minRule[1].includes('#app:first-child'), '띠 없는 루트 홈에서 최소 높이 규칙이 빠진다');

console.log('test-failed-banner-tab-order: ok');
