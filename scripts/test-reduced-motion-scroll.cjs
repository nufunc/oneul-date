// 움직임 줄이기 스크롤 시험(P-406): node scripts/test-reduced-motion-scroll.cjs
// prefers-reduced-motion: reduce인 사용자에게 부드러운 스크롤을 쓰지 않도록
// 스크롤 호출이 모두 scrollMotion()을 거치는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
assert.ok(src.includes("matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'"), '움직임 줄이기 설정을 보지 않는다');
assert.ok(!src.includes("behavior: 'smooth'"), '부드러운 스크롤을 바로 지정한 곳이 있다');
assert.ok((src.match(/behavior: scrollMotion\(\)/g) || []).length >= 6, '스크롤 호출이 scrollMotion()을 거치지 않는다');

console.log('test-reduced-motion-scroll: 통과');
