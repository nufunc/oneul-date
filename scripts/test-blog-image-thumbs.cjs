// 매거진 사진 축소 주소 빌드 결과 시험(P-247): npm run build 뒤 node scripts/test-blog-image-thumbs.cjs
// dist/blog의 글과 목록에서 t1.daumcdn.net, t1.kakaocdn.net, tong.visitkorea.or.kr img가 남지 않고, 바뀐 img는 축소 주소로 시작하며
// fname을 풀면 data-orig와 같고, 원본 주소가 크기 캐시에 있으면 width·height가 남아 있는지 본다. og:image는 원본 public/blog와 같은지 본다
// 픽스처를 임시 폴더에서 망을 끄고 돌려 크기 없는 img, &amp; 주소, 이미 onerror가 있는 img, 대상 밖 호스트, 다시 돌린 결과를 본다
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOST_RE = /^https?:\/\/(t1\.daumcdn\.net|t1\.kakaocdn\.net|tong\.visitkorea\.or\.kr)\//;
const PREFIX = 'https://img1.daumcdn.net/thumb/R800x0.fwebp/?fname=';
const script = path.join(__dirname, 'build_blog_image_sizes.mjs');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'blog_image_sizes.json'), 'utf8'));
const root = path.join(__dirname, '..');
const blog = path.join(root, 'dist', 'blog');
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const unamp = (s) => s.replace(/&amp;/g, '&');

function checkThumb(tag, where) {
  const src = attr(tag, 'src');
  const orig = attr(tag, 'data-orig');
  assert.ok(src.startsWith(PREFIX), `${where}: 축소 주소가 아니다: ${tag}`);
  assert.ok(orig && HOST_RE.test(orig), `${where}: data-orig가 대상 호스트 원본이 아니다: ${tag}`);
  assert.strictEqual(decodeURIComponent(src.slice(PREFIX.length)), unamp(orig), `${where}: fname과 data-orig가 다르다: ${tag}`);
  assert.ok(/\sonerror="var o=this\.dataset\.orig;/.test(tag), `${where}: 원본 되돌리기 onerror가 없다: ${tag}`);
}

// 1. 빌드된 dist/blog
const files = [path.join(blog, 'index.html'), ...fs.readdirSync(blog).map((d) => path.join(blog, d, 'index.html'))].filter((f) => fs.existsSync(f));
assert.ok(files.length > 3 && files[0].endsWith(path.join('blog', 'index.html')), 'dist/blog의 목록과 글을 읽지 못했다');
let posts = 0;
let list = 0;
for (const file of files) {
  const rel = path.relative(blog, file);
  const html = fs.readFileSync(file, 'utf8');
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const src = attr(tag, 'src');
    assert.ok(!HOST_RE.test(src), `${rel}: 축소하지 않은 img가 남았다: ${tag}`);
    if (attr(tag, 'data-orig') === undefined) continue;
    checkThumb(tag, rel);
    if (cache[attr(tag, 'data-orig')]) assert.ok(attr(tag, 'width') && attr(tag, 'height'), `${rel}: width·height가 없다: ${tag}`);
    if (rel === 'index.html') list++; else posts++;
  }
  const source = path.join(root, 'public', 'blog', rel);
  if (fs.existsSync(source)) {
    const og = (h) => [...h.matchAll(/<meta\s+property="og:image"\s+content="([^"]*)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(og(html), og(fs.readFileSync(source, 'utf8')), `${rel}: og:image가 원본과 다르다`);
  }
}
assert.ok(posts > 0 && list > 0, `축소 주소로 바꾼 img가 없다 (글 ${posts}, 목록 ${list})`);

// 2. 픽스처: 망을 끄고 돌린다
const cached = Object.keys(cache).find((k) => HOST_RE.test(k) && !k.includes('&'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-image-thumbs-'));
const page = path.join(tmp, 'dist', 'blog', 'x', 'index.html');
const listPage = path.join(tmp, 'dist', 'blog', 'index.html');
fs.mkdirSync(path.dirname(page), { recursive: true });
const uncached = 'http://tong.visitkorea.or.kr/none-test.jpg?a=1&amp;b=2';
const input = [
  `<meta property="og:image" content="${cached}">`,
  `<img src="${cached}" alt="a" />`,
  `<img src="${uncached}" alt="b" />`,
  `<img src="https://t1.daumcdn.net/x.png" onerror="this.remove()" alt="c" />`,
  `<img src="https://postfiles.pstatic.net/x.jpg" alt="d" />`,
  `<img src="${PREFIX}abc" alt="e" />`,
].join('\n');
fs.writeFileSync(page, input);
fs.writeFileSync(listPage, `<img src="${cached}" class="card-thumb" />`);
const run = () => execFileSync(process.execPath, [script], { cwd: tmp, env: { ...process.env, BLOG_IMAGE_SIZES_OFFLINE: '1' }, encoding: 'utf8' });
const log = run();
assert.ok(log.includes('img 3개를 축소 주소로 바꿨다 (onerror가 있어 둔 img 1개)'), `로그가 기대와 다르다: ${log}`);
const out = fs.readFileSync(page, 'utf8').split('\n');
const [w, h] = cache[cached];
assert.strictEqual(out[0], input.split('\n')[0], 'img 밖의 og:image가 바뀌었다');
assert.ok(out[1].startsWith(`<img width="${w}" height="${h}" src="${PREFIX}`), `크기와 축소 주소가 같이 들어가지 않았다: ${out[1]}`);
checkThumb(out[1], 'fixture a');
checkThumb(out[2], 'fixture b');
assert.ok(!/\swidth=/.test(out[2]), `캐시에 없는 주소에 크기가 들어갔다: ${out[2]}`);
assert.strictEqual(decodeURIComponent(attr(out[2], 'src').slice(PREFIX.length)), 'http://tong.visitkorea.or.kr/none-test.jpg?a=1&b=2', '&amp;를 풀지 않고 인코딩했다');
assert.deepStrictEqual(out.slice(3), input.split('\n').slice(3), 'onerror가 있거나 대상 밖인 img가 바뀌었다');
checkThumb(fs.readFileSync(listPage, 'utf8'), 'fixture list');
const once = fs.readFileSync(page, 'utf8') + fs.readFileSync(listPage, 'utf8');
run();
assert.strictEqual(fs.readFileSync(page, 'utf8') + fs.readFileSync(listPage, 'utf8'), once, '다시 돌리면 결과가 바뀐다');
fs.rmSync(tmp, { recursive: true });
console.log(`ok blog-image-thumbs (글 ${files.length - 1}편 img ${posts}개, 목록 img ${list}개를 축소 주소로)`);
