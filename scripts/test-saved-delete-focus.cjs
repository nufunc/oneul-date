// 저장한 코스를 지운 뒤 목록 스크롤과 초점을 지키는지 시험(P-268): node scripts/test-saved-delete-focus.cjs
// src/main.ts의 저장한 코스 🗑 핸들러가 다시 그리기 전에 .overlay-body scrollTop과 순번을 기억하고,
// renderOverlay() 뒤(✕로 초점을 옮긴 뒤)에 스크롤을 되돌리고 같은 순번 🗑나 빈 상태 버튼에 초점을 주는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

// 1. 🗑 핸들러 본문만 떼어 낸다(다음 focusOverlayEntry() 호출 앞까지)
const start = src.indexOf("root.querySelectorAll<HTMLButtonElement>('.saved-item-delete').forEach");
assert.ok(start >= 0, '저장한 코스 🗑 핸들러를 찾지 못했다');
const end = src.indexOf('focusOverlayEntry();', start);
assert.ok(end > start, '핸들러 뒤 focusOverlayEntry() 호출을 찾지 못했다');
const handler = src.slice(start, end);

// 2. 두 번 누름 확인은 그대로
assert.match(handler, /btn\.dataset\.confirm !== '1'/, '두 번 누름 확인 분기가 없다');

// 3. 삭제 분기: 기억 → renderOverlay() → 되돌리기 → 초점 → 토스트 순서
const del = handler.slice(handler.indexOf('const next = loadSavedCourses()') - 400);
const at = (re, what) => {
  const m = del.match(re);
  assert.ok(m, `없다: ${what}`);
  return m.index;
};
const saveTop = at(/const (\w+) = root\.querySelector\('\.overlay-body'\)\?\.scrollTop/, '지우기 전 scrollTop 기억');
const saveIdx = at(/indexOf\(btn\)/, '지운 🗑 순번 기억');
const render = at(/renderOverlay\(\);/, 'renderOverlay() 호출');
const restore = at(/\.scrollTop = \w+;/, 'scrollTop 되돌리기');
const pick = at(/dels\[Math\.min\(\w+, dels\.length - 1\)\]/, '같은 순번(마지막이면 앞 항목) 🗑 고르기');
const empty = at(/#overlay-empty-make/, '빈 목록일 때 빈 상태 버튼으로 가기');
const focus = at(/\.focus\(\{ preventScroll: true \}\)/, 'preventScroll 초점');
const toast = at(/showToast\('삭제했어요'\)/, '삭제 토스트');
assert.ok(saveTop < render && saveIdx < render, '스크롤과 순번을 다시 그린 뒤에 기억한다');
assert.ok(render < restore && render < pick && render < empty && render < focus, '스크롤과 초점을 renderOverlay() 앞에서 준다(✕ 초점이 덮어쓴다)');
assert.ok(focus < toast, '토스트 뒤에 초점을 준다');

// 첫 누름(확인 상태)도 낭독기에 알린다(P-395): 확인 분기의 return 앞에서 announce
const confirmBranch = handler.slice(handler.indexOf("btn.dataset.confirm !== '1'"), handler.indexOf('return;'));
assert.ok(confirmBranch.includes("announce('한 번 더 누르면 삭제돼요');"), '첫 누름의 확인 상태를 알리지 않는다');

console.log('test-saved-delete-focus: 통과');
