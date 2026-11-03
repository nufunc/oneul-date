// 공유 링크 테마 칩 시험(P-292): node scripts/test-receiver-theme.cjs
// src/main.ts에서 shareThemeKey, buildShareUrl, SPOT_EXPLORE_CATEGORIES, 받은 화면의 칩 읽기와 저장 리터럴을 떼어 실행한다.
// 켠 칩은 `?t=<칩 키>`로 실리고 끈 칩은 안 붙는지, 링크의 잘못된 키는 버리는지,
// 받은 코스 저장 항목에 categoryKey가 들어가고 `t`가 없는 옛 링크는 지금과 같은지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.ES2022, true);
const decls = new Map();
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && decls.set(d.name.text, st));
}
const toJs = (code) =>
  ts.transpileModule(code.replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^"use strict";\s*/, '');
const declJs = (name) => {
  assert.ok(decls.has(name), `선언이 없다: ${name}`);
  return toJs(decls.get(name).getText());
};

const makeShare = new Function('location', `${declJs('SPOT_EXPLORE_CATEGORIES')}\n${declJs('shareThemeKey')}\n${declJs('buildShareUrl')}\nreturn { buildShareUrl, shareThemeKey, SPOT_EXPLORE_CATEGORIES };`);
const loc = (search) => ({ origin: 'https://nufunc.github.io', pathname: '/oneul-date/', search });
const { SPOT_EXPLORE_CATEGORIES } = makeShare(loc(''));
const share = (search, ids, key) => makeShare(loc(search)).buildShareUrl(ids, key);

// 1. 켠 칩은 `?t=`로 실리고, 끈 코스(없음, 전체)는 붙지 않는다
assert.strictEqual(share('', [1, 2, 3], 'CAFE'), 'https://nufunc.github.io/oneul-date/?t=CAFE#c=1.2.3');
assert.strictEqual(share('', [1, 2, 3], undefined), 'https://nufunc.github.io/oneul-date/#c=1.2.3', '칩을 끈 코스에 t가 붙었다');
assert.strictEqual(share('', [1, 2, 3], 'ALL'), 'https://nufunc.github.io/oneul-date/#c=1.2.3', '전체 칩에 t가 붙었다');
// 모든 칩 키가 그대로 실린다
for (const c of SPOT_EXPLORE_CATEGORIES.filter((c) => c.key !== 'ALL')) {
  assert.ok(share('', [1], c.key).includes(`?t=${c.key}#c=1`), `칩 ${c.key}가 실리지 않았다`);
}

// 2. 잘못된 키는 링크에 싣지도 받지도 않는다. 받은 링크에서 이어받은 옛 t는 새 칩으로 바뀌거나 지워진다
assert.strictEqual(share('', [1], 'XYZ'), 'https://nufunc.github.io/oneul-date/#c=1', '잘못된 키가 실렸다');
assert.strictEqual(share('?t=OCEAN', [1], undefined), 'https://nufunc.github.io/oneul-date/#c=1', '옛 t가 남았다');
assert.strictEqual(share('?t=OCEAN', [1], 'CAFE'), 'https://nufunc.github.io/oneul-date/?t=CAFE#c=1', '옛 t가 새 칩으로 바뀌지 않았다');
assert.strictEqual(share('?x=1', [1], 'CAFE'), 'https://nufunc.github.io/oneul-date/?x=1&t=CAFE#c=1', '다른 검색어를 잃었다');
const { shareThemeKey } = makeShare(loc(''));
for (const bad of ['XYZ', 'cafe', 'ALL', '', null, undefined, '__proto__', 'CAFE&x=1']) assert.strictEqual(shareThemeKey(bad), undefined, `잘못된 키를 받았다: ${bad}`);
assert.strictEqual(shareThemeKey('CAFE'), 'CAFE');

// 3. 보내는 쪽은 코스 스냅숏의 categoryKey를 읽고(화면 칩이 아니다) 지역 코스에서만 싣는다
assert.match(src, /buildShareUrl\(ids, byArea \? cond\.categoryKey : undefined\)/, '🔗 공유가 코스 스냅숏의 categoryKey를 싣지 않는다');
assert.ok(!/buildShareUrl\([^)]*state\.courseCategory/.test(src), '공유 링크가 화면 칩을 읽는다');

// 4. 받는 쪽: 링크의 t를 검증해 읽고, 저장 항목에 categoryKey를 넣어 제목이 칩을 따른다. 다시 공유도 같은 칩을 잇는다
const view = src.slice(src.indexOf('function renderReceiverView('));
const readLine = view.match(/const sharedCategoryKey = ([^;]+);/);
assert.ok(readLine, '받은 화면이 sharedCategoryKey를 읽지 않는다');
const readKey = (search) => new Function('location', 'URLSearchParams', 'shareThemeKey', `return ${readLine[1]};`)(loc(search), URLSearchParams, shareThemeKey);
assert.strictEqual(readKey('?t=CAFE'), 'CAFE');
assert.strictEqual(readKey('?t=XYZ'), undefined, '잘못된 키를 받았다');
assert.strictEqual(readKey(''), undefined);

const saveStart = view.indexOf("'btn-receiver-save'");
const lit = view.slice(saveStart).match(/const item: SavedCourse = (\{[\s\S]*?\n    \});/);
assert.ok(lit, '받은 코스 저장 리터럴이 없다');
const sharedThemeLine = view.slice(saveStart).match(/const sharedTheme = [^\n]+;/);
assert.ok(sharedThemeLine, 'sharedTheme 계산이 없다');
const makeItem = new Function(
  'SPOT_EXPLORE_CATEGORIES', 'sharedCategoryKey', 'steps', 'sharedSpotIds', 'blogSlug', 'area', 'regionsLabel', 'moodLabel',
  toJs(`${sharedThemeLine[0]}\nreturn (${lit[1]});`),
);
const save = (key) => makeItem(SPOT_EXPLORE_CATEGORIES, key, [{ slot: 'day' }, { slot: 'evening' }], [1, 2], null, { regions: ['SEOUL'], subZones: [] }, () => '서울', () => '모든 분위기');
const cafe = save('CAFE');
assert.strictEqual(cafe.conditions.categoryKey, 'CAFE', '받은 코스 저장 항목에 categoryKey가 없다');
assert.strictEqual(cafe.title, '서울 · ☕ 감성카페', `받은 코스 저장 제목: ${cafe.title}`);
const plain = save(undefined);
assert.strictEqual(plain.conditions.categoryKey, undefined, '칩 없는 링크가 categoryKey를 넣었다');
assert.strictEqual(plain.title, '서울 · 모든 분위기', `옛 링크 저장 제목이 달라졌다: ${plain.title}`);
assert.match(view, /buildShareUrl\(sharedSpotIds, sharedCategoryKey\)/, '받은 링크 다시 공유가 칩을 잇지 않는다');

console.log('test-receiver-theme: 통과');
