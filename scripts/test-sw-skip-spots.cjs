// 서비스 워커 spots.json 비가로채기 회귀 테스트: node scripts/test-sw-skip-spots.cjs
// P-297이 막은 결함: sw.js가 spots.json(풀린 22.5MB)을 Cache Storage에 한 번 더 저장해 origin 저장이 5MB에서 28MB로 늘었다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// 1. spots.json 경로는 respondWith 이전에 빠져나간다
const skip = sw.indexOf("if (url.pathname.endsWith('/data/spots.json')) return;");
const respond = sw.indexOf('event.respondWith');
assert.ok(skip >= 0, 'sw.js에 spots.json 예외가 없다');
assert.ok(respond > skip, 'spots.json 예외가 respondWith보다 앞에 있어야 한다');

// 2. CACHE_NAME은 배포된 v0.9.32와 달라야 옛 캐시를 activate가 지우고, 패키지 버전과 맞아야 한다
const name = /const CACHE_NAME = '([^']+)'/.exec(sw)[1];
assert.notStrictEqual(name, 'oneul-date-v0.9.32', 'CACHE_NAME이 배포된 값 그대로다');
assert.strictEqual(name, `oneul-date-v${pkg.version}`, 'CACHE_NAME과 package.json 버전이 어긋났다');

console.log('ok test-sw-skip-spots');
