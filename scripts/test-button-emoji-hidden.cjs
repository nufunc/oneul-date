// 단추 안 장식 이모지 숨김 시험(P-390): node scripts/test-button-emoji-hidden.cjs
// 이름이 단추 글자에서 정해지는 메인 탭, 테마 칩, 지역 단추, 시간대 단추에서
// 이모지가 스크린리더에 그림 이름으로 읽혀 단추 이름 앞에 붙지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
// P-391: 제목 글자가 옆에 있는 정보 줄과 안내의 장식 아이콘도 숨긴다. 시간대를 뜻하는 saved-step-emoji는 읽게 둔다
for (const cls of ['main-tab-emoji', 'chip-emoji', 'pill-icon', 'slot-emoji', 'meta-item-icon', 'feature-icon', 'empty-icon', 'overlay-tip-icon', 'search-input-icon', 'badge-search-match-icon']) {
  const spans = src.match(new RegExp(`<span class="${cls}"[^>]*>`, 'g')) || [];
  assert.ok(spans.length > 0, `${cls} 자리가 없다`);
  for (const s of spans) assert.ok(s.includes('aria-hidden="true"'), `${cls} 이모지가 읽힌다: ${s}`);
}

console.log('test-button-emoji-hidden: 통과');
