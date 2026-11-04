// 받은 코스 '← 글로 돌아가기' 회귀 테스트: node scripts/test-receiver-blog-back.cjs
// 같은 탭에서 글을 거쳐 왔으면 뒤로 가기를 부르고(읽던 자리 복원), 새 탭이거나 referrer가 다른 글이면 링크로 연다(P-296)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const start = src.indexOf('function isBlogReferrerBack');
assert.ok(start > 0, 'isBlogReferrerBack을 찾지 못했다');
const end = src.indexOf('\n}\n', start) + 3;
const back = new Function(`${ts.transpile(src.slice(start, end), { target: 'es2022' })}; return isBlogReferrerBack;`)();

const link = '/oneul-date/blog/ganghwa/';
const ref = 'https://nufunc.github.io/oneul-date/blog/ganghwa/';
assert.strictEqual(back(ref, link, 3), true, '같은 글 + 기록 있음 -> 뒤로 가기');
assert.strictEqual(back(ref + '?utm=x#top', link, 2), true, '쿼리와 해시는 경로 비교에서 뺀다');
assert.strictEqual(back(ref.slice(0, -1), link, 2), true, '끝 슬래시 차이는 같은 글이다');
assert.strictEqual(back(ref, link, 1), false, '새 탭(기록 1)은 링크로 연다');
assert.strictEqual(back('', link, 3), false, 'referrer 없음(앱 주소를 바로 연 경우)은 링크로 연다');
assert.strictEqual(back('https://nufunc.github.io/oneul-date/blog/gunwi/', link, 3), false, '다른 글에서 왔으면 링크로 연다');
assert.strictEqual(back('not a url', link, 3), false, '잘못된 referrer는 링크로 연다');

// 링크 클릭이 이 판정을 거쳐 preventDefault + history.back()을 부른다
const handler = src.indexOf("blogBack?.addEventListener('click'");
assert.ok(handler > 0, '클릭 처리를 찾지 못했다');
const body = src.slice(handler, src.indexOf('\n  });', handler));
assert.ok(/isBlogReferrerBack\(document\.referrer, blogBack\.pathname, history\.length\)/.test(body), '판정 호출이 없다');
assert.ok(body.indexOf('e.preventDefault()') > 0 && body.indexOf('history.back()') > body.indexOf('e.preventDefault()'), 'preventDefault 뒤 history.back()이어야 한다');
console.log('receiver-blog-back ok');
