// 받은 링크 별칭 대기 회귀 테스트: node scripts/test-receiver-alias-wait.cjs
// P-409가 막은 결함: 받은 링크가 spot_aliases.json을 기다리는 동안 화면에 아무것도 그리지 않았고, 응답이 멈추면 빈 화면이 계속됐다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const cut = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${from}을 찾지 못했다`);
  const end = src.indexOf(to, start);
  assert.ok(end > start, `${from} 뒤에서 ${to}를 찾지 못했다`);
  return src.slice(start, end + to.length);
};

(async () => {
  // 1. init: 별칭을 기다리기 전에 대기 카드를 그린다
  const main = read('main.ts');
  const init = cut(main, 'async function init(', '\n}\n');
  assert.ok(
    /if \(isSharedLink\) \{\s*renderReceiverLoading\(\);\s*await aliasesReady;\s*\}/.test(init),
    '받은 링크가 대기 카드보다 별칭을 먼저 기다린다',
  );
  assert.ok(!/if \(isSharedLink\) await aliasesReady;/.test(init), '대기 카드 없이 별칭을 기다리는 줄이 남았다');
  // 2. 뒤의 폴백은 이미 그린 대기 카드를 다시 그리지 않는다(회전 표시가 처음부터 다시 돈다)
  assert.ok(
    /\} else if \(!document\.getElementById\('receiver-loading'\)\) \{[^}]*renderReceiverLoading\(\);/.test(init),
    '폴백이 대기 카드를 다시 그린다',
  );

  // 3. loadSpotAliases: 8초 시간 제한을 걸고, 시간이 지나 끊기면 빈 객체를 돌려준다
  const code = cut(read('supabase.ts'), 'export async function loadSpotAliases', '\n}\n').replace(/^export /gm, '');
  const env = { ms: [], mode: 'hang' };
  const loadSpotAliases = new Function(
    'env',
    `const AbortSignal = { timeout: (ms) => { env.ms.push(ms); const c = new AbortController(); setTimeout(() => c.abort(), 5); return c.signal; } };
    const fetch = (url, init) => new Promise((resolve, reject) => {
      if (env.mode === 'ok') return resolve({ ok: true, json: async () => ({ 7: 9 }) });
      if (!init || !init.signal) return; // 시간 제한이 없으면 끝나지 않는다
      init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
    });
    ${ts.transpile(code, { target: 'es2022' })}
    return loadSpotAliases;`,
  )(env);
  const hung = await Promise.race([loadSpotAliases(), new Promise((r) => setTimeout(() => r('hung'), 500))]);
  assert.deepStrictEqual(hung, {}, '응답이 멈추면 빈 객체로 끝나야 한다');
  assert.deepStrictEqual(env.ms, [8000], '시간 제한이 8초가 아니다');
  env.mode = 'ok';
  assert.deepStrictEqual(await loadSpotAliases(), { 7: 9 }, '정상 응답의 별칭을 돌려주지 않는다');

  console.log('ok receiver-alias-wait');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
