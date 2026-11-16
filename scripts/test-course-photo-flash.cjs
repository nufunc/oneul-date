// 후보 전환 사진 깜박임과 찜 코스 다시 추천 알림 시험(P-471): node scripts/test-course-photo-flash.cjs
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
const toJs = (st) => ts.transpileModule(st.getText().replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const need = (names) => names.forEach((n) => assert.ok(decls.has(n), `${n}이 없다`));

// 1) markLoadedThumbs: 이미 받아진 사진(complete && naturalWidth > 0)에만 is-loaded를 같은 동기 구간에서 붙인다
need(['markLoadedThumbs']);
{
  const { markLoadedThumbs } = new Function(`${toJs(decls.get('markLoadedThumbs'))}\nreturn { markLoadedThumbs };`)();
  const img = (complete, naturalWidth) => {
    const set = new Set();
    return { complete, naturalWidth, classList: { add: (c) => set.add(c) }, set };
  };
  const imgs = [img(true, 300), img(false, 0), img(true, 0)];
  markLoadedThumbs({ querySelectorAll: (sel) => { assert.strictEqual(sel, 'img.step-thumb-img'); return imgs; } });
  assert.deepStrictEqual(imgs.map((i) => i.set.has('is-loaded')), [true, false, false], '받아진 사진만 is-loaded여야 한다');
  markLoadedThumbs(null);
}

// 2) 소스 훑기: renderResults가 renderResultsContent 바로 뒤에 부르고, 후보 전환 렌더만 eager로 둔다
{
  const rr = decls.get('renderResults').getText();
  assert.ok(/renderResultsContent\(\);\s*markLoadedThumbs\(area\);/.test(rr), 'renderResults가 렌더 직후 markLoadedThumbs를 부르지 않음');
  const sc = decls.get('selectCandidate').getText();
  assert.ok(/thumbEager = true;\s*try \{ renderResults\(\); \} finally \{ thumbEager = false; \}/.test(sc), 'selectCandidate가 렌더 동안만 thumbEager를 켜지 않음');
  assert.ok(src.includes(`loading="\${thumbEager ? 'eager' : 'lazy'}" fetchpriority="low"`), '카드 사진이 thumbEager로 loading을 정하지 않음');
  assert.strictEqual(src.split('thumbEager = true').length - 1, 1, 'eager는 후보 전환 한 곳에서만 켠다');
}

// 3) 찜 코스 다시 추천은 알림과 토스트에 사실을 밝히고, 일반 코스는 밝히지 않는다
need(['regenerateCourse', 'SAVED_REGENERATE_NOTICE']);
{
  const STUBS = ['state', 'showToast', 'renderResults', 'announceCourse', 'markResultsEngaged', 'spotById', 'buildAnchorCourse', 'addRecentSpotIds', 'courseSpotIds', 'generateCourse', 'spots', 'recentSpotIdSet', 'notifyRelaxedSlots', 'zoneRelaxedSlots', 'announceZoneRelaxed', 'announce'];
  const body = ['courseCandidates', 'candidateIndex', 'inCandidateMode', 'candidateLabel', 'replaceCourseKeepingCandidate', 'prevCourse', 'snapshotPrevCourse', 'SAVED_REGENERATE_NOTICE', 'regenerateCourse'].map((n) => toJs(decls.get(n))).join('\n');
  const make = new Function(...STUBS, `${body}\nreturn { regenerateCourse };`);
  const run = (fromSaved) => {
    const toasts = [];
    const state = {
      course: [{ slot: 'lunch', spotId: 1 }, { slot: 'cafe', spotId: 2 }],
      courseConditions: { regions: ['SEOUL'], subZones: [], mood: 'ALL', fromSaved },
      moodPreset: null,
    };
    const api = make(state, (t) => toasts.push(t), () => {}, () => {}, () => {}, new Map(), () => [], () => {}, () => [],
      () => [{ slot: 'lunch', spotId: 11 }, { slot: 'cafe', spotId: 12 }], [], () => new Set(), () => {}, () => [], () => {}, () => {});
    api.regenerateCourse();
    return toasts;
  };
  assert.deepStrictEqual(run(true), ['찜을 빼고 새로 추천했어요. ↩ 이전으로 찜 코스를 되돌릴 수 있어요.']);
  assert.deepStrictEqual(run(false), []);
  assert.deepStrictEqual(run(undefined), []);
}
console.log('OK test-course-photo-flash');
