// 매거진 글 사진 크기 속성 빌드 결과 시험(P-244): npm run build 뒤 node scripts/test-blog-image-sizes.cjs
// dist/blog/<slug>/index.html의 img 중 width·height가 없는 것의 주소 수가 캐시에 없는 주소 수 이하이고, 넣은 값이 양의 정수이며 캐시 값과 같은지 본다
// 망을 끈 실행과 받기에 실패하는 주소로 빌드 스크립트를 임시 폴더에서 돌려, 캐시에 있는 주소만 크기가 들어가고 나머지는 그대로이며 종료 코드가 0인지 본다
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const script = path.join(__dirname, 'build_blog_image_sizes.mjs');
const cachePath = path.join(__dirname, 'blog_image_sizes.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const blog = path.join(__dirname, '..', 'dist', 'blog');
const files = fs.readdirSync(blog).map((d) => path.join(blog, d, 'index.html')).filter((f) => fs.existsSync(f));
assert.ok(files.length > 3, 'dist/blog의 글을 읽지 못했다');

let sized = 0;
const unsized = new Set();
for (const file of files) {
  for (const [tag] of fs.readFileSync(file, 'utf8').matchAll(/<img\b[^>]*>/g)) {
    const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
    const w = tag.match(/\swidth="([^"]*)"/)?.[1];
    const h = tag.match(/\sheight="([^"]*)"/)?.[1];
    if (w === undefined && h === undefined) { unsized.add(src); continue; }
    assert.ok(/^[1-9]\d*$/.test(w) && /^[1-9]\d*$/.test(h), `${path.relative(blog, file)}: width·height가 양의 정수가 아니다: ${tag}`);
    assert.deepStrictEqual([+w, +h], cache[src], `${path.relative(blog, file)}: 넣은 크기가 캐시와 다르다: ${src}`);
    sized++;
  }
}
const notCached = [...unsized].filter((s) => !cache[s]);
assert.ok(unsized.size <= notCached.length, `캐시에 있는데 크기가 없는 img 주소가 있다: ${[...unsized].filter((s) => cache[s]).join(', ')}`);
assert.ok(sized > 0, '크기를 넣은 img가 없다');

// 망 없이 캐시만으로 도는 경로와 받기에 실패하는 경로
const cached = Object.keys(cache)[0];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-image-sizes-'));
const page = path.join(tmp, 'dist', 'blog', 'x', 'index.html');
fs.mkdirSync(path.dirname(page), { recursive: true });
const cacheBefore = fs.readFileSync(cachePath, 'utf8');
const input = `<img src="${cached}" alt="a" /><img src="http://127.0.0.1:9/none.jpg" alt="b" /><img width="10" height="20" src="${cached}" alt="c" />`;
for (const env of [{ BLOG_IMAGE_SIZES_OFFLINE: '1' }, {}]) {
  fs.writeFileSync(page, input);
  execFileSync(process.execPath, [script], { cwd: tmp, env: { ...process.env, ...env }, stdio: 'pipe' });
  const out = fs.readFileSync(page, 'utf8');
  const [w, h] = cache[cached];
  assert.strictEqual(out, input.replace(`<img src="${cached}" alt="a"`, `<img width="${w}" height="${h}" src="${cached}" alt="a"`), `${JSON.stringify(env)}: 결과가 기대와 다르다: ${out}`);
}
assert.strictEqual(fs.readFileSync(cachePath, 'utf8'), cacheBefore, '실패한 주소로 캐시가 바뀌었다');
fs.rmSync(tmp, { recursive: true });
console.log(`ok blog-image-sizes (글 ${files.length}편, 크기를 넣은 img ${sized}개, 크기 없는 img 주소 ${unsized.size}개, 캐시 ${Object.keys(cache).length}개)`);
