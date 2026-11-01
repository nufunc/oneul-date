// 매거진 글꼴 빌드 결과 시험(P-250): npm run build 뒤 node scripts/test-blog-fonts.cjs
// dist/blog의 목록과 모든 글에 정적 Pretendard CSS 링크가 0개, 가변 동적 서브셋 링크가 1개이고 --font-family 첫 순위가 "Pretendard Variable"인지 본다.
// 임시 폴더의 픽스처로 빌드 스크립트를 돌려 치환 경로와, 바꿀 링크가 없을 때 경고만 내고 종료 코드 0인 경로를 본다
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CDN = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/';
const STATIC = CDN + 'static/pretendard.min.css';
const DYNAMIC = CDN + 'variable/pretendardvariable-dynamic-subset.min.css';
const count = (s, sub) => s.split(sub).length - 1;

const blog = path.join(__dirname, '..', 'dist', 'blog');
const pages = ['', ...fs.readdirSync(blog)].filter((d) => fs.existsSync(path.join(blog, d, 'index.html')));
assert.ok(pages.length > 3, 'dist/blog의 글을 읽지 못했다');
for (const d of pages) {
  const html = fs.readFileSync(path.join(blog, d, 'index.html'), 'utf8');
  const name = d || '목록';
  assert.strictEqual(count(html, STATIC), 0, `${name}: 정적 Pretendard 링크가 남았다`);
  assert.strictEqual(count(html, DYNAMIC), 1, `${name}: 동적 서브셋 링크가 1개가 아니다`);
  assert.match(html, /--font-family:\s*"Pretendard Variable",/, `${name}: --font-family 첫 순위가 "Pretendard Variable"이 아니다`);
}

// 임시 폴더에서 빌드 스크립트를 돈다
const script = path.join(__dirname, 'build_blog_fonts.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-fonts-'));
const link = (href) => `<link rel="stylesheet" as="style" crossorigin href="${href}" />`;
const write = (rel, s) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), s); };
const read = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
const run = () => execFileSync('node', [script], { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });

write('dist/blog/index.html', link(STATIC));
write('dist/blog/a/index.html', link(STATIC));
write('dist/blog/b/index.html', link(DYNAMIC));
write('dist/blog/c.png', 'x');
const out = run();
assert.match(out, /링크 2개를 동적 서브셋으로 바꿨다 \(2개 파일\)/, `치환 건수 출력이 다르다: ${out}`);
for (const rel of ['dist/blog/index.html', 'dist/blog/a/index.html', 'dist/blog/b/index.html']) assert.strictEqual(read(rel), link(DYNAMIC), `${rel}: 치환 결과가 다르다`);

const r = spawnSync('node', [script], { cwd: tmp, encoding: 'utf8' });
assert.strictEqual(r.status, 0, '바꿀 링크가 없을 때 종료 코드가 0이 아니다');
assert.match(r.stdout, /링크 0개/);
assert.match(r.stderr, /경고: 바꿀 정적 Pretendard 링크가 없다/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test-blog-fonts: dist ${pages.length}개 페이지와 픽스처 치환 통과`);
