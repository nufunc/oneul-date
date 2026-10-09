// 구·군 검색어 일치 판정 회귀 테스트: node scripts/test-search-district.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('const DISTRICT_END');
const code = src.slice(start, src.indexOf('\n}\n', start) + 3);
const { matchesDistrictQuery } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { matchesDistrictQuery };`)();

const spot = (name, address) => ({ name, address, area: address.split(' ').slice(0, 2).join(' '), location: '' });
const haeundae = spot('해운대 카페', '부산광역시 해운대구 우동 1');
const daegu = spot('동성로 카페', '대구광역시 중구 동성로 1');
const gangnam = spot('강남 카페', '서울 강남구 역삼동 1');
const ilsan = spot('호수 카페', '경기 고양시 일산동구 호수로 1');
const named = spot('대구막창', '서울 마포구 1');

assert.strictEqual(matchesDistrictQuery(haeundae, '대구'), false, '해운대구 주소는 대구에 일치하지 않는다');
assert.strictEqual(matchesDistrictQuery(daegu, '대구'), true, '대구광역시 주소는 대구에 일치한다');
assert.strictEqual(matchesDistrictQuery(gangnam, '남구'), false, '강남구 주소는 남구에 일치하지 않는다');
assert.strictEqual(matchesDistrictQuery(gangnam, '강남구'), true, '강남구는 강남구에 일치한다');
assert.strictEqual(matchesDistrictQuery(ilsan, '동구'), false, '일산동구는 동구에 일치하지 않는다');
assert.strictEqual(matchesDistrictQuery(ilsan, '일산동구'), true, '일산동구는 일산동구에 일치한다');
assert.strictEqual(matchesDistrictQuery(spot('x', '대구광역시 수성구 1'), '수성구'), true, '수성구는 수성구에 일치한다');
assert.strictEqual(matchesDistrictQuery(spot('x', '대구 동구 1'), '동구'), true, '주소 단어가 동구인 스팟은 동구에 일치한다');
assert.strictEqual(matchesDistrictQuery(named, '대구'), true, '이름에 든 말은 일치한다');
console.log('test-search-district: 모두 통과');
