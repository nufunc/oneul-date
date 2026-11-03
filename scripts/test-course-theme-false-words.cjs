// 테마 낱말이 다른 말의 일부로 맞는 오판 회귀 테스트: node scripts/test-course-theme-false-words.cjs
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
const themes = SPOT_EXPLORE_CATEGORIES.filter((c) => c.keywords);
const spa = themes.find((c) => c.key === 'SPA').keywords;
// 지우기 전 판정: 판정 글에 낱말이 들어 있기만 하면 맞는다
const naive = (s, kws) => {
  const t = [s.name, s.category, s.summary, ...(s.signature_items || []), ...(s.mood_tags || [])].join(' ').toLowerCase();
  return kws.some((k) => t.includes(k.toLowerCase()));
};

// (a) ♨️ 낱말이 다른 말의 일부로만 맞는 장소는 맞지 않는다(product-reviewer-134 오판 21곳, 2026-11-03 spots.json)
const FALSE_IDS = [
  662, 1479, 1938, 1961, 2763, 4695, 5158, 5415, 8079, 8168, 1788688966754, 1789257687789, 1789642760405, 1790307057058, 1790434398482,
  1790562717189, 1790742136937, 1790772603560, 1791473957752, 1791587567731, 1791775118033,
];
const byId = new Map(spots.map((s) => [s.id, s]));
let present = 0;
for (const id of FALSE_IDS) {
  const s = byId.get(id);
  if (!s || !naive(s, spa)) continue;
  present++;
  assert.ok(!matchesCategoryTheme(s, spa), `♨️ 오판이 맞았다: ${id} ${s.name} / ${s.category}`);
}
assert.ok(present >= 15, `오판 장소가 데이터에 ${present}곳만 남았다. 목록을 다시 본다`);

// (b) 이름에 다른 말과 진짜 스파 낱말이 함께 있으면 맞는다
const mk = (name, category = '') => ({ name, category, summary: '' });
for (const name of ['인스파이어 리조트 스파', '사우나미 옆 사우나', '스파크랜드 찜질방', '에스파스 온천']) assert.ok(matchesCategoryTheme(mk(name), spa), `정상 일치를 잃었다: ${name}`);
for (const name of ['인스파이어 아레나', '사우나미 서울숲', '스파크랜드', '에스파스 루이비통', '서퍼스파라다이스', '빌라드스파이시']) assert.ok(!matchesCategoryTheme(mk(name), spa), `오판이 맞았다: ${name}`);
assert.ok(matchesCategoryTheme(mk('러쉬 스파 압구정점', '스파·힐링'), spa));
assert.ok(matchesCategoryTheme(mk('스파랜드 센텀시티', '찜질방'), spa));

// (c) 칩마다 지우기 전과 비교해 빠진 장소는 ♨️ 오판뿐이다: 다른 칩 일치와 ♨️ 정상 일치를 잃지 않는다
const falseSet = new Set(FALSE_IDS);
for (const theme of themes) {
  const dropped = spots.filter((s) => naive(s, theme.keywords) && !matchesCategoryTheme(s, theme.keywords));
  if (theme.key === 'SPA') assert.deepStrictEqual(dropped.filter((s) => !falseSet.has(s.id)).map((s) => s.name), [], '♨️ 정상 일치를 잃었다');
  else assert.deepStrictEqual(dropped.map((s) => s.name), [], `${theme.emoji} 일치를 잃었다`);
}

console.log(`ok: ♨️ 오판 ${present}곳 제외, 다른 칩 ${themes.length - 1}개 일치 그대로`);
