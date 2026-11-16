// 저장한 앵커·검색어·찜 코스 복원 시험(P-472): node scripts/test-saved-course-anchor.cjs
// 저장 버튼의 SavedCourse 리터럴, restoreCourse, regenerateCourse, courseTitle을 src/main.ts에서 떼어 실행한다.
// 앵커(📍)·검색어(🔍)·찜(❤️) 코스를 저장해 다시 열면 제목이 유지되고 다시 추천이 앵커·검색어를 잇는지,
// 필드가 없는 옛 저장 항목은 오류 없이 지역 코스로 열리는지 본다
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

// courseTitle과 그 함수가 부르는 선언을 모은다. spotById는 앵커와 찜 제목이 읽으므로 장소 두 곳을 넣는다
assert.ok(decls.has('courseTitle'), 'courseTitle이 없다');
const need = new Set();
const queue = ['courseTitle'];
while (queue.length) {
  const name = queue.pop();
  if (need.has(name)) continue;
  need.add(name);
  const walk = (n) => {
    if (ts.isIdentifier(n) && decls.has(n.text) && !need.has(n.text) && n.text !== 'spotById') queue.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(decls.get(name));
}
const titleJs = [...new Set([...need].map((n) => decls.get(n)))].sort((a, b) => a.pos - b.pos).map(toJs).join('\n');
const spotMap = new Map([[1, { id: 1, name: '케이퍼스튜디오', region: '서울 성동구' }], [2, { id: 2, name: '서울숲', region: '서울 성동구' }]]);
const courseTitle = new Function('spotById', `${titleJs}\nreturn courseTitle;`)(spotMap);

assert.ok(decls.has('regenerateCourse'), 'regenerateCourse가 없다');
const STUBS = ['state', 'spotById', 'buildAnchorCourse', 'addRecentSpotIds', 'courseSpotIds', 'renderResults', 'generateCourse', 'spots', 'recentSpotIdSet', 'notifyRelaxedSlots', 'markResultsEngaged', 'announceCourse', 'zoneRelaxedSlots', 'announceZoneRelaxed', 'showToast', 'SAVED_REGENERATE_NOTICE'];
const makeRegenerate = new Function(...STUBS, `${['courseCandidates', 'candidateIndex', 'inCandidateMode', 'candidateLabel', 'replaceCourseKeepingCandidate', 'prevCourse', 'snapshotPrevCourse', 'regenerateCourse'].map((n) => toJs(decls.get(n))).join('\n')}\nreturn regenerateCourse;`);

// 저장 버튼(#btn-save)이 만드는 SavedCourse 리터럴을 떼어 같은 state로 평가한다
const saveBlock = src.slice(src.indexOf("'#btn-save')"));
const lit = saveBlock.match(/const item: SavedCourse = (\{[\s\S]*?\n    \});/);
assert.ok(lit, '저장 버튼의 SavedCourse 리터럴이 없다');
const litJs = ts.transpileModule(`return (${lit[1]});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const makeItem = new Function('state', 'ids', 'courseTitle', litJs);

const restoreJs = ['SLOT_ORDER', 'normalizeRegionCond', 'prevCourse', 'courseCandidates', 'candidateIndex', 'candidatePrev', 'inCandidateMode', 'MOOD_PRESETS', 'knownMoodPreset', 'knownBudgetFilter', 'loadedCourse', 'restoreCourse'].map((n) => toJs(decls.get(n))).join('\n');
const RSTUBS = ['state', 'updateModeView', 'renderConditions', 'renderResults', 'document', 'cancelOverlayFocusReturn', 'markResultsEngaged'];
const makeRestore = new Function(...RSTUBS, `${restoreJs}\nreturn restoreCourse;`);

const noop = () => {};
const fakeDoc = { getElementById: () => null, querySelector: () => null };
const steps = [{ slot: 'day', spotId: 1 }, { slot: 'evening', spotId: 2 }];

// 저장한 항목을 JSON으로 거쳐(localStorage와 같게) 불러오고, 제목과 다시 추천 인자를 돌려준다
const restoreThenRegenerate = (item) => {
  const state = { mainMode: 'course', regions: [], subZones: [], slots: {}, course: null, courseConditions: null, courseCategory: 'ALL', moodPreset: null };
  makeRestore(state, noop, noop, noop, fakeDoc, noop, noop)(JSON.parse(JSON.stringify(item)), steps.map((s) => ({ ...s })));
  const title = courseTitle(state.courseConditions, state.course);
  const calls = { anchor: [], generate: [] };
  const buildAnchorCourse = (spot) => {
    calls.anchor.push(spot.id);
    return state.course;
  };
  const generateCourse = (...args) => {
    calls.generate.push(args);
    return state.course;
  };
  makeRegenerate(state, spotMap, buildAnchorCourse, noop, () => [], noop, generateCourse, [], () => new Set(), noop, noop, noop, () => [], noop, noop, '')();
  return { title, calls, state };
};

const saveWith = (courseConditions) => makeItem({ course: steps, courseConditions }, [1, 2], courseTitle);
const base = { regions: ['SEOUL'], subZones: [], mood: 'ALL' };

// 앵커 코스: 저장 → 열기 제목 `📍 … 중심 코스`, 다시 추천이 같은 앵커 주변에서 짠다
const anchored = saveWith({ ...base, anchorId: 1 });
assert.strictEqual(anchored.conditions.anchorId, 1, '저장 항목에 앵커가 없다');
assert.strictEqual(anchored.title, '📍 케이퍼스튜디오 중심 코스');
const a = restoreThenRegenerate(anchored);
assert.strictEqual(a.title, anchored.title, `불러온 앵커 코스 제목: ${a.title}`);
assert.deepStrictEqual(a.calls.anchor, [1], '다시 추천이 앵커 주변 코스를 짜지 않았다');
assert.strictEqual(a.calls.generate.length, 0, '다시 추천이 앵커를 잃고 지역 코스를 짰다');

// 검색어 코스: 열기 제목 `🔍 … 코스`, 다시 추천이 검색어를 잇는다
const searched = saveWith({ ...base, searchQuery: '성수 카페' });
assert.strictEqual(searched.title, '🔍 성수 카페 코스');
const q = restoreThenRegenerate(searched);
assert.strictEqual(q.title, searched.title, `불러온 검색어 코스 제목: ${q.title}`);
assert.strictEqual(q.calls.generate[0][4].searchQuery, '성수 카페', '다시 추천이 검색어를 잃었다');

// 검색어에서 동네를 얻은 코스: 다시 추천이 검색어 동네 완화(zoneFromQuery)를 잃지 않고, 조건 칸 세부 동네로 되살리지 않는다
const zq = saveWith({ ...base, subZones: ['seongsu'], searchQuery: '성수 카페', zoneFromQuery: true });
assert.strictEqual(zq.conditions.zoneFromQuery, true, '저장 항목에 zoneFromQuery가 없다');
const zr = restoreThenRegenerate(zq);
assert.strictEqual(zr.calls.generate[0][4].zoneFromQuery, true, '다시 추천이 검색어 동네 완화를 잃었다');
assert.deepStrictEqual(zr.state.subZones, [], '검색어 동네가 조건 칸 세부 동네로 되살아났다');

// 찜 코스: 열기 제목 `❤️ 찜한 코스 · 지역`
const fav = saveWith({ ...base, searchQuery: '', fromSaved: true });
assert.strictEqual(fav.title, '❤️ 찜한 코스 · 서울 성동구');
assert.strictEqual(restoreThenRegenerate(fav).title, fav.title, '불러온 찜 코스 제목이 바뀌었다');

// 일반 지역 코스는 저장에 새 필드가 실리지 않는다(빈 검색어와 꺼진 찜은 JSON에서 빠진다)
const plain = JSON.parse(JSON.stringify(saveWith({ ...base, searchQuery: '' })));
assert.ok(!('anchorId' in plain.conditions) && !('searchQuery' in plain.conditions) && !('fromSaved' in plain.conditions) && !('zoneFromQuery' in plain.conditions), '지역 코스 저장에 새 필드가 실렸다');

// 필드가 없는 옛 저장 항목: 오류 없이 지역 코스로 열고 다시 추천도 지역 기준
const old = { id: 'old', createdAt: '2026-10-01T00:00:00.000Z', conditions: { region: 'SEOUL', mood: 'ALL', slots: ['day', 'evening'] }, spotIds: [1, 2] };
const legacy = restoreThenRegenerate(old);
assert.strictEqual(legacy.title, '서울', `옛 저장 코스 제목: ${legacy.title}`);
assert.strictEqual(legacy.calls.anchor.length, 0);
assert.strictEqual(legacy.calls.generate.length, 1);
assert.strictEqual(legacy.calls.generate[0][4].searchQuery, undefined);

console.log('test-saved-course-anchor: 통과');
