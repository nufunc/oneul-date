// 빌드 끝에 매거진 글꼴 CSS를 앱 루트(index.html)와 같은 Pretendard 가변 동적 서브셋으로 바꾼다(P-250).
// 정적 CSS는 굵기 5벌 3,848KB를 통째로 받아 글 첫 로드의 82~91%였고, 동적 서브셋은 그 글에 쓰인 글자 조각만 받아 431~506KB다.
// 대상은 dist/blog/index.html과 dist/blog/<slug>/index.html이다. 원본 public/blog/는 고치지 않는다.
// 매거진 CSS의 font-family 첫 순위가 이미 "Pretendard Variable"이라 링크 주소만 바꾼다.
import fs from 'node:fs';
import path from 'node:path';

const CDN = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/';
const STATIC = CDN + 'static/pretendard.min.css';
const DYNAMIC = CDN + 'variable/pretendardvariable-dynamic-subset.min.css';

const blogDir = path.resolve('dist', 'blog');
if (!fs.existsSync(blogDir)) {
  console.error('build_blog_fonts: dist/blog가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const files = [path.join(blogDir, 'index.html')];
for (const slug of fs.readdirSync(blogDir).sort()) files.push(path.join(blogDir, slug, 'index.html'));

let pages = 0;
let links = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf-8');
  const n = html.split(STATIC).length - 1;
  if (!n) continue;
  fs.writeFileSync(file, html.replaceAll(STATIC, DYNAMIC));
  pages++;
  links += n;
}

console.log(`build_blog_fonts: 글꼴 링크 ${links}개를 동적 서브셋으로 바꿨다 (${pages}개 파일)`);
if (!links) console.warn('build_blog_fonts: 경고: 바꿀 정적 Pretendard 링크가 없다. 원본이 이미 바뀌었는지 확인해야 한다.');
