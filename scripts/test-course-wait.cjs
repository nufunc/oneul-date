// 첫 방문 데이터 전 코스 만들기 대기 회귀 테스트: node scripts/test-course-wait.cjs
// 대기 변수와 waitForFullSpots·resolveWaitingCourse를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('let fullSpotsPending');
const fnStart = src.indexOf('function resolveWaitingCourse', start);
const end = src.indexOf('\n}\n', fnStart) + 3;
assert.ok(start > 0 && fnStart > start, '대기 블록을 찾지 못했다');
const block = ts.transpile(src.slice(start, end), { target: 'es2022' });

function setup({ mode = 'course', hash = '', hasButton = true } = {}) {
  const calls = { render: 0, generated: 0 };
  const env = {
    state: { mainMode: mode },
    location: { hash },
    document: { getElementById: (id) => (id === 'btn-generate' && hasButton ? {} : null) },
    renderConditions: () => calls.render++,
  };
  const api = new Function(
    'state', 'location', 'document', 'renderConditions', 'calls',
    `${block}
    function triggerCourseGeneration() { if (waitForFullSpots()) return; calls.generated++; }
    return {
      trigger: triggerCourseGeneration,
      resolve: resolveWaitingCourse,
      setPending: (v) => { fullSpotsPending = v; },
      waiting: () => courseWaitingForSpots,
    };`,
  )(env.state, env.location, env.document, env.renderConditions, calls);
  return { api, calls, env };
}

// 캐시가 있거나 데이터가 이미 왔으면 바로 만든다
{
  const { api, calls } = setup();
  api.trigger();
  assert.strictEqual(calls.generated, 1, '대기 중이 아닌데 만들지 않았다');
  assert.strictEqual(api.waiting(), false);
}

// 데이터 전에 누르면 만들지 않고 대기로 그린다. 여러 번 눌러도 다시 그리지 않는다
{
  const { api, calls } = setup();
  api.setPending(true);
  api.trigger();
  api.trigger();
  assert.strictEqual(calls.generated, 0, '데이터 전에 샘플로 만들었다');
  assert.strictEqual(api.waiting(), true);
  assert.strictEqual(calls.render, 1, '대기 버튼을 한 번만 그려야 한다');
  // 데이터가 오면(실패해 샘플로 돌아간 경우도 같은 길) 한 번 만들고 버튼을 되돌린다
  api.resolve();
  assert.strictEqual(calls.generated, 1, '데이터가 온 뒤 만들지 않았다');
  assert.strictEqual(api.waiting(), false);
  assert.strictEqual(calls.render, 2, '버튼을 되돌려 그리지 않았다');
  api.trigger();
  assert.strictEqual(calls.generated, 2, '데이터 뒤에는 바로 만든다');
}

// 누르지 않았으면 데이터가 와도 만들지 않는다(오늘의 코스가 그대로 뜬다)
{
  const { api, calls } = setup();
  api.setPending(true);
  api.resolve();
  assert.strictEqual(calls.generated, 0);
  assert.strictEqual(calls.render, 0);
}

// 기다리는 동안 다른 화면으로 갔으면 덮지 않는다
for (const opts of [{ mode: 'spots' }, { hash: '#c=1,2,3' }, { hasButton: false }]) {
  const { api, calls, env } = setup();
  api.setPending(true);
  api.trigger();
  env.state.mainMode = opts.mode ?? 'course';
  env.location.hash = opts.hash ?? '';
  if (opts.hasButton === false) env.document.getElementById = () => null;
  api.resolve();
  assert.strictEqual(calls.generated, 0, `${JSON.stringify(opts)}에서 화면을 덮었다`);
  assert.strictEqual(api.waiting(), false, `${JSON.stringify(opts)}에서 대기가 남았다`);
}

// 버튼은 대기 동안 비활성이고 문구와 role="status"가 있다. 로드가 끝나면 성공·실패 모두 대기를 푼다
assert.ok(/id="btn-generate"\$\{courseWaitingForSpots \? ' disabled/.test(src), '대기 중 버튼 비활성이 없다');
assert.ok(src.includes(`'<span class="sr-only" role="status">스팟 불러오는 중…</span>'`), 'role=status 문구가 없다');
assert.ok(/fullSpotsPending = true;\s*\n\s*loadSpots\(\)/.test(src), '캐시 없는 로드에서만 대기를 켜야 한다');
assert.ok(src.includes('.finally(resolveWaitingCourse)'), '로드가 끝나도 대기를 풀지 않는다');
assert.ok(src.includes('if (!courseWaitingForSpots) applyDailyCourseIfEmpty();'), '기다리던 코스를 오늘의 코스가 먼저 덮는다');
console.log('ok course-wait');
