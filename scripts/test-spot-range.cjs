// 받은 링크 Range 탐색 회귀 테스트: node scripts/test-spot-range.cjs
// findRowHead·extractRow·findSpotsByRange를 src/supabase.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'supabase.ts'), 'utf8');
const start = src.indexOf('const RANGE_URL');
const end = src.indexOf('\n}\n', src.indexOf('async function findSpotsByRange')) + 3;
const code = ts.transpile(src.slice(start, end).replace(/^export /gm, ''), { target: 'es2022' });
const { findRowHead, extractRow, findSpotsByRange } = new Function(
  'normalizeSpots',
  `${code};return { findRowHead, extractRow, findSpotsByRange };`,
)((rows) => rows);

// 동기화와 같은 형식(id 오름차순, 공백 없음, 한글 그대로)의 가짜 spots.json. 행마다 길이가 달라 탐색이 여러 라운드를 돈다
const rows = Array.from({ length: 600 }, (_, i) => ({
  id: 1000 + i * 7,
  name: `한글 스팟 ${i} ${'가나다😀'.repeat(i % 40)}`,
  summary: 'x'.repeat(200 + (i % 13) * 50),
}));
const file = Buffer.from(JSON.stringify(rows), 'utf8');
const posOf = (id) => file.indexOf(`{"id":${id},`);

// 1. 바이트 위치: 조각이 다중 바이트 문자 가운데서 시작해도 행 머리 위치를 바이트로 센다
const target = rows[101];
const headPos = posOf(target.id);
// 앞 행 이름의 첫 4바이트 문자 둘째 바이트에서 자른다. 그 뒤에도 한글이 이어진다
const cut = file.indexOf(Buffer.from('😀'), posOf(rows[100].id)) + 1;
const h = findRowHead(new Uint8Array(file.subarray(cut, cut + 2048)));
assert.deepStrictEqual(h, { pos: headPos - cut, id: target.id }, '잘린 다중 바이트 문자 뒤 행 머리 위치가 어긋난다');
// 문자열로 디코드해 세면 위치가 달라진다(feature-76 첫 시도가 놓친 까닭)
assert.notStrictEqual(new TextDecoder().decode(file.subarray(cut, cut + 2048)).indexOf('{"id":'), headPos - cut);
// id 숫자가 조각 끝에서 잘리면 믿지 않는다
assert.strictEqual(findRowHead(new Uint8Array(file.subarray(headPos, headPos + 8))), null);

// 2. 첫 행과 마지막 행을 꺼낸다(마지막 행은 배열 끝 `]` 앞에서 끝난다)
const whole = new Uint8Array(file);
assert.deepStrictEqual(extractRow(whole, rows[0].id), rows[0], '첫 행');
assert.deepStrictEqual(extractRow(whole, rows.at(-1).id), rows.at(-1), '마지막 행');
assert.deepStrictEqual(extractRow(new Uint8Array(file.subarray(posOf(rows.at(-1).id))), rows.at(-1).id), rows.at(-1), '마지막 행 조각');
assert.strictEqual(extractRow(whole, 1001), null, '없는 id');

// Range 요청을 흉내 내는 fetch
let opts = {};
let requests = 0;
global.fetch = async (url, init) => {
  requests++;
  const m = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);
  const a = +m[1];
  const z = Math.min(+m[2], file.length - 1);
  const total = opts.growAfter && requests > opts.growAfter ? file.length + 10 : file.length;
  const headers = new Map([['content-range', `bytes ${a}-${z}/${total}`]]);
  if (opts.encoding) headers.set('content-encoding', opts.encoding);
  const body = opts.status === 200 ? file : file.subarray(a, z + 1);
  return {
    status: opts.status || 206,
    headers: { get: (k) => headers.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
  };
};
const run = async (ids, o = {}) => {
  opts = o;
  requests = 0;
  const found = await findSpotsByRange(ids);
  return { found, requests };
};

(async () => {
  // 3. 첫 행, 마지막 행, 다중 바이트 문자가 많은 가운데 행을 함께 찾는다
  const ids = [rows[0].id, rows.at(-1).id, rows[101].id, rows[333].id];
  const ok = await run(ids);
  assert.deepStrictEqual(ok.found, [rows[0], rows.at(-1), rows[101], rows[333]], '탐색 결과');
  assert.ok(ok.requests < 300, `요청 ${ok.requests}건`);
  // 모든 행을 하나씩 찾아도 맞는다
  for (const r of rows) assert.deepStrictEqual((await run([r.id])).found, [r], `id ${r.id}`);

  // 4. 하나라도 못 찾으면 빈 배열이다(호출부가 전체 파일을 기다린다)
  assert.deepStrictEqual((await run([rows[5].id, 1001])).found, []);

  // 5. 되돌아가기: 206이 아님, 압축 응답, 탐색 중 전체 크기 변경
  assert.deepStrictEqual((await run([rows[5].id], { status: 200 })).found, [], '200 응답');
  assert.deepStrictEqual((await run([rows[5].id], { encoding: 'gzip' })).found, [], '압축 응답');
  assert.deepStrictEqual((await run([rows[5].id], { growAfter: 3 })).found, [], '전체 크기 변경');
  assert.deepStrictEqual((await run([])).found, []);

  console.log('ok spot-range');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
