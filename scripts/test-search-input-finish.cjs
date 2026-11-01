// 검색칸 마감 셋 시험(P-265): node scripts/test-search-input-finish.cjs
// src/main.ts의 홈과 탐색 탭 검색칸에서 검색어가 비면 지우기 버튼이 Tab 순서와 보조 기술에서 빠지는지,
// 홈 입력 처리가 is-visible과 함께 tabIndex와 aria-hidden을 켜고 끄는지, 입력에 enterkeyhint="search"가 있는지,
// getDynamicSearchPlaceholder를 TypeScript로 변환해 실행했을 때 여러 번 불러도 같은 문구인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

function fnBody(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `함수가 없다: ${name}`);
  const next = main.indexOf('\nfunction ', start + 1);
  return main.slice(start, next < 0 ? undefined : next);
}

// 1. 두 검색칸: enterkeyhint, 지우기 버튼 type과 빈 검색어일 때 Tab 제외
for (const [inputId, clearId, query] of [
  ['search-input', 'search-clear', 'state.searchQuery'],
  ['discovery-search-input', 'btn-clear-discovery-search', 'state.spotSearchQuery'],
]) {
  const at = main.indexOf(`id="${inputId}"`);
  assert.ok(at >= 0, `입력이 없다: #${inputId}`);
  const input = main.slice(main.lastIndexOf('<input', at), main.indexOf('/>', at));
  assert.match(input, /enterkeyhint="search"/, `#${inputId}에 enterkeyhint="search"가 없다`);
  const btnStart = main.indexOf('<button', at);
  const btn = main.slice(btnStart, main.indexOf('</button>', btnStart));
  assert.ok(btn.includes(`id="${clearId}"`), `#${inputId} 다음 버튼이 #${clearId}가 아니다`);
  assert.match(btn, /^<button type="button"/, `#${clearId}에 type="button"이 없다`);
  const esc = query.replace(/\./g, '\\.');
  assert.match(btn, new RegExp(`\\$\\{${esc} \\? '' : ' tabindex="-1" aria-hidden="true"'\\}`),
    `#${clearId}가 검색어가 빌 때 Tab 순서와 보조 기술에서 빠지지 않는다`);
}

// 2. 홈 입력 처리: is-visible과 tabIndex, aria-hidden을 함께 바꾼다
const bind = fnBody('bindConditionEvents');
const onInput = bind.slice(bind.indexOf("searchInput.addEventListener('input'"), bind.indexOf("searchInput.addEventListener('keydown'"));
assert.match(onInput, /clearBtn\.classList\.toggle\('is-visible', visible\)/, '입력 처리가 is-visible을 바꾸지 않는다');
assert.match(onInput, /clearBtn\.tabIndex = visible \? 0 : -1/, '입력 처리가 tabIndex를 함께 바꾸지 않는다');
assert.match(onInput, /if \(visible\) clearBtn\.removeAttribute\('aria-hidden'\);\s*else clearBtn\.setAttribute\('aria-hidden', 'true'\)/,
  '입력 처리가 aria-hidden을 함께 바꾸지 않는다');

// 3. 안내 문구: 여러 번 불러도 처음 고른 문구
const decl = main.match(/^let searchPlaceholder: string \| null = null;$/m);
assert.ok(decl, '안내 문구를 담는 모듈 변수가 없다');
const code = `${decl[0]}\n${fnBody('getDynamicSearchPlaceholder')}`;
// 최상위 let이 있으면 변환 결과 끝에 export {};가 붙어 new Function에서 문법 오류가 난다
const js = ts.transpile(code, { target: 'es2022' }).replace(/^export \{\};$/m, '');
const pick = new Function(`${js};return getDynamicSearchPlaceholder;`)();
const first = pick();
assert.ok(typeof first === 'string' && first.length > 0, '안내 문구가 비었다');
for (let i = 0; i < 50; i++) assert.strictEqual(pick(), first, '다시 부르면 안내 문구가 바뀐다');

console.log('test-search-input-finish: ok');
