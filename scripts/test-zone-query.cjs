// 검색어 동네 존 인식 회귀 테스트: node scripts/test-zone-query.cjs (P-360)
// POPULAR_ZONES와 zoneKeysForQuery를 src/main.ts에서 떼어 실행한다. 도시가 앞에 붙은 라벨의 동네 이름만 친 검색도 존으로 받는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const code = [cut('const POPULAR_ZONES', '\n];\n'), cut('function zoneKeysForQuery', '\n}\n')].join('\n');
const { zoneKeysForQuery, POPULAR_ZONES } = new Function(`${ts.transpile(code, { target: 'es2022' })};return { zoneKeysForQuery, POPULAR_ZONES };`)();

const keyOf = (label) => POPULAR_ZONES.find((z) => z.label === label).key;
assert.deepStrictEqual(zoneKeysForQuery('서면'), zoneKeysForQuery('부산 서면'));
assert.notDeepStrictEqual(zoneKeysForQuery('서면'), []);
assert.deepStrictEqual(zoneKeysForQuery('동성로 맛집'), [keyOf('대구 동성로·교동')]);
assert.deepStrictEqual(zoneKeysForQuery('한옥마을'), [keyOf('전주 한옥마을·객리단길')]);
assert.deepStrictEqual(zoneKeysForQuery('광안리 카페'), [keyOf('부산 광안리·영도')]);
// 일반어 꼬리와 도시 이름만은 존이 아니다
assert.deepStrictEqual(zoneKeysForQuery('시내'), []);
assert.deepStrictEqual(zoneKeysForQuery('부산'), []);
assert.deepStrictEqual(zoneKeysForQuery(''), []);

console.log('test-zone-query: ok');
