// 빌드 끝에 매거진 글 dist/blog/<slug>/index.html의 BlogPosting JSON-LD에 mainEntityOfPage를 더하고,
// 그 뒤에 홈 > 매거진 > 글 BreadcrumbList JSON-LD를 따로 넣는다. 둘 다 0/97이라 검색 결과 경로 표시 후보가 아니었다.
// 글 주소는 그 쪽의 <link rel="canonical">이다. 원본 public/blog/는 고치지 않아 생성기와 앞으로 더할 글이 모두 이 한 곳을 지난다.
// 이미 있으면 덮지 않는다. 실행 시점: vite build 뒤. 목록 dist/blog/index.html은 대상이 아니다.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://nufunc.github.io/oneul-date/';
const blogDir = path.resolve('dist', 'blog');
const LD_RE = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;
const CANON_RE = /<link rel="canonical" href="([^"]+)"/;

if (!fs.existsSync(blogDir)) {
  console.error('build_blog_breadcrumb: dist/blog가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const warnings = [];
let done = 0;
for (const slug of fs.readdirSync(blogDir).sort()) {
  const file = path.join(blogDir, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf-8');
  const canonical = html.match(CANON_RE)?.[1];
  if (!canonical) { warnings.push(`${slug}: canonical이 없다`); continue; }
  const hasCrumb = html.includes('"BreadcrumbList"');
  const out = html.replace(LD_RE, (all, open, body, close) => {
    let ld;
    try { ld = JSON.parse(body); } catch { warnings.push(`${slug}: JSON-LD를 읽지 못했다`); return all; }
    if (ld['@type'] !== 'BlogPosting') return all;
    ld.mainEntityOfPage ??= { '@type': 'WebPage', '@id': canonical };
    const post = open + `\n${JSON.stringify(ld, null, 2)}\n  ` + close;
    if (hasCrumb) return post;
    const crumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE },
        { '@type': 'ListItem', position: 2, name: '매거진', item: `${SITE}blog/` },
        { '@type': 'ListItem', position: 3, name: ld.headline, item: canonical },
      ],
    };
    return `${post}\n  ${open}\n${JSON.stringify(crumb, null, 2)}\n  ${close}`;
  });
  if (out !== html) { fs.writeFileSync(file, out); done++; }
}

console.log(`build_blog_breadcrumb: mainEntityOfPage와 BreadcrumbList를 ${done}편에 넣었다`);
if (warnings.length) console.warn(`build_blog_breadcrumb: 경고 ${warnings.length}건\n  ${warnings.join('\n  ')}`);
