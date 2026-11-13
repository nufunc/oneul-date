// 저장한 코스 목록 구조 시험(P-396): node scripts/test-saved-list-structure.cjs
// 저장 목록이 ul[role=list]와 li로 그려져 스크린리더가 목록과 항목 수를 알리는지,
// 열기 단추 안에 div가 없어 button의 구문 콘텐츠 규칙을 지키는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');

assert.ok(src.includes('<ul class="saved-list" role="list">'), '저장 목록이 ul[role=list]가 아니다');
assert.ok(src.includes('<li class="saved-item">'), '저장 항목이 li가 아니다');
assert.ok(!src.includes('<div class="saved-item">'), '저장 항목이 아직 div다');

const main = src.slice(src.indexOf('<button class="saved-item-main"'), src.indexOf('<div class="saved-item-actions">'));
assert.ok(main.length > 0 && !/<div\b/.test(main), '열기 단추 안에 div가 있다');
const flow = src.slice(src.indexOf('function savedCourseSpotsHtml('), src.indexOf('/** 시트가 열린 채 전체 데이터가 도착하면'));
assert.ok(flow.length > 0 && !/<div\b/.test(flow), '장소 흐름이 div를 그린다(열기 단추 안에 들어간다)');

assert.match(css, /\.saved-list \{[^}]*list-style: none;/, '목록 기호가 보인다');
assert.match(css, /\.saved-item-spots \{[^}]*display: block;/, '장소 칸이 span이 되며 줄바꿈을 잃었다');

console.log('test-saved-list-structure: 통과');
