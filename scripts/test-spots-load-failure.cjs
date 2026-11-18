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
  // 1. loadStaticSpots: 실패면 고른 권역의 샘플 행을 돌려주고 표시를 세운다. 캐시 저장은 합친 목록을 가진 main.ts가 한다(P-505)
  const supa = read('supabase.ts');
  // 샘플 동적 import(P-414)는 new Function 안에서 받을 수 없어 주입한 rawSpotsData로 바꾼다
  const colsCode = cut(supa, 'export function rowsFromColumns', '\n}\n').replace(/^export /gm, '');
  const loadCode = cut(supa, '// 권역 파일 색인', '\n}\n\n// 받은 링크').replace(/^export /gm, '').replace(/\n\/\/ 받은 링크$/, '')
    .replace("(await import('./data/spots.sample.json')).default", 'rawSpotsData')
    .replace(/import\.meta\.env\.BASE_URL/g, "'/oneul-date/'");
  const sample = [{ id: 1, region: '서울' }, { id: 2, region: '제주' }];
  const env = { response: null, urls: [] };
  const mod = new Function(
    'env',
    'normalizeSpots',
    'rawSpotsData',
    '__SPOTS_INDEX__',
    `const fetch = async (url) => {
      env.urls.push(url);
      const r = typeof env.response === 'function' ? env.response(url) : env.response;
      if (r instanceof Error) throw r;
      return r;
    };
    ${ts.transpile(colsCode, { target: 'es2022' })}
    ${ts.transpile(loadCode, { target: 'es2022' })}
    return { loadStaticSpots, flag: () => spotsFellBackToSample, expected: () => spotsBytesExpected };`,
  )(env, (rows) => rows, sample, { seoul: { regions: ['서울'], bytes: 10 }, jeju: { regions: ['제주'], bytes: 5 } });

  const seoulRows = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, region: '서울' }));
  const toCols = (rows) => ({ id: rows.map((r) => r.id), region: rows.map((r) => r.region) });
  const cases = [
    ['500', { ok: false, status: 500, json: async () => ({}) }],
    ['연결 끊김', new TypeError('Failed to fetch')],
    ['받는 도중 끊김', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON'); } }],
    ['빈 열', { ok: true, status: 200, json: async () => ({ id: [] }) }],
  ];
  for (const [label, response] of cases) {
    env.response = response;
    const got = await mod.loadStaticSpots(['서울']);
    assert.deepStrictEqual(got, [sample[0]], `${label}: 고른 권역의 샘플을 돌려주지 않았다`);
    assert.strictEqual(mod.flag(), true, `${label}: 샘플로 떨어졌다는 표시가 없다`);
  }

  // 권역 파일 하나만 받아 행으로 바꾸고, 분모는 그 파일의 풀린 크기다
  env.response = { ok: true, status: 200, json: async () => toCols(seoulRows) };
  env.urls = [];
  assert.deepStrictEqual(await mod.loadStaticSpots(['서울']), seoulRows, '권역 열 형식 본문을 행으로 바꾸지 못했다');
  assert.deepStrictEqual(env.urls, ['/oneul-date/data/spots/seoul.cols.json'], '고른 권역 파일 하나만 받지 않았다');
  assert.strictEqual(mod.flag(), false, '성공한 뒤에도 실패 표시가 남았다');
  assert.strictEqual(mod.expected(), 10, '분모가 고른 권역 파일 크기가 아니다');
  // 지역을 고르지 않으면(전국) 권역 파일을 모두 받는다
  env.urls = [];
  env.response = (url) => ({ ok: true, status: 200, json: async () => toCols(url.includes('jeju') ? [{ id: 7, region: '제주' }] : seoulRows) });
  assert.strictEqual((await mod.loadStaticSpots()).length, 6);
  assert.deepStrictEqual(env.urls, ['/oneul-date/data/spots/seoul.cols.json', '/oneul-date/data/spots/jeju.cols.json']);
  assert.strictEqual(mod.expected(), 15);
  // 한 권역이라도 비면 샘플이다
  env.response = (url) => ({ ok: true, status: 200, json: async () => (url.includes('jeju') ? { id: [] } : toCols(seoulRows)) });
  assert.deepStrictEqual(await mod.loadStaticSpots(), sample, '빈 권역 파일을 실패로 보지 않았다');

  // 권역 파일이 404면 행 파일을 받아 고른 권역만 남기고, 둘 다 없으면 샘플이다
  const notFound = { ok: false, status: 404, json: async () => ({}) };
  const rowFile = [...seoulRows, { id: 7, region: '제주' }];
  env.response = (url) => (url.endsWith('.cols.json') ? notFound : { ok: true, status: 200, json: async () => rowFile });
  env.urls = [];
  assert.deepStrictEqual(await mod.loadStaticSpots(['제주']), [{ id: 7, region: '제주' }], '404 뒤 행 파일에서 고른 권역만 남기지 않았다');
  assert.deepStrictEqual(env.urls, ['/oneul-date/data/spots/jeju.cols.json', '/oneul-date/data/spots.json']);
  assert.strictEqual(mod.flag(), false);
  assert.strictEqual(mod.expected(), 0, '행 파일로 넘어가면 분모를 모른다');
  env.response = notFound;
  assert.deepStrictEqual(await mod.loadStaticSpots(['서울']), [sample[0]], '두 파일 모두 404인데 샘플이 아니다');
  assert.strictEqual(mod.flag(), true);
  // 500은 되돌림 대상이 아니다: 행 파일을 다시 받지 않고 샘플로 떨어진다
  env.response = { ok: false, status: 500, json: async () => ({}) };
  env.urls = [];
  await mod.loadStaticSpots(['서울']);
  assert.deepStrictEqual(env.urls, ['/oneul-date/data/spots/seoul.cols.json']);

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
  // 낭독은 #sr-announce가 맡는다(P-494, scripts/test-receiver-failed-announce.cjs). 문단에 alert를 두면 두 번 읽힌다
  assert.ok(!/role="(alert|status)"/.test(failedHtml), '실패 문단에 라이브 영역 role이 남아 두 번 읽힌다');
  assert.ok(!failedHtml.includes('불러오는 중'), '실패 카드에 불러오는 중 문구가 남았다');
  assert.ok(html().includes('불러오는 중') && !html().includes('btn-receiver-retry'), '기본 자리표시가 바뀌었다');
  const renderLoading = cut(main, 'function renderReceiverLoading(', '\n}\n');
  assert.ok(renderLoading.includes("getElementById('btn-receiver-retry')?.addEventListener('click', () => location.reload())"), '다시 불러오기가 새로 고침이 아니다');

  // 3. 샘플로 떨어지면 받은 링크는 판정(handleRoute → clearCourseHash)하지 않고, 홈은 띠를 띄운다(P-505: 권역 받기 loadRegionFiles)
  const initShared = cut(main, '  if (isSharedLink && !sharedReady()) {', '      .catch(() => {\n');
  assert.ok(
    /if \(!document\.getElementById\('receiver-loading'\)\) return;\s*if \(spotsFellBackToSample\) renderReceiverLoading\(true\);\s*else if \(spots\.length > 0\) handleRoute\(\);/.test(initShared),
    '실패한 받은 링크가 handleRoute로 판정된다',
  );
  const loadFn = cut(main, 'async function loadRegionFiles', '\n}\n');
  // 띠의 곳 수는 스팟 탐색 탭 목록과 같은 거르기로 센다. spots.length면 폐업과 코스 제외가 섞여 탭 수와 어긋났다(P-256)
  const listable = '!s.is_closed && isCourseEligible(s)';
  assert.ok(
    loadFn.includes(`if (!document.getElementById('receiver-loading')) showSpotsFailedBanner(spots.filter((s) => ${listable}).length);`),
    '홈에서 실패 띠를 띄우지 않거나 곳 수를 탐색 탭과 다르게 센다',
  );
  assert.ok(cut(main, 'function renderSpotDiscovery(', '\n}\n').includes(`deduplicateSpotList(spots.filter((s) => ${listable}))`), '탐색 탭 후보 거르기가 띠와 달라졌다');
  // 이미 받은 실제 권역(캐시 새로 고침 포함)은 받지 못해도 샘플로 바꾸지 않고, 샘플 권역 행은 캐시에 저장하지 않는다
  assert.ok(loadFn.includes('if (spotsFellBackToSample && keys.every((k) => loadedRegionKeys.has(k) && !sampleRegionKeys.has(k))) return;'), '받지 못한 새로 고침이 캐시의 실제 데이터를 샘플로 덮는다');
  assert.ok(/saveSpotsToCache\(spots\.filter\(\(s\) => \{ const k = regionKeyOf\(s\); return k === null \|\| !sampleRegionKeys\.has\(k\); \}\), keys\)/.test(loadFn), '샘플 권역 행을 캐시에 저장한다');

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
    body: { children: [], appendChild(el) { this.children.push(el); }, prepend(el) { this.children.unshift(el); } },
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
