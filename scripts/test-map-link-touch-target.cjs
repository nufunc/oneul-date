// 코스 카드 지도 링크 셋 눌리는 영역 시험(P-450): node scripts/test-map-link-touch-target.cjs
// .step-actions-right의 간격 절반 + 테두리 1px만큼 ::after를 넓혀 칩 32px(360px 이하 28px)의 눌리는 폭을 44px로 둔다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

// 기본: 칩 32px + 2×7 = 46px 안쪽 기준에서 테두리를 빼면 44px, 간격 12px의 절반 6px + 1px = 7px라 이웃과 겹치지 않는다
const base = css.match(/^\.step-actions-right \{([^}]*)\}/m);
assert.ok(base, '.step-actions-right 규칙이 없다');
assert.match(base[1], /gap:\s*12px;/, '기본 간격이 12px가 아니다');
const after = css.match(/^\.step-actions-right > button::after \{([^}]*)\}/m);
assert.ok(after, '.step-actions-right ::after 규칙이 없다');
assert.match(after[1], /inset:\s*-7px -7px;/, '기본 ::after가 -7px -7px가 아니다');

// 360px 이하: 칩 28px + 2×(16/2+1) = 46px, 간격 16px
const m360 = css.match(/@media \(max-width: 360px\) \{[\s\S]*?\.step-card \.step-actions-right \{ gap: 16px; --icon-gap: 16px; \}[\s\S]*?\.step-card \.step-actions-right > button::after \{ inset: -9px -9px; \}/);
assert.ok(m360, '360px 이하 간격 16px와 ::after -9px -9px가 없다');

// 왼쪽 아이콘 넷인 막대는 접힘 방지(P-110)로 간격 4px를 유지한다
assert.match(css, /:has\(\.step-actions-icons > :nth-child\(4\)\) \.step-actions-right \{ gap: 4px; --icon-gap: 4px; \}/, '아이콘 넷 막대의 4px 간격이 바뀌었다');
console.log('ok map link touch target');
