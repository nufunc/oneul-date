// 상세 시트 히어로 사진 축소 주소 시험(P-318): node scripts/test-spot-detail-hero-thumb.cjs
// toHeroImgUrl이 카카오 mystore만 800px 축소 주소로 바꾸고, 히어로 img가 data-orig 원본 복귀를 갖는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const fn = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}이 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};
const toHero = new Function(`${ts.transpile(fn('toHeroImgUrl'), { target: 'es2022' })};return toHeroImgUrl;`)();

const M = 'https://t1.kakaocdn.net/mystore/2D267630829342BCB59A057BC1BC1C9F';
assert.strictEqual(toHero(M), `https://img1.daumcdn.net/thumb/R800x0/?fname=${encodeURIComponent(M)}`);
const KEEP = [
  'https://t1.daumcdn.net/local/kakaomapPhoto/review/abc?original',
  'https://t1.kakaocdn.net/local/kakaomapPhoto/review/abc?original',
  'https://tong.visitkorea.or.kr/cms/a.jpg',
  'https://images.unsplash.com/photo-1?w=800',
  'https://t1.kakaocdn.net.evil.com/mystore/a',
  'https://img1.daumcdn.net/thumb/R800x0/?fname=x',
];
for (const u of KEEP) assert.strictEqual(toHero(u), u, `원본 유지 실패: ${u}`);

// 히어로 마크업: 축소 주소는 src, 원본은 data-orig, 실패하면 원본으로 한 번 다시 받은 뒤 대체 아이콘으로 넘어간다
const marker = 'class="spot-detail-hero-img"';
const at = src.indexOf(marker);
assert.ok(at >= 0, '히어로 img가 없다');
const line = src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at));
assert.strictEqual((line.match(/<img /g) || []).length, 1);
assert.ok(line.includes('toHeroImgUrl(targetImgUrl)'), '히어로 src가 toHeroImgUrl을 거치지 않는다');
assert.ok(line.includes('data-orig="${escapeHtml(targetImgUrl)}"'), 'data-orig 원본이 없다');
assert.ok(line.includes("var o=this.dataset.orig; if(o){this.dataset.orig=''; this.src=o; return;}"), '원본 복귀 onerror가 없다');
assert.ok(line.indexOf('this.dataset.orig') < line.indexOf("this.style.display='none'"), '원본 복귀가 대체 아이콘 전환보다 앞서지 않는다');
console.log('ok');
