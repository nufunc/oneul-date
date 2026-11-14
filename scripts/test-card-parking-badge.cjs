// 코스 카드 주차 배지 회귀 테스트(P-438): node scripts/test-card-parking-badge.cjs
// renderStepCard의 주차 배지 분기를 src/main.ts에서 그대로 떼어 실행한다(앱 번들과 같은 코드)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('  const pType = spot.parking_info?.type || spot.parking_type;');
assert(start >= 0, 'src/main.ts에 카드 주차 배지 분기가 없다');
const end = src.indexOf('\n  }\n', start) + 5;
const badge = new Function('spot', `const metaBadges = [];${ts.transpile(src.slice(start, end), { target: 'es2022' })};return metaBadges.join('');`);
const text = (type) => badge({ parking_info: { type } }).replace(/<[^>]+>/g, '');

// 시트가 주차 칸을 그리는 type은 카드도 배지를 그린다
assert.strictEqual(text('impossible'), '🅿️ 주차불가');
assert.strictEqual(text('available'), '🅿️ 주차가능');
// 기존 문구는 그대로
assert.strictEqual(text('valet'), '🅿️ 발렛가능');
assert.strictEqual(text('free'), '🅿️ 무료주차');
// 유료는 시트의 '유료 주차'와 맞춘다
assert.strictEqual(text('paid'), '🅿️ 유료주차');
// 모르는 값은 배지 없음
assert.strictEqual(text('unknown'), '');
assert.strictEqual(badge({}), '');
// parking_info가 없으면 parking_type을 본다
assert.strictEqual(badge({ parking_type: 'impossible' }).replace(/<[^>]+>/g, ''), '🅿️ 주차불가');
console.log('ok card parking badge');
