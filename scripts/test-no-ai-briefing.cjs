// 코스 결과 AI 브리핑 제거 시험(P-274): node scripts/test-no-ai-briefing.cjs
// 결과 화면과 받은 코스 화면(P-275)에 'AI 에디터 브리핑' 카드가 없고, AI 총평 요청 주소가 소스와 빌드 번들에 남지 않았는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src', 'main.ts');
const src = fs.readFileSync(mainPath, 'utf8');
const AI_URL = /sslip\.io|\/ai-briefing\b/;

const body = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}이 없다`);
  return src.slice(start, src.indexOf('\n}\n', start));
};

assert.ok(!/AI 에디터 브리핑|ai-briefing/.test(body('renderResultsContent')), '코스 결과 화면에 AI 브리핑 카드가 남았다');
assert.ok(!/AI 에디터 브리핑|ai-briefing/.test(body('renderReceiverView')), '받은 코스 화면에 AI 브리핑 카드가 남았다');

for (const f of fs.readdirSync(path.join(root, 'src'))) {
  if (!/\.(ts|js)$/.test(f)) continue;
  assert.ok(!AI_URL.test(fs.readFileSync(path.join(root, 'src', f), 'utf8')), `src/${f}에 AI 총평 요청 주소가 남았다`);
}

// 빌드 번들: dist가 src/main.ts보다 새로울 때만 본다(오래된 dist로 거짓 실패를 내지 않는다)
let bundleNote = '번들 없음, 건너뜀';
const html = path.join(root, 'dist', 'index.html');
if (fs.existsSync(html)) {
  const m = fs.readFileSync(html, 'utf8').match(/src="[^"]*\/(assets\/index-[^"]+\.js)"/);
  const js = m && path.join(root, 'dist', m[1]);
  if (js && fs.existsSync(js) && fs.statSync(js).mtimeMs >= fs.statSync(mainPath).mtimeMs) {
    assert.ok(!AI_URL.test(fs.readFileSync(js, 'utf8')), `번들 ${m[1]}에 AI 총평 요청 주소가 남았다`);
    bundleNote = `번들 ${m[1]} 확인`;
  } else {
    bundleNote = '번들이 src/main.ts보다 오래돼 건너뜀';
  }
}

console.log(`test-no-ai-briefing: 통과(${bundleNote})`);
