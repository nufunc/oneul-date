// 중복 제거 권역 키 회귀 테스트: node scripts/test-dedupe-area-full-name.cjs
// 권역 키가 이름 어근으로 묶어 좌표가 8km 떨어진 대성사(이원)과 대성사(옥천), 테라스룸 신사점과 청담점을 한 행으로 합쳤다(P-212)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('const DEDUPE_REGION_TOKENS');
const fnStart = src.indexOf('function deduplicateSpotList');
const end = src.indexOf('\n}\n', fnStart) + 3;
assert.ok(start >= 0 && fnStart > start && end > fnStart, '떼어 낼 구간을 찾지 못했다');
const js = ts.transpile(src.slice(start, end), { target: 'es2022' });
const dedupe = new Function('cleanSpotSummary', `${js};return deduplicateSpotList;`)((s) => s.summary || '');

const row = (id, name, region, area, address) => ({ id, name, region, area, address, location: '', is_closed: false });
const ids = (list) => dedupe(list).map((s) => s.id);

// 같은 권역의 다른 장소는 합치지 않는다
assert.deepStrictEqual(ids([
  row(1, '대성사(옥천)', '충북', '옥천', '충북 옥천군 옥천읍 삼양리 1'),
  row(2, '대성사(이원)', '충북', '옥천', '충북 옥천군 이원면 개심리 2'),
]), [1, 2], '괄호로 구별한 두 절');
assert.deepStrictEqual(ids([
  row(3, '테라스룸 신사', '서울', '강남', '서울 강남구 압구정로 1'),
  row(4, '테라스룸 청담', '서울', '강남', '서울 강남구 선릉로 2'),
]), [3, 4], '지역 낱말만 다른 두 지점');
// 이름이 같으면 주소 표기가 달라도 계속 합친다
assert.deepStrictEqual(ids([
  row(5, '주왕산 국립공원', '경북', '청송', '경북 청송군 주왕산면 공원길 169'),
  row(6, '주왕산국립공원', '경북', '청송', '경북 청송군 주왕산면 상의리'),
]), [5], '띄어쓰기만 다른 같은 장소');
// 1순위 주소 키는 그대로다: 같은 건물의 본점 표기는 합친다
assert.deepStrictEqual(ids([
  row(7, '카페 도림', '서울', '문래', '서울 영등포구 도림로129길 5-1'),
  row(8, '카페 도림 본점', '서울', '문래', '서울 영등포구 도림로129길 5-1'),
]), [7], '같은 주소의 본점 표기');
console.log('test-dedupe-area-full-name: ok');
