// 코스 카드 하트 위임 회귀 테스트: node scripts/test-save-chip-delegation.cjs
// init의 하트 클릭 위임과 toggleSaveSpot~setSaveButtonLabels를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다.
// 막는 결함: 하트를 버튼마다 걸어 🔄로 바꾼 카드와 공유받은 코스 화면의 하트가 눌러도 반응하지 않았다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${from}을 찾지 못했다`);
  const end = src.indexOf(to, start);
  assert.ok(end > start, `${from} 뒤에서 ${to}를 찾지 못했다`);
  return src.slice(start, end + to.length);
};
const fnBody = (name) => cut(`function ${name}(`, '\n}\n');

// 하트 핸들러는 문서 위임 하나뿐이어야 한다. 버튼마다 또 걸면 한 번 누를 때 두 번 토글된다
assert.ok(!fnBody('bindResultEvents').includes('.step-save-chip'), 'bindResultEvents가 하트에 핸들러를 또 건다');
assert.ok(fnBody('init').includes("closest<HTMLButtonElement>('.step-save-chip')"), 'init에 하트 위임이 없다');

const delegation = cut("  document.addEventListener('click', (e) => {\n    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.step-save-chip');", '\n  });\n');
const code = [fnBody('saveButtonLabels'), fnBody('setSaveButtonLabels'), fnBody('toggleSaveSpot'), delegation].join('\n');

function makeEnv() {
  const env = { stored: [], toasts: [], listener: null };
  const state = { savedSpotIds: new Set([7]) };
  const spotById = new Map([[1, { name: '서촌 카페' }], [7, { name: '연남 공원' }]]);
  const document = { addEventListener: (t, fn) => { if (t === 'click') env.listener = fn; } };
  new Function(
    'state', 'spotById', 'document', 'saveSavedSpotIds', 'showToast',
    ts.transpile(code, { target: 'es2022' }),
  )(state, spotById, document, (ids) => env.stored.push([...ids]), (m) => env.toasts.push(m));
  env.state = state;
  return env;
}

function makeChip(spotId) {
  const classes = new Set();
  const chip = {
    dataset: { spotId: String(spotId) },
    innerHTML: '<span>🤍</span>',
    title: '보관함에 담기',
    attrs: {},
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    setAttribute: (k, v) => (chip.attrs[k] = v),
    closest: (sel) => (sel === '.step-save-chip' ? chip : null),
  };
  return chip;
}

function click(env, target) {
  let stopped = false;
  env.listener({ target, stopPropagation: () => (stopped = true) });
  return stopped;
}

// 담기 → 해제: 핸들러를 건 뒤 새로 그린 카드(교체 카드, 공유 화면 카드)도 같은 버튼 객체로 본다
{
  const env = makeEnv();
  const chip = makeChip(1);
  assert.ok(click(env, chip), '하트 클릭이 전파를 멈추지 않았다');
  assert.strictEqual(chip.innerHTML, '<span>❤️</span>');
  assert.ok(chip.classList.has('is-saved'));
  assert.strictEqual(chip.attrs['aria-label'], '서촌 카페 보관함에서 제외');
  assert.strictEqual(chip.title, '보관함에서 제외');
  assert.deepStrictEqual(env.stored.at(-1).sort(), [1, 7], '기존 보관함 7을 덮었다');

  click(env, chip);
  assert.strictEqual(chip.innerHTML, '<span>🤍</span>');
  assert.ok(!chip.classList.has('is-saved'));
  assert.strictEqual(chip.attrs['aria-label'], '서촌 카페 보관함에 담기');
  assert.strictEqual(chip.title, '보관함에 담기');
  assert.deepStrictEqual(env.stored.at(-1), [7]);
  assert.deepStrictEqual(env.toasts, ['❤️ 보관함에 담았어요!', '보관함에서 제외했어요']);
}

// 이미 담긴 스팟은 한 번 누르면 해제된다
{
  const env = makeEnv();
  const chip = makeChip(7);
  click(env, chip);
  assert.strictEqual(chip.attrs['aria-label'], '연남 공원 보관함에 담기');
  assert.deepStrictEqual(env.stored.at(-1), []);
}

// 하트가 아닌 곳과 spotId가 없는 하트는 아무것도 바꾸지 않는다
{
  const env = makeEnv();
  assert.ok(!click(env, { closest: () => null }));
  const chip = makeChip('');
  click(env, chip);
  assert.strictEqual(chip.innerHTML, '<span>🤍</span>');
  assert.deepStrictEqual(env.stored, []);
}

console.log('ok 4');
