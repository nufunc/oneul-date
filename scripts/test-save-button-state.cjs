// 저장 버튼 상태 시험(P-342): node scripts/test-save-button-state.cjs
// src/main.ts에서 저장 버튼 함수만 떼어 가짜 localStorage와 가짜 버튼으로 실행한다:
// 저장하면 `✅ 저장됨`과 aria-label, 코스가 바뀌면 `💾 저장`, 저장됨 상태에서 누르면 목록 열기 함수 호출
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fn = (name) => {
  const s = src.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(s >= 0, `${name}이 없다`);
  const e = src.indexOf('\n}\n', s);
  return src.slice(s, e + 3);
};
const names = ['loadSavedCourses', 'persistSavedCourses', 'keyOf', 'addSavedCourse', 'isCourseSaved', 'paintSaveButton', 'syncSaveButtons', 'openSavedIfSaved', 'saveCourseWithToast'];
const code = ts.transpileModule(names.map(fn).join('\n'), { compilerOptions: { target: 'ES2020' } }).outputText;

const makeBtn = (id) => {
  const attrs = {};
  return { id, dataset: {}, textContent: '💾 저장', setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, attrs };
};
const setup = () => {
  const store = {};
  const home = makeBtn('btn-save');
  const recv = makeBtn('btn-receiver-save');
  const ctx = {
    STORAGE_KEY: 'k',
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document: { querySelectorAll: () => [home, recv] },
    state: { course: [{ spotId: 1 }, { spotId: 2 }, { spotId: null }] },
    courseSpotIds: () => ctx.state.course.filter((s) => s.spotId !== null).map((s) => s.spotId),
    toasts: [], opened: 0,
    showToast: (m) => ctx.toasts.push(m),
    openSavedPanel: () => { ctx.opened++; },
  };
  const run = new Function(...Object.keys(ctx), `${code}\nreturn { ${names.join(', ')} };`);
  return { home, recv, ctx, api: run(...Object.values(ctx)), store };
};

const item = (ids) => ({ id: 'x', createdAt: '', conditions: {}, spotIds: ids, title: 't' });

// 1. 저장 전 `💾 저장`, 저장 뒤 `✅ 저장됨`과 aria-label
{
  const { home, api, ctx } = setup();
  api.paintSaveButton(home, [1, 2]);
  assert.strictEqual(home.textContent, '💾 저장');
  assert.strictEqual(home.attrs['aria-label'], undefined);
  api.saveCourseWithToast(item([2, 1]));
  assert.strictEqual(home.textContent, '✅ 저장됨', '저장 뒤 버튼 글이 바뀌지 않는다');
  assert.strictEqual(home.attrs['aria-label'], '저장됨, 저장한 코스 열기');
  assert.strictEqual(ctx.toasts[0], '💾 코스를 저장했어요', '기존 토스트가 바뀌었다');
}

// 2. 코스 장소가 바뀌면 `💾 저장`으로 돌아가고, 같은 조합으로 돌아오면 `✅ 저장됨`이다
{
  const { home, api, ctx } = setup();
  api.paintSaveButton(home, [1, 2]);
  api.saveCourseWithToast(item([1, 2]));
  ctx.state.course = [{ spotId: 1 }, { spotId: 3 }];
  api.syncSaveButtons();
  assert.strictEqual(home.textContent, '💾 저장');
  assert.strictEqual(home.attrs['aria-label'], undefined);
  assert.strictEqual(home.dataset.saved, undefined);
  ctx.state.course = [{ spotId: 2 }, { spotId: 1 }];
  api.syncSaveButtons();
  assert.strictEqual(home.textContent, '✅ 저장됨');
}

// 3. 저장됨을 누르면 목록 열기 함수를 부르고, 저장 전에는 부르지 않는다
{
  const { home, api, ctx } = setup();
  api.paintSaveButton(home, [1, 2]);
  assert.strictEqual(api.openSavedIfSaved(home), false);
  assert.strictEqual(ctx.opened, 0);
  api.saveCourseWithToast(item([1, 2]));
  assert.strictEqual(api.openSavedIfSaved(home), true);
  assert.strictEqual(ctx.opened, 1);
}

// 4. 받은 코스 버튼도 저장 뒤 `✅ 저장됨`이 되고, 저장 목록에서 지우면 `💾 저장`으로 돌아간다
{
  const { recv, api, store } = setup();
  api.paintSaveButton(recv, [5, 6]);
  api.saveCourseWithToast(item([5, 6]));
  assert.strictEqual(recv.textContent, '✅ 저장됨');
  store.k = '[]';
  api.syncSaveButtons();
  assert.strictEqual(recv.textContent, '💾 저장');
}

// 5. 쓰기가 막혀 실패하면 `💾 저장` 그대로(P-306)
{
  const { home, api, ctx } = setup();
  ctx.localStorage.setItem = () => { throw new Error('quota'); };
  api.paintSaveButton(home, [1, 2]);
  api.saveCourseWithToast(item([1, 2]));
  assert.strictEqual(home.textContent, '💾 저장');
}

// 6. 코스가 바뀌는 두 경로(renderResults, swapStep)가 지나는 saveLastCourse가 버튼을 맞춘다
{
  const s = src.search(/^function saveLastCourse\(/m);
  const body = src.slice(s, src.indexOf('\n}\n', s));
  assert.ok(body.includes('syncSaveButtons()'), 'saveLastCourse가 저장 버튼을 맞추지 않는다');
}

console.log('test-save-button-state: 통과');
