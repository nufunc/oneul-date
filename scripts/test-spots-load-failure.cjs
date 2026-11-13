// spots.json 실패 알림 회귀 테스트: node scripts/test-spots-load-failure.cjs
// loadStaticSpots(src/supabase.ts)와 receiverLoadingHtml, showSpotsFailedBanner(src/main.ts)를 그대로 떼어 TypeScript로 변환해 실행한다.
// P-255가 막은 결함: spots.json을 받지 못하면 알리지 않고 번들 샘플로 코스를 만들고, 받은 링크는 '찾을 수 없어요'와 함께 해시를 지웠다
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
  // 1. loadStaticSpots: 실패면 샘플을 돌려주고 표시를 세우며 IndexedDB에 저장하지 않는다
  const supa = read('supabase.ts');
  // 샘플 동적 import(P-414)는 new Function 안에서 받을 수 없어 주입한 rawSpotsData로 바꾼다
  const loadCode = cut(supa, 'export let spotsFellBackToSample', '\n}\n').replace(/^export /gm, '')
    .replace("(await import('./data/spots.sample.json')).default", 'rawSpotsData');
  const sample = [{ id: 1 }, { id: 2 }];
  const env = { response: null, saved: [] };
  const mod = new Function(
    'env',
    'normalizeSpots',
    'rawSpotsData',
    'saveSpotsToCache',
    `const fetch = async () => { if (env.response instanceof Error) throw env.response; return env.response; };
    ${ts.transpile(loadCode, { target: 'es2022' })}
    return { loadStaticSpots, flag: () => spotsFellBackToSample };`,
  )(env, (rows) => rows, sample, (rows) => env.saved.push(rows.length));

  const full = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i }));
  const cases = [
    ['500', { ok: false, status: 500, json: async () => ({}) }],
    ['연결 끊김', new TypeError('Failed to fetch')],
    ['받는 도중 끊김', { ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON'); } }],
    ['빈 배열', { ok: true, json: async () => [] }],
  ];
  for (const [label, response] of cases) {
    env.response = response;
    env.saved = [];
    const got = await mod.loadStaticSpots();
    assert.strictEqual(got, sample, `${label}: 샘플을 돌려주지 않았다`);
    assert.strictEqual(mod.flag(), true, `${label}: 샘플로 떨어졌다는 표시가 없다`);
    assert.deepStrictEqual(env.saved, [], `${label}: 샘플을 캐시에 저장했다(다시 받기가 소용없어진다)`);
  }
  env.response = { ok: true, json: async () => full };
  env.saved = [];
  assert.strictEqual((await mod.loadStaticSpots()).length, 5);
  assert.strictEqual(mod.flag(), false, '성공한 뒤에도 실패 표시가 남았다');
  assert.deepStrictEqual(env.saved, [5], '성공한 데이터를 캐시에 저장하지 않았다');

  // 2. 받은 링크 실패 카드: 해시를 지우지 않고 문구와 다시 불러오기 버튼을 보인다
  const main = read('main.ts');
  const htmlCode = cut(main, 'function receiverLoadingHtml', '\n}\n');
  const html = new Function(
    'state',
    'getThemeModeLabel',
    'getThemeModeHtml',
    `${ts.transpile(htmlCode, { target: 'es2022' })};return receiverLoadingHtml;`,
  )({ themeMode: 'light' }, () => '낮', () => '☀️');
  const failedHtml = html(true);
  assert.ok(failedHtml.includes('id="receiver-loading"'), '실패 카드가 자리표시 자리를 떠났다');
  assert.ok(failedHtml.includes('연결이 끊겨 코스를 불러오지 못했어요. 링크는 그대로예요.'), '실패 문구가 없다');
  assert.ok(/<button type="button" class="btn-data-retry" id="btn-receiver-retry">다시 불러오기<\/button>/.test(failedHtml), '다시 불러오기 버튼이 없다');
  assert.ok(failedHtml.includes('role="alert"'), '실패를 낭독기에 알리지 않는다');
  assert.ok(!failedHtml.includes('불러오는 중'), '실패 카드에 불러오는 중 문구가 남았다');
  assert.ok(html().includes('불러오는 중') && !html().includes('btn-receiver-retry'), '기본 자리표시가 바뀌었다');
  const renderLoading = cut(main, 'function renderReceiverLoading(', '\n}\n');
  assert.ok(renderLoading.includes("getElementById('btn-receiver-retry')?.addEventListener('click', () => location.reload())"), '다시 불러오기가 새로 고침이 아니다');

  // 3. init: 샘플로 떨어지면 받은 링크는 판정(handleRoute → clearCourseHash)하지 않고, 홈은 띠를 띄운다
  const initThen = cut(main, '      loadSpots()\n        .then((firstSpots) => {', '        .finally(resolveWaitingCourse);');
  assert.ok(
    /if \(isSharedLink && document\.getElementById\('receiver-loading'\)\) \{\s*if \(spotsFellBackToSample\) renderReceiverLoading\(true\);\s*else handleRoute\(\);/.test(initThen),
    '실패한 받은 링크가 handleRoute로 판정된다',
  );
  // 띠의 곳 수는 스팟 탐색 탭 목록과 같은 거르기로 센다. spots.length면 폐업과 코스 제외가 섞여 탭 수와 어긋났다(P-256)
  const listable = '!s.is_closed && isCourseEligible(s)';
  assert.ok(
    initThen.includes(`} else {\n              if (spotsFellBackToSample) showSpotsFailedBanner(spots.filter((s) => ${listable}).length);`),
    '홈에서 실패 띠를 띄우지 않거나 곳 수를 탐색 탭과 다르게 센다',
  );
  assert.ok(cut(main, 'function renderSpotDiscovery(', '\n}\n').includes(`deduplicateSpotList(spots.filter((s) => ${listable}))`), '탐색 탭 후보 거르기가 띠와 달라졌다');
  // 캐시가 있는 재방문에서 받지 못하면 캐시의 전체 데이터를 샘플로 바꾸지 않는다
  const cachedSync = cut(main, '      loadSpots()\n        .then((liveSpots) => {', '\n          }\n');
  assert.ok(cachedSync.includes('!spotsFellBackToSample'), '캐시 동기화가 실패한 샘플로 덮는다');

  // 4. 홈 띠: 고정 위치, 이름 있는 영역, 안내 문장은 #sr-announce로(P-423), 실제 개수, 다시 받기와 닫기
  const bannerCode = cut(main, 'function showSpotsFailedBanner(', '\n}\n');
  const makeEl = (tag) => {
    const el = {
      tag, id: '', className: '', attrs: {}, children: [], listeners: {}, removed: false, innerHTML: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, fn) { this.listeners[t] = fn; },
      remove() { this.removed = true; doc.body.children.splice(doc.body.children.indexOf(this), 1); },
      querySelector(sel) {
        const cls = sel.replace('.', '');
        if (!this.innerHTML.includes(`class="${cls}"`)) return null;
        if (!this.found[sel]) {
          this.found[sel] = makeEl('button');
          this.found[sel].textContent = (this.innerHTML.match(new RegExp(`class="${cls}"[^>]*>([^<]*)<`)) || [])[1];
        }
        return this.found[sel];
      },
      found: {},
    };
    return el;
  };
  const doc = {
    body: { children: [], appendChild(el) { this.children.push(el); } },
    createElement: makeEl,
    getElementById: (id) => doc.body.children.find((c) => c.id === id) || null,
  };
  const loc = { reloads: 0, reload() { this.reloads++; } };
  const announced = [];
  const show = new Function('document', 'location', 'announce', `${ts.transpile(bannerCode, { target: 'es2022' })};return showSpotsFailedBanner;`)(doc, loc, (t) => announced.push(t));
  show(251);
  show(251);
  assert.strictEqual(doc.body.children.length, 1, '띠가 두 번 붙었다');
  const bar = doc.body.children[0];
  assert.strictEqual(bar.attrs.role, 'region', '띠가 글자째 삽입되는 status로 남았다');
  assert.strictEqual(bar.attrs['aria-label'], '장소 정보 안내', '띠 영역에 이름이 없다');
  assert.deepStrictEqual(announced, ['장소 정보를 다 받지 못했어요. 지금은 일부 251곳만 보여요.'], '안내 문장을 한 번만 알리지 않는다');
  assert.ok(bar.innerHTML.includes('장소 정보를 다 받지 못했어요. 지금은 일부 251곳만 보여요.'), '띠 문구나 개수가 다르다');
  assert.ok(bar.innerHTML.includes('>다시 받기</button>'), '다시 받기 버튼이 없다');
  assert.ok(/class="btn-data-dismiss" aria-label="안내 닫기"/.test(bar.innerHTML), '닫기 버튼에 aria-label이 없다');
  bar.found['.btn-data-retry'].listeners.click();
  assert.strictEqual(loc.reloads, 1, '다시 받기가 새로 고침하지 않는다');
  bar.found['.btn-data-dismiss'].listeners.click();
  assert.strictEqual(doc.body.children.length, 0, '닫기가 띠를 지우지 않는다');

  // 5. 스타일: 띠는 흐름 밖에 고정하고, 버튼은 44px 이상이다
  const css = read('style.css');
  const rule = (sel) => cut(css, `\n${sel} {`, '\n}');
  assert.ok(rule('.data-failed-banner').includes('position: fixed;'), '띠가 고정 위치가 아니다(CLS)');
  // 띠가 머리를 가리면 기기에 있는 저장 코스를 열 수 없었다(P-311). 위에 붙이지 않고 아래 막대(8px + 62px) 위에 둔다
  const bannerRule = rule('.data-failed-banner');
  assert.ok(!/^\s*top:/m.test(bannerRule), '띠가 위에 붙어 머리의 브랜드와 저장한 코스를 가린다');
  const bannerBottom = bannerRule.match(/^\s*bottom: calc\((\d+)px \+ env\(safe-area-inset-bottom/m);
  assert.ok(bannerBottom && Number(bannerBottom[1]) >= 70, '띠가 아래 막대(완성 버튼, 결과 막대)를 가린다');
  assert.ok(rule('.btn-data-retry').includes('min-height: 44px;'), '다시 받기 버튼이 44px보다 낮다');
  assert.ok(/min-width: 44px;\s*min-height: 44px;/.test(rule('.btn-data-dismiss')), '닫기 버튼이 44px보다 작다');

  console.log('ok spots-load-failure');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
