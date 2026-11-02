// 맞춤 코스 탭 오늘의 코스 버튼 제거 시험(P-277): node scripts/test-course-no-daily-button.cjs
// 조건 카드에 🎁 오늘의 코스 버튼과 그 스타일이 없고, 첫 화면 자동 오늘 추천 코스는 남았는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

const body = (name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name}가 없다`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

assert.ok(!/btn-daily-recommend|btnDailyRecommend/.test(src), 'main.ts에 오늘의 코스 버튼 참조가 남았다');
assert.ok(!/btn-daily-recommend/.test(css), 'style.css에 .btn-daily-recommend 규칙이 남았다');
assert.ok(body('renderConditions').includes('id="btn-generate"'), '조건 카드에서 완성 버튼이 빠졌다');
assert.ok(body('renderConditions').includes('id="btn-saved-recommend"'), '조건 카드에서 찜한 코스 버튼이 빠졌다');
// 찜한 코스 버튼이 전체 스팟을 받은 뒤 새로 생기면 결과 영역을 민다. 받는 동안은 저장된 찜 수로 자리를 잡고 누르지 못하게 둔다
const rc = body('renderConditions');
assert.ok(/const savedPending = !loadedRegionKeys\.has\('ALL'\);/.test(rc), '받는 동안 찜한 코스 버튼 자리를 잡지 않는다');
assert.ok(/savedPending \? state\.savedSpotIds\.size : visibleSavedSpotCount\(\)/.test(rc), '받는 동안 저장된 찜 수를 쓰지 않는다');
assert.ok(/\$\{savedPending \? ' disabled aria-busy="true"' : ''\}/.test(rc), '받는 동안 찜한 코스 버튼을 누를 수 있다');
assert.ok(/function buildDailyRecommendedCourse\(/.test(src), 'buildDailyRecommendedCourse가 빠졌다');
assert.ok(/const daily = buildDailyRecommendedCourse\(spots\);/.test(src), '첫 화면 자동 오늘 추천 코스 호출이 빠졌다');

// 좁은 화면에서 혼자 남는 찜한 코스 버튼은 전체 폭으로 둔다
const narrow = css.slice(css.indexOf('@media (max-width: 480px)'));
const rule = narrow.match(/\.course-generate-btn-group \.btn-saved-recommend\s*\{([^}]*)\}/);
assert.ok(rule, '좁은 화면 찜한 코스 버튼 규칙이 없다');
assert.ok(/width:\s*100%/.test(rule[1]), '좁은 화면 찜한 코스 버튼이 전체 폭이 아니다');

console.log('test-course-no-daily-button: 통과');
