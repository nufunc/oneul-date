// 코스 카드 하트 제거 회귀 테스트: node scripts/test-save-chip-delegation.cjs
// 막는 결함: 코스 카드 🤍는 눌러도 토스트뿐이고 담은 곳이 화면에 없어 P-299에서 뺐다. 되살아나면 실패한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const start = main.indexOf('function renderStepCard(');
assert.ok(start >= 0, 'renderStepCard를 찾지 못했다');
const end = main.indexOf('\n}\n', start);
assert.ok(end > start, 'renderStepCard의 끝을 찾지 못했다');
const card = main.slice(start, end);

assert.ok(!card.includes('step-save-chip'), '코스 카드에 .step-save-chip이 남아 있다');
assert.ok(!main.includes('step-save-chip'), 'main.ts에 .step-save-chip 위임이 남아 있다');
assert.ok(!css.includes('step-save-chip'), 'style.css에 .step-save-chip 규칙이 남아 있다');

// 찜은 스팟 탐색 카드와 장소 상세에 남는다
assert.ok(main.includes('btn-discovery-save'), '스팟 탐색 카드의 찜이 없다');
assert.ok(main.includes('btn-detail-toggle-save'), '장소 상세의 찜이 없다');

// 상세 시트 찜 단추도 누를 때 title을 상태에 맞춘다(P-398)
assert.ok(main.includes("saveBtn.title = nowSaved ? '보관함에서 제외' : '보관함에 담기';"), '상세 시트 찜 단추 title이 상태를 따라가지 않음');

console.log('ok 5');
