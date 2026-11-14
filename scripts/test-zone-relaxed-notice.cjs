// 존 완화 안내 줄 회귀 테스트(P-431): node scripts/test-zone-relaxed-notice.cjs
// 세부존 안에 후보가 없어 권역 전체에서 고른 낮·저녁·밤 칸만 안내하고, 숙박과 존 안 칸과 존 미선택에는 안내하지 않는지 본다.
// src/main.ts의 zoneRelaxedSlots·zoneRelaxedNotice와 그것이 부르는 선언을 그대로 떼어 TypeScript로 변환해 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const names = ['zoneRelaxedSlots', 'zoneRelaxedNotice'];
const need = new Set();
const queue = [...names];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const { zoneRelaxedSlots, zoneRelaxedNotice } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { ${names.join(', ')} };`)();

// 태안 존: 낮 칸은 존 안 후보가 있고 저녁·밤 칸은 존 안 후보가 없다. 숙박도 존 밖
const spot = (id, slot, name, location, area) => ({ id, slot, name, location, area, region: '충청', category: slot === 'day' ? 'CAFE' : 'MEAL' });
const all = [
  spot(1, 'day', '꽃지 카페', '충남 태안군 안면읍', '태안군'),
  spot(2, 'evening', '공주 식당', '충남 공주시', '공주시'),
  spot(3, 'night', '천안 바', '충남 천안시', '천안시'),
  spot(4, 'stay', '아산 호텔', '충남 아산시', '아산시'),
];
const steps = [
  { slot: 'day', spotId: 1 },
  { slot: 'evening', spotId: 2 },
  { slot: 'night', spotId: 3 },
  { slot: 'stay', spotId: 4 },
];
const slots = zoneRelaxedSlots(all, steps, ['CHUNGCHEONG'], 'ALL', ['taean']);
assert.deepStrictEqual(slots, ['evening', 'night'], '존 완화 칸은 저녁·밤만, 숙박과 존 안 낮은 빠짐');
assert.strictEqual(
  zoneRelaxedNotice(slots, ['CHUNGCHEONG'], ['taean']),
  "'태안·안면도·서산'에 맞는 저녁·밤 장소가 없어 충청 전체에서 골랐어요",
);
assert.strictEqual(zoneRelaxedNotice(['night'], [], ['taean']), "'태안·안면도·서산'에 맞는 밤 장소가 없어 전국에서 골랐어요", '권역 미선택은 전국');
assert.deepStrictEqual(zoneRelaxedSlots(all, steps, ['CHUNGCHEONG'], 'ALL', []), [], '존 미선택: 안내 없음');
assert.strictEqual(zoneRelaxedNotice([], ['CHUNGCHEONG'], ['taean']), '', '완화 칸 없음: 빈 문자열');
// 존 안 저녁 후보가 있는데 존 밖 장소가 든 코스(찜·앵커 코스 등)는 완화로 보지 않는다
const withZoneEvening = [...all, spot(5, 'evening', '만리포 횟집', '충남 태안군 소원면', '태안군')];
assert.deepStrictEqual(zoneRelaxedSlots(withZoneEvening, steps, ['CHUNGCHEONG'], 'ALL', ['taean']), ['night'], '존 안 후보가 있으면 완화 아님');

// 배선: 🚀·다시 추천만 zoneRelaxed를 채우고, 결과 머리 search-miss 띠와 #sr-announce가 같은 문구를 쓴다
assert.strictEqual((src.match(/zoneRelaxed: zoneRelaxedSlots\(/g) || []).length, 3, '🚀, 동네 재시도, 다시 추천 세 곳');
assert.ok(/<div class="search-miss zone-relaxed"><p>\$\{escapeHtml\(zoneNotice\)\}<\/p><\/div>/.test(src), '결과 머리 띠');
assert.strictEqual((src.match(/announceZoneRelaxed\(\);/g) || []).length, 3, '코스 알림 뒤 낭독 세 곳');
console.log('test-zone-relaxed-notice: ok 9');
