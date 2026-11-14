// 장소 시트 주차 칸 문구 회귀 테스트(P-439): node scripts/test-sheet-parking-text.cjs
// PARKING_TYPE_TEXT와 sheetParkingText를 src/main.ts에서 그대로 떼어 실행하고(앱 번들과 같은 코드), 템플릿 연결은 소스 문자열로 확인한다
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('const PARKING_TYPE_TEXT');
const fnStart = src.indexOf('function sheetParkingText', start);
const end = src.indexOf('\n}\n', fnStart) + 3;
const sheetParkingText = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })};return sheetParkingText;`)();
const info = (type, detail) => ({ parking_info: { type, detail } });

// 영문 상태값은 type 문구로 바꾸되, detail의 무료·유료·발렛은 그 구분을 살린다
assert.strictEqual(sheetParkingText(info('available', 'free')), '무료 주차');
assert.strictEqual(sheetParkingText(info('available', 'available')), '주차 가능');
assert.strictEqual(sheetParkingText(info('available', 'paid')), '유료 주차');
assert.strictEqual(sheetParkingText(info('free', 'free')), '무료 주차');
assert.strictEqual(sheetParkingText(info('impossible', 'impossible')), '주차 불가');
// type이 없으면 상태값 자체를 풀이한다
assert.strictEqual(sheetParkingText(info(undefined, 'paid')), '유료 주차');

// '가능'과 '불가능' 한 낱말도 type 문구로 바꾼다
assert.strictEqual(sheetParkingText(info('available', '가능')), '주차 가능');
assert.strictEqual(sheetParkingText(info('impossible', '불가능')), '주차 불가');
assert.strictEqual(sheetParkingText(info(undefined, '불가능')), '주차 불가');

// 설명이 있는 원문은 그대로 둔다
assert.strictEqual(sheetParkingText(info('impossible', '주차 불가, 인근 유료 공영주차장 이용 권장')), '주차 불가, 인근 유료 공영주차장 이용 권장');
assert.strictEqual(sheetParkingText(info('available', '가능 (소형 10대)')), '가능 (소형 10대)');
assert.strictEqual(sheetParkingText({ parking_detail: '건물 지하 2시간 무료', ...info('available', 'free') }), '건물 지하 2시간 무료');

// type 'unknown' 기본 문구는 숨기고 parking_type으로 내려간다
assert.strictEqual(sheetParkingText(info('unknown', '인근 공영주차장 이용')), '');
assert.strictEqual(sheetParkingText({ parking_type: 'free', ...info('unknown', 'free') }), '무료 주차 가능');
assert.strictEqual(sheetParkingText({}), '');

// 시트는 이 함수를 쓴다
assert.ok(src.includes('const parkingText = sheetParkingText(spot);'));
console.log('ok sheet parking text');
