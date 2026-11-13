// 저장한 코스 단추 이름의 제목 이모지 시험(P-394): node scripts/test-saved-title-emoji.cjs
// 코스 제목의 그림 문자가 단추 이름에서 빠지고 화면 글자에서는 낭독에서 숨겨지는지,
// 시간대 이모지(saved-step-emoji)는 그대로 읽히는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const ofLine = src.match(/const of = escapeHtml\(`\$\{dateStr\} \$\{name\.replace\((\/.*?\/gu), ''\)\}`\);/);
assert.ok(ofLine, '단추 이름이 제목의 그림 문자를 빼지 않는다');
const strip = (s) => s.replace(new RegExp(ofLine[1].slice(1, -3), 'gu'), '');
assert.strictEqual(strip('🔍 서촌 카페 코스'), '서촌 카페 코스');
assert.strictEqual(strip('❤️ 찜한 코스'), '찜한 코스');
assert.strictEqual(strip('📍 청계광장 중심 코스'), '청계광장 중심 코스');

assert.ok(src.includes('<span class="saved-item-meta"><span>${dateStr} · ${nameHtml}</span></span>'), '화면 제목이 그림 문자를 숨긴 값을 쓰지 않거나 flex 줄에서 띄어쓰기를 잃는다');
assert.ok(src.includes(String.raw`const nameHtml = escapeHtml(name).replace(/\p{Extended_Pictographic}\uFE0F?/gu, '<span aria-hidden="true">$&</span>');`), '화면 제목의 그림 문자가 낭독에서 숨겨지지 않는다');
assert.ok(src.includes('<span class="saved-step-emoji">${emoji}</span>'), '시간대 이모지가 숨겨졌다');

console.log('test-saved-title-emoji: 통과');
