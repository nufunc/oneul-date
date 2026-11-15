// 저장한 코스 장소 칩 줄바꿈 회귀 테스트(P-463): node scripts/test-saved-chip-wrap.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].split(',').map((x) => x.trim()).includes(sel)).map((m) => m[2]).join(';');
const name = body('.saved-step-name');
assert(name, '.saved-step-name 규칙이 없다');
// 큰 글자에서 긴 장소 이름이 칩 밖으로 넘치지 않게 줄을 꺾는다
assert(!/white-space:\s*nowrap/.test(name), '.saved-step-name이 줄바꿈을 막는다');
assert(/overflow-wrap:\s*anywhere/.test(name), '.saved-step-name이 긴 낱말을 나누지 않는다');
const chip = body('.saved-step-chip');
assert(/max-width:\s*100%/.test(chip) && /min-width:\s*0/.test(chip), '.saved-step-chip이 항목 폭을 넘을 수 있다');
console.log('ok saved chip wrap');
