// 테마 앵커로 뽑히던 지점명·상호 오판 회귀 테스트(P-287): node scripts/test-course-theme-anchor-false.cjs
// matchesCategoryTheme과 그 함수가 부르는 선언을 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고,
// 스팟은 실제 파일(public/data/spots.json)을 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);

// 최상위 함수·변수 선언을 이름으로 모으고 matchesCategoryTheme에서 닿는 것만 남긴다
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const need = new Set();
const queue = ['matchesCategoryTheme', 'SPOT_EXPLORE_CATEGORIES'];
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
const code = [...new Set([...need].map((n) => decls.get(n)))]
  .sort((a, b) => a.pos - b.pos)
  .map((st) => st.getText().replace(/^export\s+/, ''))
  .join('\n');
const { matchesCategoryTheme, SPOT_EXPLORE_CATEGORIES } = new Function(
  `${ts.transpile(code, { target: 'es2022' })};return { matchesCategoryTheme, SPOT_EXPLORE_CATEGORIES };`,
)();

const spots = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const byId = new Map(spots.map((s) => [s.id, s]));
const COURSE_CHIPS = ['CAFE', 'DINING', 'WINE', 'PUB', 'NIGHT', 'OCEAN', 'CULTURE', 'HEALING', 'SPA'];
const kwOf = (key) => SPOT_EXPLORE_CATEGORIES.find((c) => c.key === key).keywords;
// 더하기 전 판정: ♨️ 다른 말 다섯만 지운다(P-284)
const before = (s, kws) => {
  const t = [s.name, s.category, s.summary, ...(s.signature_items || []), ...(s.mood_tags || [])]
    .join(' ')
    .toLowerCase()
    .replace(/스파이|스파크|에스파스|스파라다이스|사우나미/g, ' ');
  return kws.some((k) => t.includes(k.toLowerCase()));
};

// (a) 다른 말 23개로 빠지는 34곳은 각 칩에 맞지 않는다(product-reviewer-137, 2026-11-03 spots.json)
const FALSE_IDS = {
  DINING: [1788939168379, 1790243907145, 1790258777155, 1790292413990],
  WINE: [9601, 1788737485482, 1793533331634],
  NIGHT: [2982, 4585, 4984, 6174, 1788894276541, 1788914106523, 1789996808330, 1790791408435, 1790831484968, 1792163368045, 4977, 4979],
  OCEAN: [
    1788631648741, 1788631652537, 1789125210148, 1789635322654, 1789650172887, 1790070955487, 1790427947643, 1790465132712, 1790935406122,
    1792448062425,
  ],
  CULTURE: [1788818282373, 1788820159771, 1788953629654, 1790258776242, 1792980784678],
};
// 정상 일치였으나 '물고기골목'을 지우며 함께 빠지는 일본식주점 1곳(리드가 대가로 받아들임)
const LOST_IDS = { DINING: [1792411507239] };
let present = 0;
for (const [key, ids] of Object.entries(FALSE_IDS)) {
  for (const id of ids) {
    const s = byId.get(id);
    if (!s || !before(s, kwOf(key))) continue;
    present++;
    assert.ok(!matchesCategoryTheme(s, kwOf(key)), `${key} 오판이 맞았다: ${id} ${s.name} / ${s.category}`);
  }
}
assert.ok(present >= 25, `오판 장소가 데이터에 ${present}곳만 남았다. 목록을 다시 본다`);

// (b) 이름에 다른 말이 없는 정상 장소는 그대로 맞는다
for (const [id, key] of [[1719, 'OCEAN'], [1788633474915, 'OCEAN'], [315, 'NIGHT']]) {
  const s = byId.get(id);
  if (s) assert.ok(matchesCategoryTheme(s, kwOf(key)), `정상 일치를 잃었다: ${s.name} (${key})`);
}
const mk = (name, category = '') => ({ name, category, summary: '' });
for (const [name, key] of [['석촌호수공원', 'OCEAN'], ['석촌호수 서호', 'OCEAN'], ['N서울타워', 'NIGHT'], ['한강공원 루프탑', 'NIGHT'], ['가든테라스 야경 루프탑', 'NIGHT']])
  assert.ok(matchesCategoryTheme(mk(name), kwOf(key)), `정상 일치를 잃었다: ${name} (${key})`);
for (const [name, key] of [['설빙 석촌호수동호점', 'OCEAN'], ['난산리식당 팜테라스그릴 성산', 'NIGHT'], ['천안역전시장', 'CULTURE'], ['리와인드 서울', 'WINE'], ['순천만 가든테라스 바베큐 순천', 'NIGHT']])
  assert.ok(!matchesCategoryTheme(mk(name), kwOf(key)), `오판이 맞았다: ${name} (${key})`);

// (c) 칩 9개 각각에서 더하기 전과 견줘 빠진 장소는 목록 34곳과 물고기골목뿐이다
const allowed = new Set([...Object.values(FALSE_IDS), ...Object.values(LOST_IDS)].flat());
for (const key of COURSE_CHIPS) {
  const dropped = spots.filter((s) => before(s, kwOf(key)) && !matchesCategoryTheme(s, kwOf(key)));
  assert.deepStrictEqual(dropped.filter((s) => !allowed.has(s.id)).map((s) => s.name), [], `${key} 정상 일치를 잃었다`);
}

console.log(`ok: 지점명·상호 오판 ${present}곳 제외, 칩 ${COURSE_CHIPS.length}개 정상 일치 그대로`);
