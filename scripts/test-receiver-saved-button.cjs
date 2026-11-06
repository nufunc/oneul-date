// 받은 코스 화면에서 저장한 코스를 열 수 있는지 시험(P-298): node scripts/test-receiver-saved-button.cjs
// src/main.ts를 읽어 본다: 받은 코스 머리에 `저장한 코스` 버튼이 있고 홈과 같은 열기 함수를 쓰며,
// 저장 버튼과 토스트 글이 보내는 쪽과 같고, 시트에서 코스를 불러오면 받은 코스 화면에서 홈 셸로 나가는지
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const body = (startRe, endRe) => {
  const s = src.search(startRe);
  assert.ok(s >= 0, `없다: ${startRe}`);
  const rest = src.slice(s);
  const e = rest.slice(1).search(endRe);
  assert.ok(e >= 0, `끝을 찾지 못했다: ${endRe}`);
  return rest.slice(0, e + 1);
};

const receiver = body(/^function renderReceiverView\(/m, /^\/\/ --- 저장한 코스 오버레이/m);

// 1. 머리 topbar-actions에 저장한 코스 버튼이 ⚙️(테마 버튼) 앞에 있다
const actions = receiver.match(/<div class="topbar-actions">([\s\S]*?)<\/div>/);
assert.ok(actions, '받은 코스 머리의 topbar-actions를 찾지 못했다');
const saved = actions[1].indexOf('id="btn-open-saved"');
const theme = actions[1].indexOf('id="btn-theme-toggle"');
assert.ok(saved >= 0, '받은 코스 머리에 저장한 코스 버튼(#btn-open-saved)이 없다');
assert.ok(saved < theme, '저장한 코스 버튼이 ⚙️ 앞에 있지 않다');
assert.match(actions[1], /id="btn-open-saved">저장한 코스<\/button>/, '버튼 글이 홈과 같은 `저장한 코스`가 아니다');

// 2. 홈과 받은 코스가 같은 열기 함수를 쓴다
const reHandler = /getElementById\('btn-open-saved'\)!?\??\.addEventListener\('click', openSavedPanel\)/g;
assert.strictEqual((src.match(reHandler) || []).length, 2, '홈과 받은 코스의 #btn-open-saved가 둘 다 openSavedPanel을 쓰지 않는다');
const open = body(/^function openSavedPanel\(\)/m, /^\}/m);
assert.match(open, /state\.savedOpen = true;[\s\S]*renderOverlay\(\);/, 'openSavedPanel이 시트를 열지 않는다');

// 3. 저장 글: 버튼과 토스트가 보내는 쪽과 같다
assert.match(receiver, /id="btn-receiver-save" type="button">💾 저장<\/button>/, '받은 코스 저장 버튼 글이 `💾 저장`이 아니다');
assert.ok(!receiver.includes('보관함'), '받은 코스 화면에 `보관함` 글이 남았다');
const callers = src.match(/^\s*saveCourseWithToast\(item\);/gm) || [];
assert.strictEqual(callers.length, 2, '저장 토스트를 띄우는 곳이 보내는 쪽과 받는 쪽 둘이어야 한다');
const helper = body(/^function saveCourseWithToast\(/m, /^\}/m);
assert.ok(helper.includes("'💾 코스를 저장했어요'"), '저장 성공 토스트가 `💾 코스를 저장했어요`가 아니다');

// 3-1. 쓰기가 실패하면 성공 문구를 띄우지 않는다(P-306)
const add = body(/^function addSavedCourse\(/m, /^\}/m);
assert.match(add, /if \(!persistSavedCourses\(list\)\) return 'failed';/, 'addSavedCourse가 쓰기 실패를 failed로 돌려주지 않는다');
const persist = body(/^function persistSavedCourses\(/m, /^\}/m);
assert.ok(!/showToast\(/.test(persist), 'persistSavedCourses가 직접 토스트를 띄우면 호출부의 성공 토스트가 덮는다');
assert.match(helper, /result === 'failed'\s*\?\s*'코스를 저장하지 못했어요[^']*'\s*:\s*result === 'new'\s*\?\s*'💾 코스를 저장했어요'/, '실패 문구가 성공 문구보다 먼저 가려지지 않는다');
assert.ok(!helper.includes('보관함'), '실패 문구에 `보관함`이 남았다');
assert.ok(!/addSavedCourse\(item\) \?/.test(src), '호출부가 결과를 참거짓으로 읽어 실패를 성공 토스트로 덮는다');
assert.match(src, /if \(!persistSavedCourses\(next\)\) \{\s*showToast\('삭제하지 못했어요[^']*'\);\s*return;/, '삭제 쓰기 실패가 삭제했어요 토스트에 덮인다');

// 4. 저장한 코스를 불러오면 받은 코스 화면에서 나간다
const then = body(/^function closeOverlayThen\(/m, /^\}/m);
assert.match(then, /hasAttribute\('data-shared-course'\)/, '받은 코스 화면인지 data-shared-course로 가르지 않는다');
assert.match(then, /overlayHistoryPushed = false/, 'history 항목을 되돌리면 back()이 #c= 항목으로 돌아가 받은 화면이 다시 그려진다');
const iFlag = then.indexOf('overlayHistoryPushed = false');
const iClose = then.indexOf('closeOverlay(');
const iClear = then.indexOf('clearCourseHash()');
const iShell = then.indexOf('renderShell()');
const iCb = then.indexOf('callback()');
assert.ok(iFlag < iClose, 'history 표시를 시트를 닫기 전에 내려야 한다(닫는 중 renderOverlay가 back()을 부른다)');
assert.ok(iClose < iClear && iClear < iShell && iShell < iCb, '순서가 해시 지움 → 홈 셸 → 불러오기가 아니다');

const load = body(/root\.querySelectorAll<HTMLButtonElement>\('\.saved-item-main'\)/, /root\.querySelectorAll<HTMLButtonElement>\('\.saved-item-copy'\)/);
assert.match(load, /closeOverlayThen\(\(\) => \{\s*restoreCourse\(item, steps\);/, '불러오기가 closeOverlayThen 안에서 restoreCourse를 부르지 않는다');
assert.ok(!/\bcloseOverlay\(/.test(load), '불러오기가 홈으로 나가지 않는 closeOverlay를 직접 부른다');
const make = body(/#overlay-empty-make'\)\?\.addEventListener/, /root\.querySelectorAll<HTMLButtonElement>\('\.saved-item-main'\)/);
assert.match(make, /closeOverlayThen\(/, '빈 시트의 코스 만들러 가기가 홈으로 나가지 않는다');

console.log('test-receiver-saved-button: 통과');
