// 매거진 코스 시간대 숨김 회귀 테스트: node scripts/test-receiver-blog-slot.cjs
// 글의 코스 상자로 연 받은 코스는 카드의 시간대(☀️ 낮 등)를 숨기고, 일반 공유 코스와 내 코스는 그대로 보인다(P-484)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function renderStepCard(');
assert.ok(start > 0, 'renderStepCard를 찾지 못했다');
const card = src.slice(start, src.indexOf('\nfunction ', start + 10));

// 시간대 글자는 slotTag 한 곳에서만 만들고 hideSlot이면 빈 문자열이다
const def = card.match(/const slotTag = opts\.hideSlot \? '' : `<div class="step-slot">\$\{meta\.emoji\} \$\{slotLabelWithClock\(step\.slot\)\}<\/div>`;/);
assert.ok(def, 'slotTag 정의가 hideSlot을 따르지 않는다');
assert.strictEqual((card.match(/class="step-slot"/g) || []).length, 1, '카드 안에 slotTag를 거치지 않는 시간대 표시가 남았다');
assert.strictEqual((card.match(/\$\{slotTag\}/g) || []).length, 3, '빈 카드 둘과 장소 카드 하나 모두 slotTag를 써야 한다');

// 받은 코스 화면만 blogSlug가 있을 때 hideSlot을 켠다
const calls = src.split('\n').filter((l) => /renderStepCard\(step/.test(l)).map((l) => l.trim());
const hidden = calls.filter((c) => c.includes('hideSlot'));
assert.deepStrictEqual(hidden, ['let html = renderStepCard(step, i, { swappable: false, usedImages, hideSlot: Boolean(blogSlug) });'], `hideSlot 호출이 받은 코스의 blogSlug 분기 하나여야 한다: ${hidden.join(' | ')}`);
const recv = src.slice(src.indexOf('function renderReceiverView('), src.indexOf('\nfunction ', src.indexOf('function renderReceiverView(') + 10));
assert.ok(recv.includes(hidden[0].replace(/^let html = /, '')), 'hideSlot 호출이 renderReceiverView 밖에 있다');
assert.ok(/let blogSlug: string \| null = null;/.test(recv), 'renderReceiverView에 blogSlug가 없다');

// 모든 장소 수와 순서는 그대로: 받은 코스는 steps 전부를 같은 순서로 그린다
assert.ok(/\$\{steps\.map\(\(step, i\) => \{\s*let html = renderStepCard\(step, i,/.test(recv), '받은 코스가 steps를 순서대로 다 그리지 않는다');

console.log('receiver-blog-slot ok');
