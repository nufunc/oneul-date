// 받은 링크 Range 우선 회귀 테스트: node scripts/test-receiver-range-first.cjs
// P-410이 막은 결함: Slow 3G에서 Range 빠른 경로가 6초 제한에 걸렸고, 같은 때 시작한 전체 spots.json(4.4MB)과 대역폭을 나눠
// 받은 코스가 91초 동안 대기 카드에 머물렀다
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

// 1. Range 시간 제한은 15초이고 findSpotsByRange의 중단 타이머가 그 값을 쓴다
const supa = read('supabase.ts');
assert.ok(/^const RANGE_TIMEOUT_MS = 15000;/m.test(supa), 'RANGE_TIMEOUT_MS가 15000이 아니다');
assert.ok(supa.includes('setTimeout(() => ctrl.abort(), RANGE_TIMEOUT_MS)'), 'Range 중단 타이머가 RANGE_TIMEOUT_MS를 쓰지 않는다');

// 2. init의 첫 방문 로딩 블록을 떼어 실행한다: 받은 링크만 Range가 끝난 뒤 전체 파일을 받는다
const block = cut(read('main.ts'), '    const loadFullSpots = () =>', '      loadFullSpots();\n    }\n');
const run = (isSharedLink, range) => {
  const log = [];
  const exec = new Function(
    'isSharedLink',
    'env',
    `let spots = [], spotById = null, state = { mainMode: 'course' }, courseWaitingForSpots = false;
    const spotsFellBackToSample = false, loadedRegionKeys = new Set(), spotAliasIds = new Map();
    const location = { hash: '#c=1.2' };
    const document = { getElementById: () => ({}) };
    const parseCourseHash = () => [1, 2];
    const loadSpots = () => { env.log.push('loadSpots'); return Promise.resolve([{ id: 1 }, { id: 2 }]); };
    const findSpotsByRange = () => { env.log.push('range'); return env.range(); };
    const deduplicateSpotList = (x) => x, buildSpotIndex = (x) => x, canonicalizeSavedSpotIds = () => {};
    const handleRoute = () => env.log.push('handleRoute');
    const renderReceiverLoading = () => {}, renderShell = () => {}, showSpotsFailedBanner = () => {};
    const renderSpotDiscovery = () => {}, applyDailyCourseIfEmpty = () => {}, isCourseEligible = () => true;
    const resolveWaitingCourse = () => env.log.push('done');
    ${ts.transpile(block, { target: 'es2022' })}`,
  );
  exec(isSharedLink, { log, range });
  return log;
};
const deferred = () => {
  let resolve, reject;
  const p = new Promise((a, b) => ((resolve = a), (reject = b)));
  return { p, resolve, reject };
};
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  // 홈: 전체 파일을 곧바로(같은 동기 흐름에서) 시작한다
  assert.deepStrictEqual(run(false, null), ['loadSpots'], '홈 경로의 전체 파일 시작이 늦어졌다');

  // 받은 링크, Range 성공: Range가 끝날 때까지 전체 파일을 시작하지 않는다
  const ok = deferred();
  const log1 = run(true, () => ok.p);
  await tick();
  assert.deepStrictEqual(log1, ['range'], 'Range가 끝나기 전에 전체 파일을 시작했다');
  ok.resolve([{ id: 1 }, { id: 2 }]);
  await tick();
  assert.deepStrictEqual(log1.slice(0, 3), ['range', 'handleRoute', 'loadSpots'], 'Range 성공 뒤 그리기와 전체 파일 순서가 다르다');

  // 받은 링크, Range 실패(빈 배열): 전체 파일로 넘어가 그린다
  const log2 = run(true, () => Promise.resolve([]));
  await tick();
  assert.deepStrictEqual(log2, ['range', 'loadSpots', 'handleRoute', 'done'], 'Range 실패 뒤 전체 파일로 넘어가지 않는다');

  // 받은 링크, Range가 예외로 거절돼도 전체 파일로 넘어간다
  const log3 = run(true, () => Promise.reject(new Error('x')));
  await tick();
  assert.ok(log3.includes('loadSpots') && log3.at(-1) === 'done', 'Range 거절 뒤 전체 파일을 받지 않는다');

  console.log('ok receiver-range-first');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
