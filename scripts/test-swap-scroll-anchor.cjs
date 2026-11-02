// 장소 바꾸기 뒤 🔄 위치 유지 시험(P-262): node scripts/test-swap-scroll-anchor.cjs
// src/main.ts의 swapStep이 바꾸기 전 카드 아래끝과 스크롤 위치를 재고, 함수 끝에서 그 차이만큼 절대 위치로 스크롤을 맞추는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

// swapStep 본문: 선언부터 다음 최상위 function 선언 앞까지
const start = src.indexOf('function swapStep(');
assert.ok(start >= 0, 'swapStep이 없다');
const next = src.indexOf('\nfunction ', start + 1);
const nextDoc = src.lastIndexOf('\n/**', next);
const body = src.slice(start, nextDoc > start ? nextDoc : next);

const at = (needle, label) => {
  const i = body.indexOf(needle);
  assert.ok(i >= 0, `swapStep에 없다(${label}): ${needle}`);
  return i;
};

const scrollBefore = at('const scrollBefore = window.scrollY;', '바꾸기 전 스크롤 위치');
const oldBottom = at('const oldBottom = targetCard.offsetTop + targetCard.offsetHeight;', '바꾸기 전 카드 아래끝');
const replace = at('targetCard.replaceWith(newCard);', '카드 교체');
const dividers = at('refreshTransitDividers();', '이동 띠 갱신');
const shift = at('const bottomShift = newCard.offsetTop + newCard.offsetHeight - oldBottom;', '새 카드 아래끝 차이');
const focus = at('newSwapBtn.focus()', '새 🔄 초점 이동');
const scrollTo = at("window.scrollTo({ top: scrollTarget, behavior: 'instant' })", '절대 위치 스크롤 보정');

assert.ok(scrollBefore < replace && oldBottom < replace, '바꾸기 전 값을 교체 뒤에 잰다');
// 이동 띠 높이가 바뀌어도 카드 아래끝이 맞도록 띠를 다시 그린 뒤에 잰다
assert.ok(dividers < shift, '이동 띠를 다시 그리기 전에 새 카드 아래끝을 잰다');
// 초점 이동이 스크롤을 옮긴 뒤에 맞춘다
assert.ok(scrollTo > focus, '스크롤 보정이 초점 이동보다 앞에 있다');
// 결과 화면 총평 카드와 AI 총평 요청은 지웠다(P-274). 바꾸기 뒤 늦게 오는 문장이 높이를 바꾸지 않는다
assert.ok(!/ai-briefing|fetchAiBriefing|aiStoryCache/.test(body), 'swapStep이 지운 총평 카드나 AI 총평 요청을 다시 부른다');

// 등장 애니메이션(transform)이 섞이는 측정과 상대 이동은 쓰지 않는다
assert.ok(!/getBoundingClientRect/.test(body), 'swapStep이 getBoundingClientRect로 잰다: 등장 애니메이션 transform이 섞인다');
assert.ok(!/window\.scrollBy\(/.test(body), 'swapStep이 scrollBy를 쓴다: 페이지 맨 아래에서 브라우저가 먼저 당긴 만큼 더 움직인다');

// 등장 애니메이션은 그대로 남는다
assert.ok(/newCard\.classList\.add\('swap-in'\)/.test(body), '새 카드 등장 애니메이션이 사라졌다');

console.log('test-swap-scroll-anchor: 통과');
