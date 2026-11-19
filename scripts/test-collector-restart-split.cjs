// 수집기 단계 판정 시험(P-541): node scripts/test-collector-restart-split.cjs
// check_link_health.mjs의 summarizeCollector가 결과 줄 없이 기동 줄에서 끊긴 단계를 restart로 세고,
// 💤나 다음 ▶에서 결과 줄 없이 끝난 단계는 그대로 silent로 세는지 본다.
// 스크립트는 불러오면 바로 점검을 시작하므로 판정 함수 구간만 잘라 평가한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'check_link_health.mjs'), 'utf8');
const start = src.indexOf('const STAGE_RESULT');
const end = src.indexOf('function readCollectorLog');
assert.ok(start > 0 && end > start, 'check_link_health.mjs에서 summarizeCollector 구간을 찾지 못했다');
const summarizeCollector = new Function(`${src.slice(start, end)}; return summarizeCollector;`)();

// 시각은 KST이고 판정 구간에 들도록 지금 기준 몇 시간 전으로 만든다
const kst = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3 + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const log = [
  // 5단계: 결과 줄 없이 컨테이너가 다시 시작됨(2026-11-19 22:38 실측 형태)
  `[${kst(5)}] [INFO] ▶ 5단계: 소셜 동기화`,
  `[${kst(4.7)}] [INFO] 🌟 오늘 데이트 (oneul-date) — 백엔드 데이터 엔진 가동 (v4.0 8단계 통합)`,
  // 기동 직후 1단계는 결과 줄로 정상
  `[${kst(4.6)}] [INFO] ▶ 1단계: 메타 검증`,
  `[${kst(4.5)}] [INFO] ✅ OCI 엔진 완료: 정상검증 10건`,
  // 9단계: 기동과 무관하게 결과 줄 없이 끝남(삭제 전 9단계 실측 형태)
  `[${kst(4)}] [INFO] ▶ 9단계: 자동 보정 파이프라인 가동`,
  `[${kst(4)}] [INFO] 💤 8단계 전체 자율 수집 사이클 완료 (소요: 4.0분)`,
  // 4단계: 결과 줄을 낸 뒤 재시작되면 ok로 남는다
  `[${kst(3)}] [INFO] ▶ 4단계: 커뮤니티 마이닝`,
  `[${kst(2.9)}] [INFO] 4단계 완료: 신규 커뮤니티 스팟 1개 등록`,
  `[${kst(2.8)}] [INFO] 🌟 오늘 데이트 (oneul-date) — 백엔드 데이터 엔진 가동 (v4.0 8단계 통합)`,
  // 3단계: 재시작으로 한 번 끊기고 다음 실행은 silent
  `[${kst(2)}] [INFO] ▶ 3단계: 블로그 마이닝`,
  `[${kst(1.9)}] [INFO] 🌟 오늘 데이트 (oneul-date) — 백엔드 데이터 엔진 가동 (v4.0 8단계 통합)`,
  `[${kst(1)}] [INFO] ▶ 3단계: 블로그 마이닝`,
  `[${kst(0.9)}] [INFO] 💤 8단계 전체 자율 수집 사이클 완료 (소요: 4.0분)`,
].join('\n');

const { perStage } = summarizeCollector(log, 26);
const by = Object.fromEntries(perStage.map((s) => [s.stage, s]));

assert.strictEqual(by[5].last_two.at(-1).status, 'restart', '기동 줄에서 끊긴 5단계가 restart가 아니다');
assert.strictEqual(by[5].restart_in_window, 1);
assert.strictEqual(by[5].ok_in_window, 0);
assert.strictEqual(by[1].last_two.at(-1).status, 'ok', '기동 줄이 1단계 구간에 섞였다');
assert.strictEqual(by[9].last_two.at(-1).status, 'silent', '💤에서 결과 줄 없이 끝난 9단계가 silent가 아니다');
assert.strictEqual(by[9].restart_in_window, 0);
assert.strictEqual(by[4].last_two.at(-1).status, 'ok', '결과 줄을 낸 뒤 재시작된 4단계가 ok가 아니다');
assert.deepStrictEqual(by[3].last_two.map((r) => r.status), ['restart', 'silent']);

// 실패 판정 규칙: 재시작으로 중단된 실행만 있으면 실패가 아니고, 재시작이 아닌 결과 없는 실행이 남으면 실패다
const fails = (s) => s.runs_in_window > 0 && s.ok_in_window === 0 && s.runs_in_window > s.restart_in_window;
assert.ok(src.includes('s.ok_in_window === 0 && s.runs_in_window > s.restart_in_window'), '실패 판정식이 시험과 다르다');
assert.strictEqual(fails(by[5]), false, '재시작으로만 끊긴 5단계를 실패로 센다');
assert.strictEqual(fails(by[9]), true, '결과 줄 없이 끝난 9단계를 실패로 세지 않는다');
assert.strictEqual(fails(by[3]), true, '재시작 뒤 silent로 끝난 3단계를 실패로 세지 않는다');

console.log('test-collector-restart-split: ok');
