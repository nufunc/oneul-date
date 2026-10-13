// zoneSelectionMatcher 회귀 테스트: node scripts/test-zone-selection.cjs
// 한 권역의 세부존이 전부 선택되면 그 권역은 권역만 고른 것으로 판정하는지(P-134)와
// 일부만 고른 경로는 세부존으로 거르는 동작이 그대로인지를 본다.
// 함수와 상수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사).
// matchesZone은 키워드 매칭이 길어 이 테스트의 대상이 아니므로 spot.zone 값으로 대체한다.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const pick = (decl) => {
  const start = src.indexOf(`\n${decl}`) + 1;
  if (start === 0) throw new Error(`not found: ${decl}`);
  const end = decl.startsWith('function') ? src.indexOf('\n}\n', start) + 3 : src.indexOf('\n];\n', start) + 4;
  return src.slice(start, end);
};
const code = ['const REGIONS', 'const POPULAR_ZONES', 'function matchesRegion', 'function zoneSelectionMatcher'].map(pick).join('\n');
const { zoneSelectionMatcher, POPULAR_ZONES } = new Function(
  `const matchesZone = (s, zks) => zks.includes(s.zone);\n${ts.transpile(code, { target: 'es2022' })};return { zoneSelectionMatcher, POPULAR_ZONES };`,
)();

const zonesOf = (rk) => POPULAR_ZONES.filter((z) => z.regionKey === rk).map((z) => z.key);
const seoulZones = zonesOf('SEOUL');
const gyeonggiZones = zonesOf('GYEONGGI');
// 서울 광진구는 어떤 세부존에도 걸리지 않는 스팟(P-134 재현값), 성수는 seongsu 존에 걸린다
const gwangjin = { region: '서울', zone: null };
const seongsu = { region: '서울', zone: 'seongsu' };
const suwonSpot = { region: '경기', zone: 'suwon' };
const gyeonggiOther = { region: '경기', zone: null };
const busan = { region: '영남', zone: null };

const CASES = [
  ['세부존 없음은 거르지 않는다', [], null],
  ['서울 세부존 전부는 서울 전체를 통과시킨다', seoulZones, [[gwangjin, true], [seongsu, true], [suwonSpot, false], [busan, false]]],
  ['서울 일부만 고르면 그 세부존만 통과한다', ['seongsu'], [[seongsu, true], [gwangjin, false], [suwonSpot, false]]],
  ['서울 하나 빼고 전부 골라도 일부 선택이다', seoulZones.slice(1), [[seongsu, false], [gwangjin, false]]],
  ['서울 전부와 경기 일부는 서울 전체와 경기 그 세부존이다', [...seoulZones, 'suwon'],
    [[gwangjin, true], [seongsu, true], [suwonSpot, true], [gyeonggiOther, false], [busan, false]]],
  ['서울 전부와 경기 전부는 두 권역 전체다', [...seoulZones, ...gyeonggiZones],
    [[gwangjin, true], [gyeonggiOther, true], [busan, false]]],
  ['모르는 세부존 키는 일부 선택으로 남는다', ['no-such-zone'], [[seongsu, false]]],
];

let failed = 0;
for (const [label, zoneKeys, expects] of CASES) {
  const match = zoneSelectionMatcher(zoneKeys);
  if (expects === null) {
    if (match !== null) { failed++; console.error(`FAIL ${label}: ${typeof match}`); }
    continue;
  }
  expects.forEach(([spot, want], i) => {
    const got = match(spot);
    if (got !== want) { failed++; console.error(`FAIL ${label} #${i}: ${JSON.stringify(spot)} got ${got} want ${want}`); }
  });
}
if (failed) process.exit(1);
console.log(`ok ${CASES.length}`);
