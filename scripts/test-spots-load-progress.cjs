// spots.json 받기 진행과 무응답 제한 회귀 테스트: node scripts/test-spots-load-progress.cjs
// loadStaticSpots(src/supabase.ts)와 spotsLoadPct, spotsWaitLabel(src/main.ts)을 그대로 떼어 TypeScript로 변환해 실행한다.
// P-257이 막은 결함: 멈춘 연결에서 완성 버튼이 끝없이 '스팟 불러오는 중…'에 머물렀고, 받는 20초 동안 진행 신호가 없었다
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

const IDLE = 80; // 15초를 시험 시간에 맞춰 줄인다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const supa = read('supabase.ts');
  const loadCode = cut(supa, 'export let spotsFellBackToSample', '\n}\n').replace(/^export /gm, '');
  assert.ok(/const SPOTS_IDLE_MS = 15000;/.test(loadCode), '무응답 제한이 15초가 아니다');
  assert.ok(!/setTimeout\(\s*\(\)\s*=>\s*ctrl\.abort\(\),\s*\d/.test(loadCode), '전체 시간 고정 제한이 생겼다');
  const sample = [{ id: 1 }];
  const env = { fetch: null, timers: new Set() };
  const mod = new Function(
    'env',
    'normalizeSpots',
    'rawSpotsData',
    'saveSpotsToCache',
    `const fetch = (...a) => env.fetch(...a);
    const setTimeout = (fn, ms) => { const h = globalThis.setTimeout(() => { env.timers.delete(h); fn(); }, ms); env.timers.add(h); return h; };
    const clearTimeout = (h) => { env.timers.delete(h); globalThis.clearTimeout(h); };
    ${ts.transpile(loadCode.replace('SPOTS_IDLE_MS = 15000', `SPOTS_IDLE_MS = ${IDLE}`), { target: 'es2022' })}
    return { loadStaticSpots, onSpotsProgress, flag: () => spotsFellBackToSample, bytes: () => spotsBytesReceived };`,
  )(env, (rows) => rows, sample, () => {});

  const full = Array.from({ length: 50 }, (_, i) => ({ id: 100 + i, name: `한글 스팟 ${i}` }));
  const file = Buffer.from(JSON.stringify(full), 'utf8');
  // 조각을 gap 간격으로 count개만 내고 멈춘다(count가 전체면 닫는다). 요청이 끊기면 스트림도 오류로 끝난다
  const serve = ({ headerDelay = 0, gap = 0, count = Infinity, parts = 10 }) => (url, init) =>
    new Promise((resolve, reject) => {
      assert.ok(init && init.signal, 'fetch에 signal을 넘기지 않았다');
      const size = Math.ceil(file.length / parts);
      const body = new ReadableStream({
        async start(c) {
          init.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          for (let i = 0; i < Math.min(count, parts); i++) {
            await sleep(gap);
            if (init.signal.aborted) return;
            c.enqueue(new Uint8Array(file.subarray(i * size, (i + 1) * size)));
          }
          if (count >= parts) c.close();
        },
      });
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      if (headerDelay !== Infinity) setTimeout(() => resolve({ ok: true, body }), headerDelay);
    });

  // 1. 꾸준히 오는 느린 받기는 전체 시간이 제한의 몇 배여도 끊지 않고, 받은 바이트를 늘어나는 순서로 알린다
  const seen = [];
  mod.onSpotsProgress((n) => seen.push(n));
  env.fetch = serve({ headerDelay: IDLE / 2, gap: IDLE / 2, parts: 10 });
  let t0 = Date.now();
  let got = await mod.loadStaticSpots();
  assert.ok(Date.now() - t0 > IDLE * 3, '시험 받기가 제한보다 충분히 길지 않다');
  assert.deepStrictEqual(got, full, '느린 받기를 끊었거나 본문을 잘못 이었다');
  assert.strictEqual(mod.flag(), false);
  assert.strictEqual(seen.length, 10, '조각마다 진행을 알리지 않았다');
  assert.ok(seen.every((n, i) => i === 0 || n > seen[i - 1]), '받은 바이트가 늘어나는 순서가 아니다');
  assert.strictEqual(seen[seen.length - 1], file.length, '마지막 알림이 풀린 전체 크기와 다르다');
  assert.strictEqual(mod.bytes(), file.length);
  assert.strictEqual(env.timers.size, 0, '받은 뒤 무응답 타이머가 남았다');

  // 2. 헤더가 오지 않으면 약 IDLE 뒤 끊고 샘플로 떨어진다
  env.fetch = serve({ headerDelay: Infinity });
  t0 = Date.now();
  got = await mod.loadStaticSpots();
  let took = Date.now() - t0;
  assert.strictEqual(got, sample, '헤더 무응답에서 샘플로 떨어지지 않았다');
  assert.strictEqual(mod.flag(), true);
  assert.ok(took >= IDLE && took < IDLE * 4, `헤더 무응답 제한 시각이 어긋난다: ${took}ms`);
  assert.strictEqual(env.timers.size, 0, '끊은 뒤 타이머가 남았다');

  // 3. 본문 도중 멈추면 마지막 바이트에서 약 IDLE 뒤 끊고 샘플로 떨어진다. 새 받기는 받은 바이트를 0부터 다시 센다
  seen.length = 0;
  env.fetch = serve({ gap: 5, count: 3, parts: 10 });
  t0 = Date.now();
  got = await mod.loadStaticSpots();
  took = Date.now() - t0;
  assert.strictEqual(got, sample, '본문 무응답에서 샘플로 떨어지지 않았다');
  assert.strictEqual(mod.flag(), true);
  assert.strictEqual(seen.length, 3);
  assert.ok(seen[0] < file.length / 5, '새 받기가 앞 받기의 바이트에 이어 셌다');
  assert.ok(took >= IDLE && took < IDLE * 4, `본문 무응답 제한 시각이 어긋난다: ${took}ms`);
  assert.strictEqual(env.timers.size, 0, '끊은 뒤 타이머가 남았다');
  mod.onSpotsProgress(null);

  // 4. 버튼 문구: 분모가 없으면 기존 문구, 다 받아도 99%에서 멈춘다
  const main = read('main.ts');
  const pctCode = cut(main, 'function spotsLoadPct', 'function paintSpotsProgress');
  assert.ok(/declare const __SPOTS_JSON_BYTES__: number;/.test(main), '빌드 상수 선언이 없다');
  const label = (total, bytes) =>
    new Function('SPOTS_JSON_BYTES', 'spotsBytesReceived', `${ts.transpile(pctCode.replace('function paintSpotsProgress', ''), { target: 'es2022' })};return spotsWaitLabel();`)(total, bytes);
  assert.strictEqual(label(0, 5000), '스팟 불러오는 중…', '분모가 0인데 비율을 냈다');
  assert.strictEqual(label(1000, 0), '스팟 받는 중 0%');
  assert.strictEqual(label(1000, 437), '스팟 받는 중 43%');
  assert.strictEqual(label(1000, 1000), '스팟 받는 중 99%', '다 받기 전에 100%를 보였다');
  assert.strictEqual(label(1000, 1500), '스팟 받는 중 99%', '분모보다 큰 파일에서 99%를 넘었다');

  // 5. 진행 알림은 버튼 글자와 CSS 변수만 바꾸고, role=status 알림 문구에는 비율을 넣지 않는다
  const paint = cut(main, 'function paintSpotsProgress', '\n}\n');
  assert.ok(!/renderConditions|innerHTML|role/.test(paint), '진행 알림이 화면을 다시 그리거나 알림 영역을 건드린다');
  assert.ok(paint.includes("style.setProperty('--load-pct'"), '채움 비율 CSS 변수를 바꾸지 않는다');
  assert.ok(main.includes(`'<span class="sr-only" role="status">스팟 불러오는 중…</span>'`), 'role=status 문구가 바뀌었다');

  console.log('test-spots-load-progress: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
