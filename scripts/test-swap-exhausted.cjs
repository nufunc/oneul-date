// 칸 교체 소진 알림 회귀 테스트(P-431): node scripts/test-swap-exhausted.cjs
// 후보 3곳 칸에서 교체를 이어 누르면 3번째 교체(한 바퀴를 넘는 교체)에만 알림이 나고, 이력을 비워 다음 바퀴가 처음부터 도는지 본다.
// src/main.ts의 이력 함수와 소진 판정을 그대로 떼어 TypeScript로 변환해 실행한다
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
const names = ['excludeRecent', 'isRecentExhausted', 'addRecentSpotIds', 'forgetRecentSpotIds', 'recentSpotIdSet', 'SWAP_EXHAUSTED_MSG'];
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
const store = {};
const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const f = new Function('localStorage', `${ts.transpile(code, { target: 'es2022' })};return { ${names.join(', ')} };`)(localStorage);

assert.strictEqual(f.SWAP_EXHAUSTED_MSG, '이 조건의 장소를 모두 보여 드렸어요. 처음부터 다시 보여 드려요');
assert.strictEqual(f.isRecentExhausted([], new Set([1])), false, '후보 0곳은 소진이 아니라 기존 "다른 추천 장소가 없어요" 경로');
assert.strictEqual(f.isRecentExhausted([{ id: 1 }], new Set()), false, '이력이 비면 소진 아님');
assert.strictEqual(f.isRecentExhausted([{ id: 1 }, { id: 2 }], new Set([1])), false, '이력 밖 후보가 남음');
assert.strictEqual(f.isRecentExhausted([{ id: 1 }, { id: 2 }], new Set([1, 2, 9])), true, '후보가 모두 이력에 듦');

// swapStep의 흐름: 현재 장소를 뺀 후보 → 소진 판정 → 이력 제외 → 고름 → 소진이면 이 칸 후보 이력 비움 → 고른 곳 이력 추가
const slot = [{ id: 1 }, { id: 2 }, { id: 3 }];
let current = 1;
f.addRecentSpotIds([current]); // 코스를 만들 때 보인 장소
const toastAt = [];
for (let n = 1; n <= 6; n++) {
  const pool = slot.filter((s) => s.id !== current);
  const recent = f.recentSpotIdSet();
  const wrapped = f.isRecentExhausted(pool, recent);
  const chosen = f.excludeRecent(pool, recent)[0];
  if (wrapped) f.forgetRecentSpotIds([...pool.map((s) => s.id), current]);
  current = chosen.id;
  f.addRecentSpotIds([current]);
  if (wrapped) toastAt.push(n);
}
assert.deepStrictEqual(toastAt, [3, 6], '후보 3곳 칸: 3번째와 6번째 교체에만 알림');

// swapStep 배선: 판정은 이력 제외 전 후보로, 알림 문구는 상수로, 후보 0곳 문구는 그대로
const swap = src.slice(src.search(/^function swapStep\(/m));
const body = swap.slice(0, swap.search(/\n}\n/));
assert.ok(/const wrapped = isRecentExhausted\(pool, recent\);\s*const rawCandidates = excludeRecent\(pool, recent\);/.test(body), '소진 판정 배선');
assert.ok(/if \(wrapped\) forgetRecentSpotIds\(/.test(body), '소진 뒤 이력 비움');
assert.ok(/if \(wrapped\) showToast\(SWAP_EXHAUSTED_MSG\);/.test(body), '소진 알림');
assert.ok(body.includes("'이 조건에 다른 추천 장소가 없어요'"), '후보 0곳 문구 유지');
console.log('test-swap-exhausted: ok 10');
