// 코스 행동 단추 이모지 숨김 시험(P-393): node scripts/test-receiver-emoji-hidden.cjs
// 받은 코스와 홈 결과의 복사, 공유, 저장, 코스 만들기 단추가 이모지와 화살표를 그림 이름으로 읽지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const H = (e) => `<span aria-hidden="true">${e}</span>`;
for (const id of ['btn-receiver-copy', 'btn-receiver-share', 'btn-make-own-hero', 'btn-make-own', 'btn-copy', 'btn-share-link']) {
  const m = src.match(new RegExp(`id="${id}"[^>]*>([^<]|<span aria-hidden="true">[^<]*</span>)*</button>`));
  assert.ok(m, `${id} 단추가 없다`);
  const visible = m[0].replace(/<span aria-hidden="true">[^<]*<\/span>/g, '').replace(/^[^>]*>/, '');
  assert.ok(!/[\u{1F300}-\u{1FAFF}→]/u.test(visible), `${id} 이름에 이모지나 화살표가 남았다: ${visible}`);
}
for (const id of ['btn-save', 'btn-receiver-save']) {
  assert.match(src, new RegExp(`id="${id}"[^>]*aria-label="저장">💾 저장</button>`), `${id} 저장 전 이름이 없다`);
}
assert.strictEqual((src.match(new RegExp(`receiver-hero-badge">${H('[✨📖]')}`, 'gu')) || []).length, 3, '받은 코스 배지 이모지가 읽힌다');

console.log('test-receiver-emoji-hidden: 통과');
