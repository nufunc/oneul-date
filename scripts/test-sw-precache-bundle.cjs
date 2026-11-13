// 서비스 워커 앱 번들 사전 캐시 회귀 테스트: node scripts/test-sw-precache-bundle.cjs
// P-411이 막은 결함: 첫 방문의 앱 번들 JS와 CSS가 서비스 워커 등록 전에 받아져 Cache Storage에 들어가지 않았고,
// HTTP 캐시(max-age=600)가 지난 뒤 오프라인으로 열면 index.html만 와서 빈 화면이 될 수 있었다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const HTML = `<script type="module" crossorigin src="/oneul-date/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/oneul-date/assets/vendor-BBB.js">
<link rel="stylesheet" crossorigin href="/oneul-date/assets/index-CCC.css">
<script src="/oneul-date/assets/index-AAA.js"></script>`;

const install = async (opts) => {
  const added = [];
  const handlers = {};
  const cache = {
    addAll: async (urls) => {
      if (opts.failBundles && urls.some((u) => u.includes('/assets/'))) throw new TypeError('bundle 404');
      added.push(...urls);
    },
  };
  const ctx = {
    self: { addEventListener: (t, fn) => (handlers[t] = fn), skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async () => cache },
    fetch: async (url) => {
      assert.strictEqual(url, './index.html');
      if (opts.fetchFails) throw new TypeError('Failed to fetch');
      return { text: async () => opts.html };
    },
    URL,
  };
  vm.runInNewContext(sw, ctx);
  let waited;
  handlers.install({ waitUntil: (p) => (waited = p) });
  await waited; // 거절되면 install이 실패한다
  return added;
};

(async () => {
  const ASSETS = ['./', './index.html', './favicon.svg', './manifest.webmanifest'];
  // 1. index.html이 가리키는 번들을 중복 없이 ASSETS와 함께 넣는다
  assert.deepStrictEqual(
    await install({ html: HTML }),
    [...ASSETS, '/oneul-date/assets/index-AAA.js', '/oneul-date/assets/vendor-BBB.js', '/oneul-date/assets/index-CCC.css'],
    '번들이 사전 캐시에 없다',
  );
  // 2. index.html을 받지 못해도 install은 마치고 ASSETS는 넣는다
  assert.deepStrictEqual(await install({ fetchFails: true }), ASSETS, 'index.html 실패가 install을 막았다');
  // 3. 번들 경로가 없으면 ASSETS만 넣는다
  assert.deepStrictEqual(await install({ html: '<html></html>' }), ASSETS, '번들이 없는 index.html에서 어긋났다');
  // 4. 번들을 받지 못해도 install은 마치고 ASSETS는 남는다
  assert.deepStrictEqual(await install({ html: HTML, failBundles: true }), ASSETS, '번들 실패가 install을 막았다');

  console.log('ok sw-precache-bundle');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
