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
assert.ok(/^const RANGE_TIMEOUT_MS = 25000;/m.test(supa), 'RANGE_TIMEOUT_MS가 25000이 아니다');
assert.ok(supa.includes('setTimeout(() => ctrl.abort(), RANGE_TIMEOUT_MS)'), 'Range 중단 타이머가 RANGE_TIMEOUT_MS를 쓰지 않는다');

// 2. init의 첫 방문 로딩 블록을 떼어 실행한다: 받은 링크만 Range가 끝난 뒤 권역 파일을 받는다(P-505)
const block = cut(read('main.ts'), '  if (isSharedLink && !sharedReady()) {', '      .catch(() => {});\n  }\n');
const run = (isSharedLink, range) => {
  const log = [];
  const exec = new Function(
    'isSharedLink',
    'env',
    `let spots = [{ id: 9 }], spotById = null, state = { mainMode: 'course', regions: [] }, courseWaitingForSpots = false;
    const spotsFellBackToSample = false;
    const document = { getElementById: () => ({}) };
    const sharedIds = [1, 2], sharedReady = () => false, savedSpotRegionKeys = () => [];
    const dailyPick = () => ({ pickedRegion: 'SEOUL' }), regionKeyOf = (s) => s.region ?? null;
    const ensureSpotsForRegions = (keys) => { env.log.push('ensure:' + keys.join(',')); return Promise.resolve(); };
    const findSpotsByRange = () => { env.log.push('range'); return env.range(); };
    const buildSpotIndex = (x) => x;
    const handleRoute = () => env.log.push('handleRoute');
    const renderReceiverLoading = () => {}, renderShell = () => env.log.push('shell');
    const applyDailyCourseIfEmpty = () => env.log.push('daily');
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
  // 홈: 오늘 추천 권역 파일 하나를 곧바로(같은 동기 흐름에서) 받기 시작한다
  const home = run(false, null);
  assert.deepStrictEqual(home, ['ensure:SEOUL'], '홈 경로의 권역 파일 시작이 늦어졌거나 전국을 받는다');
  await tick();
  assert.deepStrictEqual(home, ['ensure:SEOUL', 'daily'], '권역을 받은 뒤 오늘의 코스를 그리지 않는다');

  // 받은 링크, Range 성공: Range가 끝날 때까지 권역 파일을 시작하지 않고, 끝나면 찾은 장소의 권역만 받는다
  const ok = deferred();
  const log1 = run(true, () => ok.p);
  await tick();
  assert.deepStrictEqual(log1, ['range'], 'Range가 끝나기 전에 권역 파일을 시작했다');
  ok.resolve([{ id: 1, region: 'SEOUL' }, { id: 2, region: 'JEJU' }]);
  await tick();
  assert.deepStrictEqual(log1.slice(0, 3), ['range', 'handleRoute', 'ensure:SEOUL,JEJU'], 'Range 성공 뒤 그리기와 권역 받기 순서가 다르다');

  // 받은 링크, Range 실패(빈 배열): 전국으로 넘어가 그린다
  const log2 = run(true, () => Promise.resolve([]));
  await tick();
  assert.deepStrictEqual(log2, ['range', 'ensure:ALL', 'handleRoute'], 'Range 실패 뒤 전국으로 넘어가지 않는다');

  // 받은 링크, Range가 예외로 거절돼도 전국으로 넘어간다
  const log3 = run(true, () => Promise.reject(new Error('x')));
  await tick();
  assert.deepStrictEqual(log3, ['range', 'ensure:ALL', 'handleRoute'], 'Range 거절 뒤 전국을 받지 않는다');

  console.log('ok receiver-range-first');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
