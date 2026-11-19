// 탑바 테마 단추 아이콘만 시험(P-542): node scripts/test-theme-icon-only.cjs
// getThemeModeHtml이 글자 라벨 없이 아이콘 하나만 내고, 모드 이름은 aria-label과 title로 전하는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const body = (name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\): string \\{([\\s\\S]*?)\\n\\}'));
  assert.ok(m, `함수가 없다: ${name}`);
  return m[1];
};

const html = body('getThemeModeHtml');
assert.ok(!html.includes('topbar-label'), '테마 단추에 글자 라벨이 남아 있다');
for (const icon of ['☀️', '🌙', '🖥️']) assert.ok(html.includes(icon), `아이콘이 없다: ${icon}`);

const label = body('getThemeModeLabel');
for (const word of ["'낮'", "'밤'", "'시스템'"]) assert.ok(label.includes(word), `모드 이름이 없다: ${word}`);

const buttons = src.match(/<button class="btn-theme-toggle"[^>]*>/g) || [];
assert.strictEqual(buttons.length, 3, '테마 단추 템플릿이 3곳이 아니다');
for (const b of buttons) assert.match(b, /title="테마: \$\{getThemeModeLabel/, 'title이 없는 테마 단추가 있다');
assert.match(src, /themeBtn\.title = `테마: \$\{getThemeModeLabel\(mode\)\}`/, 'applyTheme가 title을 고치지 않는다');

console.log('test-theme-icon-only: 통과');
