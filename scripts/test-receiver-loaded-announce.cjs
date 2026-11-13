// 받은 코스 완료 알림 회귀 테스트: node scripts/test-receiver-loaded-announce.cjs
// handleRoute를 src/main.ts에서 그대로 떼어 실행해, 대기 카드에서 바뀐 화면만 #sr-announce로 알리는지 본다(P-422)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function handleRoute(');
assert.ok(start > 0, 'handleRoute 없음');
const code = ts.transpile(src.slice(start, src.indexOf('\n}\n', start) + 3), { target: 'es2022' });

function run({ loading, ids = [1, 2, 3], built = 3 }) {
  const log = [];
  const document = { getElementById: (id) => (id === 'receiver-loading' && loading ? {} : null) };
  new Function(
    'document', 'location', 'parseCourseHash', 'buildSharedSteps', 'renderReceiverView', 'announce', 'showToast', 'clearCourseHash', 'renderShell',
    `${code};handleRoute();`,
  )(
    document,
    { hash: '#c=1.2.3' },
    () => ids,
    () => Array.from({ length: built }, (_, i) => ({ spotId: i + 1 })),
    () => { log.push('render'); loading = false; },
    (t) => log.push(`announce:${t}`),
    (t) => log.push(`toast:${t}`),
    () => log.push('clear'),
    () => log.push('shell'),
  );
  return log;
}

// 대기 카드에서 오면 그린 뒤 알린다
assert.deepStrictEqual(run({ loading: true }), ['render', 'announce:받은 코스를 불러왔어요. 장소 3곳']);
// 캐시로 바로 그린 첫 화면은 알리지 않는다
assert.deepStrictEqual(run({ loading: false }), ['render']);
// 뺀 곳 토스트는 완료 알림 뒤에 온다(announce가 50ms 안의 문구를 이어 읽는다)
assert.deepStrictEqual(run({ loading: true, ids: [1, 2, 3, 4], built: 3 }), [
  'render',
  'announce:받은 코스를 불러왔어요. 장소 3곳',
  'toast:공유된 4곳 중 1곳은 지금 코스에 넣을 수 없어 뺐어요',
]);
console.log('ok receiver-loaded-announce');
