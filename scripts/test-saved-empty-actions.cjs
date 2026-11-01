// 저장한 코스 빈 상태 버튼 시험(P-249): node scripts/test-saved-empty-actions.cjs
// src/main.ts의 빈 상태 HTML에 코스 만들기 버튼과 매거진 링크가 있고, 열 때 함께 그려지며, 클릭이 닫기 경로를 쓰는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

// 빈 상태 분기의 템플릿 리터럴 하나를 읽는다. 패널을 연 뒤 DOM을 넣으면 여기 없으므로 흔들림 회귀도 잡는다
const m = src.match(/list\.length === 0\s*\?\s*`([^`]*)`/);
assert.ok(m, '저장한 코스 빈 상태 템플릿이 없다');
const html = m[1];
assert.ok(html.includes('아직 저장한 코스가 없어요'), '빈 상태 문구가 없다');

const make = html.match(/<button([^>]*)>([^<]*)<\/button>/);
assert.ok(make, '코스 만들러 가기 버튼이 없다');
assert.strictEqual(make[2].trim(), '코스 만들러 가기');
assert.match(make[1], /type="button"/);
assert.match(make[1], /class="btn-primary"/);
assert.match(make[1], /id="overlay-empty-make"/);
assert.doesNotMatch(make[1], /onclick/, 'inline onclick을 쓰지 않는다');

const link = html.match(/<a([^>]*)>([^<]*)<\/a>/);
assert.ok(link, '매거진 링크가 없다');
assert.strictEqual(link[2].trim(), '매거진에서 코스 고르기');
// 머리 매거진 링크와 같은 주소 규칙
const headHref = src.match(/id="btn-open-magazine" href="([^"]+)"/)[1];
assert.match(link[1], new RegExp(`href="${headHref.replace(/[./]/g, '\\$&')}"`));

// Tab 순서: 버튼이 링크보다 앞
assert.ok(html.indexOf('<button') < html.indexOf('<a '), '버튼이 링크보다 앞에 와야 한다');

// 클릭은 ✕와 같은 closeOverlay를 거친다(뒤로 가기 이력 처리 포함)
const handler = src.match(/#overlay-empty-make'\)\?\.addEventListener\('click', \(\) => \{([\s\S]*?)\n    \}\);/);
assert.ok(handler, '코스 만들러 가기 클릭 처리가 없다');
assert.match(handler[1], /closeOverlay\(/);
assert.match(handler[1], /cancelOverlayFocusReturn\(\)/);
assert.match(handler[1], /\.quick-region-chip/);

// 높이 48px
const rule = css.match(/^\.overlay-empty-actions > \.btn-primary,\n\.overlay-empty-actions > \.btn-secondary \{([^}]*)\}/m);
assert.ok(rule, '.overlay-empty-actions 버튼 규칙이 없다');
assert.match(rule[1], /min-height:\s*48px/);

console.log('ok');
