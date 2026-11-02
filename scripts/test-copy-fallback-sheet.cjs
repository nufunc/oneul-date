// 클립보드 복사가 거부되면 주소 시트를 여는지 시험(P-269): node scripts/test-copy-fallback-sheet.cjs
// src/main.ts의 복사 네 자리(공유 링크, 코스 결과 📋, 받은 코스 📋, 저장한 코스 📋)가 copyOrShowText 하나를 거치고,
// 거부되면 토스트 대신 글을 전체 선택한 readonly textarea 시트를 열며, Escape를 아래 패널에 넘기지 않는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

const fnBody = (name) => {
  const m = src.match(new RegExp(`\\nfunction ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}\\n`)) ||
    src.match(new RegExp(`\\nasync function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}\\n`));
  assert.ok(m, `${name}가 없다`);
  return m[1];
};

// 1. 공용 함수: 성공하면 토스트, 실패하면 시트
const copy = fnBody('copyOrShowText');
assert.match(copy, /await navigator\.clipboard\.writeText\(text\);\s*showToast\(okMsg\);/, '성공하면 받은 문구로 토스트를 띄운다');
assert.match(copy, /catch \{\s*openCopySheet\(text, trigger\);\s*\}/, '거부되면 시트를 연다');
assert.match(copy, /const trigger = document\.activeElement/, '누른 버튼을 기억한다');

// 2. 클립보드에 쓰는 곳은 공용 함수와 장소 주소 복사(이번 범위 밖) 둘뿐이다
const writes = src.match(/navigator\.clipboard\.writeText\(/g) || [];
assert.strictEqual(writes.length, 2, `navigator.clipboard.writeText 호출이 ${writes.length}곳이다`);
assert.match(src, /navigator\.clipboard\.writeText\(addr\)/, '장소 주소 복사는 그대로 둔다');
assert.doesNotMatch(src, /execCommand\(/, 'execCommand는 쓰지 않는다(폐기 예정 API)');

// 3. 네 자리가 공용 함수를 쓴다
const after = (anchor, len = 1200) => {
  const i = src.indexOf(anchor);
  assert.ok(i >= 0, `찾지 못했다: ${anchor}`);
  return src.slice(i, i + len);
};
assert.match(fnBody('shareOrCopyLink'), /await copyOrShowText\(url, /, '공유 링크 폴백');
assert.match(after("area.querySelector('#btn-copy')"), /await copyOrShowText\(text, '📋 코스가 복사되었어요'\)/, '코스 결과 📋');
assert.match(after("getElementById('btn-receiver-copy')"), /await copyOrShowText\(text, '📋 코스가 복사되었어요'\)/, '받은 코스 📋');
assert.match(after("querySelectorAll<HTMLButtonElement>('.saved-item-copy')", 1600), /await copyOrShowText\(text, dropped > 0/, '저장한 코스 📋');

// 4. 시트: 대화상자, 읽기 전용 입력칸, 닫기, 전체 선택과 초점, 초점 복귀, Escape 가두기, 스크롤 잠금 재사용
const sheet = fnBody('openCopySheet');
assert.match(sheet, /role="dialog" aria-modal="true" aria-labelledby="copy-sheet-title" aria-describedby="copy-sheet-desc"/);
assert.match(sheet, /길게 눌러 복사하세요/);
assert.match(sheet, /<textarea class="copy-sheet-text" readonly/);
assert.match(sheet, /<button type="button" class="btn-secondary copy-sheet-close">닫기<\/button>/);
assert.match(sheet, /ta\.focus\(\);\s*ta\.setSelectionRange\(0, text\.length\);/, '열 때 입력칸에 초점을 두고 전체 선택한다');
assert.match(sheet, /trigger\?\.isConnected\) trigger\.focus\(/, '닫으면 누른 버튼으로 초점을 돌린다');
const esc = sheet.match(/if \(e\.key === 'Escape'\) \{([\s\S]*?)\}/);
assert.ok(esc, 'Escape 처리가 없다');
assert.match(esc[1], /e\.stopPropagation\(\);[\s\S]*close\(\);/, 'Escape를 아래 저장한 코스 패널에 넘기지 않는다');
assert.match(sheet, /'Tab'[\s\S]*?e\.stopPropagation\(\);/, 'Tab을 window의 시트 Tab 가두기에 넘기지 않는다');
assert.match(sheet, /const lockedHere = !html\.classList\.contains\('overlay-locked'\)/, '이미 잠겨 있으면 닫을 때 풀지 않는다');
assert.match(sheet, /if \(lockedHere\) \{\s*html\.classList\.remove\('overlay-locked'\)/);

// 5. CSS: 저장한 코스 패널과 스팟 상세(1000) 위, 토스트(1100) 아래. 글자는 테마 토큰. 입력칸 16px
const rule = (sel) => {
  const m = css.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm'));
  assert.ok(m, `${sel} 규칙이 없다`);
  return m[1];
};
const z = Number(rule('.copy-sheet-panel').match(/z-index:\s*(\d+)/)[1]);
assert.ok(z > 1000 && z < 1100, `시트 z-index ${z}`);
assert.match(rule('.copy-sheet-desc'), /color:\s*var\(--color-text-sub\)/);
const ta = rule('.copy-sheet-text');
assert.match(ta, /color:\s*var\(--color-text\)/);
assert.match(ta, /font-size:\s*16px/, 'iOS 확대를 막는 16px');
assert.match(rule('.copy-sheet-close'), /width:\s*100%/);

console.log('test-copy-fallback-sheet: 통과');
