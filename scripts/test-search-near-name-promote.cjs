// 검색 표준 질의 미달 3건의 회귀 시험(P-455): node scripts/test-search-near-name-promote.cjs
// 1) 점수 스크립트가 앱 전역 spots를 채워 50/50을 내는가 2) 결과 안에 이름 전체 일치가 없을 때만 근사 이름을 맨 앞으로 옮기는가
// 3) '경리단길'이 실제 도로명 회나무로 주소의 장소까지 맞추는가. 선언은 src/main.ts에서 떼어 실행하고 스팟은 실제 파일을 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);

const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
// state는 localStorage를 읽으므로 떼어 오지 않고 기본값으로 넣는다
decls.delete('state');
const roots = ['promoteNearNameMatches', 'filterDiscoverySpots', 'searchRelevanceTier', 'matchesSearchQuery', 'deduplicateSpotList', 'isCourseEligible'];
const need = new Set();
const queue = [...roots];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text)) queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  if (decls.has(name)) walk(decls.get(name));
}
for (const name of roots) assert.ok(decls.has(name), `src/main.ts에 ${name}가 없다`);
const code = [...new Set([...need].filter((n) => decls.has(n)).map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');

const rawSpots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const state = { regions: [], subZones: [], spotCategory: 'ALL', indoorOnly: false, savedOnly: false, savedSpotIds: new Set(), moodPreset: null, budgetFilter: 'ALL' };
const m = new Function(
  'rawSpotsData', 'state', '__st',
  `${ts.transpile(code, { target: 'es2022' })};stationCoords=__st;return { ${roots.join(', ')} };`,
)(rawSpots, state, stations);

const candidates = m.deduplicateSpotList(rawSpots.filter((s) => !s.is_closed && m.isCourseEligible(s)));
// 탐색 탭과 같은 순서: 거름 → 관련도 등급 안정 정렬 → 근사 이름 앞세움
const search = (q) => {
  const list = m.filterDiscoverySpots(candidates, q).matchedSpots.slice();
  list.sort((a, b) => m.searchRelevanceTier(a, q) - m.searchRelevanceTier(b, q));
  m.promoteNearNameMatches(list, q);
  return list;
};

// 1. 점수 스크립트: 전역 spots를 채워 지역 질의가 지역 중심으로 정렬되고, 표준 질의 50개가 상위1·상위3 모두 통과한다
const score = fs.readFileSync(path.join(root, 'scripts', 'score-search-standard.cjs'), 'utf8');
assert.ok(score.includes('spots=deduplicateSpotList(rawSpotsData);'), '점수 스크립트가 전역 spots를 채우지 않는다');
const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'score-search-standard.cjs')], { encoding: 'utf8' });
assert.match(out, /^전체\t50\t50\/50 100%\t50\/50 100%$/m, `표준 질의 점수 미달:\n${out}`);
assert.match(out, /^지역\+업종\t8\t8\/8 100%\t8\/8 100%\t8\/8\t0$/m, `지역+업종 미달:\n${out}`);

// 2. 앱 탐색 탭이 등급 정렬 바로 뒤에 근사 이름 앞세움을 부른다
assert.match(src, /matchedSpots\.sort\(\(a, b\) => searchRelevanceTier\(a, q\) - searchRelevanceTier\(b, q\)\);\n\s*promoteNearNameMatches\(matchedSpots, q\);/, '탐색 탭 정렬 뒤 promoteNearNameMatches 호출이 없다');

// 2-1. 결과가 있어도 이름 전체 일치가 없으면 한 글자 틀린 이름이 1위다
for (const [q, id] of [['임진각 평하누리공원', 683], ['담양힐링파트', 1790209625815]]) {
  const list = search(q);
  assert.ok(list.length > 1, `${q}는 근사 경로가 아니라 정상 결과가 있는 질의여야 한다`);
  assert.strictEqual(list[0].id, id, `${q}의 1위가 ${list[0].id}:${list[0].name}다`);
}

// 2-2. 이름에 검색어 전체가 든 곳이 있으면 순서를 바꾸지 않는다(한 글자 다른 이름 '스타필트 하남'이 있어도 '스타필드 하남'이 앞)
const exact = [{ id: 1, name: '스타필드 하남' }, { id: 2, name: '스타필트 하남' }];
m.promoteNearNameMatches(exact, '스타필드 하남');
assert.deepStrictEqual(exact.map((s) => s.id), [1, 2]);
const typo = [{ id: 1, name: '하남 쇼핑몰', category: '', location: '', area: '', address: '' }, { id: 2, name: '스타필드 하남' }];
m.promoteNearNameMatches(typo, '스타필트 하남');
assert.deepStrictEqual(typo.map((s) => s.id), [2, 1]);
const empty = [];
m.promoteNearNameMatches(empty, '스타필트 하남');
assert.deepStrictEqual(empty, []);

// 3. 경리단길: 회나무로 주소 장소가 모두 용산구 이태원동·용산동2가 일대(동이 적힌 행의 좌표 범위 안)이고, 검색이 그 장소를 맞춘다
const dongRows = rawSpots.filter((s) => s.lat != null && /이태원동|용산동2가/.test([s.address, s.location].join(' ')));
const box = { la: [Math.min(...dongRows.map((s) => s.lat)), Math.max(...dongRows.map((s) => s.lat))], ln: [Math.min(...dongRows.map((s) => s.lng)), Math.max(...dongRows.map((s) => s.lng))] };
const hoe = candidates.filter((s) => (s.address || '').includes('회나무로'));
assert.ok(hoe.length >= 10, `회나무로 주소 장소가 ${hoe.length}곳뿐이다`);
for (const s of hoe) {
  assert.ok(s.address.includes('용산구'), `${s.id} ${s.address}는 용산구 밖이다`);
  assert.ok(s.lat >= box.la[0] && s.lat <= box.la[1] && s.lng >= box.ln[0] && s.lng <= box.ln[1], `${s.id} ${s.name}는 이태원동·용산동2가 좌표 범위 밖이다`);
}
const gil = search('경리단길');
const gilIds = new Set(gil.map((s) => s.id));
for (const s of hoe) assert.ok(gilIds.has(s.id), `경리단길 결과에 회나무로 ${s.id}:${s.name}가 없다`);
assert.ok(gil.length >= 20, `경리단길 결과가 ${gil.length}건이다`);
assert.strictEqual(gil.slice(0, 3).length, 3);

console.log('test-search-near-name-promote: ok');
