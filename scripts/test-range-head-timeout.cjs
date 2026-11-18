// 받은 링크 Range 첫 요청 헤더 대기 제한 회귀 테스트: node scripts/test-range-head-timeout.cjs
// P-492가 막은 결함: 응답이 없는 망에서 첫 bytes=0-0 헤더가 오지 않아도 Range 전체 제한 25초를 다 기다린 뒤
// 전체 파일 15초가 더해져 공유 링크 실패 카드가 40초에 떴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'supabase.ts'), 'utf8');
// 1. 헤더 제한은 전체 파일의 SPOTS_IDLE_MS와 같고 Range 전체 제한(P-410)은 그대로다
const idle = Number(/^const SPOTS_IDLE_MS = (\d+);/m.exec(src)[1]);
assert.strictEqual(Number(/^const RANGE_HEAD_MS = (\d+);/m.exec(src)[1]), idle, 'RANGE_HEAD_MS가 SPOTS_IDLE_MS와 다르다');
assert.ok(/^const RANGE_TIMEOUT_MS = 25000;/m.test(src), 'RANGE_TIMEOUT_MS가 25000이 아니다');

// findSpotsByRange를 떼어 제한만 줄여 실행한다: 헤더 60ms, 전체 600ms
const start = src.indexOf('const RANGE_URL');
const end = src.indexOf('\n}\n', src.indexOf('async function findSpotsByRange')) + 3;
const body = src
  .slice(start, end)
  .replace(/^export /gm, '')
  .replace(/import\.meta\.env\.BASE_URL/g, "'/oneul-date/'")
  .replace(/^const RANGE_HEAD_MS = \d+;/m, 'const RANGE_HEAD_MS = 60;')
  .replace(/^const RANGE_TIMEOUT_MS = \d+;/m, 'const RANGE_TIMEOUT_MS = 600;');
const { findSpotsByRange } = new Function('normalizeSpots', `${ts.transpile(body, { target: 'es2022' })};return { findSpotsByRange };`)(
  (rows) => rows,
);

const rows = Array.from({ length: 50 }, (_, i) => ({ id: 10 + i * 3, name: `스팟 ${i}`, summary: 'x'.repeat(300) }));
const file = Buffer.from(JSON.stringify(rows), 'utf8');
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))));
  });
// delay(n번째 요청) ms 뒤 응답 헤더를 낸다. Infinity면 중단될 때까지 응답하지 않는다(hang)
let delay = () => 0;
let requests = 0;
global.fetch = async (url, init) => {
  const n = requests++;
  const m = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);
  const a = +m[1];
  const z = Math.min(+m[2], file.length - 1);
  const d = delay(n);
  if (d === Infinity) await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  else await sleep(d, init.signal);
  const part = file.subarray(a, z + 1);
  return {
    status: 206,
    headers: { get: (k) => (k.toLowerCase() === 'content-range' ? `bytes ${a}-${z}/${file.length}` : null) },
    arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.length),
  };
};
const run = async (ids, d) => {
  delay = d;
  requests = 0;
  const t0 = Date.now();
  const found = await findSpotsByRange(ids);
  return { found, ms: Date.now() - t0, requests };
};

(async () => {
  // 2. hang: 첫 요청 헤더가 오지 않으면 전체 제한(600ms)이 아니라 헤더 제한(60ms) 뒤 빈 배열로 그만둔다.
  //    호출부는 빈 배열이면 전체 파일로 넘어간다(test-receiver-range-first.cjs가 단언)
  const hang = await run([rows[7].id], () => Infinity);
  assert.deepStrictEqual(hang.found, [], 'hang에서 빈 배열이 아니다');
  assert.strictEqual(hang.requests, 1, `hang에서 첫 요청 뒤 더 요청했다: ${hang.requests}건`);
  assert.ok(hang.ms >= 50 && hang.ms < 300, `hang에서 헤더 제한으로 그만두지 않았다: ${hang.ms}ms`);

  // 3. 느린 망(P-410): 첫 헤더가 제한 안에 오면 탐색 전체가 헤더 제한보다 길어도 끝까지 찾는다
  const slow = await run([rows[7].id, rows[40].id], () => 30);
  assert.deepStrictEqual(slow.found, [rows[7], rows[40]], '느린 망에서 찾지 못했다');
  assert.ok(slow.ms > 60, `탐색이 헤더 제한보다 짧아 시험이 느린 망을 흉내 내지 못했다: ${slow.ms}ms`);

  // 4. 첫 헤더 뒤 다음 요청이 멈추면 전체 제한(600ms)까지 기다린 뒤 그만둔다(헤더 제한은 첫 요청에만 걸린다)
  const later = await run([rows[7].id], (n) => (n === 0 ? 0 : Infinity));
  assert.deepStrictEqual(later.found, []);
  assert.ok(later.ms >= 550, `첫 요청 뒤 멈춤에서 헤더 제한이 걸렸다: ${later.ms}ms`);

  console.log('ok range-head-timeout');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
