// 빌드 끝에 dist/blog/index.html의 앞 카드 4장을 읽어 dist/index.html의 <div id="app"> 앞에 정적 매거진 블록을 넣는다.
// 실행 시점: generate_seo_pages.mjs 뒤. 그 뒤에 돌려야 지역 랜딩(dist/<region>/<slot>/)이 이 블록을 복제하지 않는다.
// 카드를 4장 읽지 못하면 빈 블록을 만들지 않고 빌드를 실패시킨다.
import fs from 'node:fs';
import path from 'node:path';

const COUNT = 4;
const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const blogIndexPath = path.join(distDir, 'blog', 'index.html');
const APP_TAG = '<div id="app"></div>';

function fail(message) {
  console.error(`build_home_magazine: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath) || !fs.existsSync(blogIndexPath)) fail('dist/index.html 또는 dist/blog/index.html이 없다. vite build 이후에 실행해야 한다.');

const blogHtml = fs.readFileSync(blogIndexPath, 'utf-8');
const cards = [];
const cardRe = /<a href="([^"]*)" class="post-card">([\s\S]*?)<\/a>/g;
for (const m of blogHtml.matchAll(cardRe)) {
  if (cards.length === COUNT) break;
  const slug = m[1].match(/^([a-z0-9-]+)\/$/)?.[1];
  const title = m[2].match(/<h2 class="card-title">([\s\S]*?)<\/h2>/)?.[1].replace(/<[^>]*>/g, '').trim();
  if (!slug || !title) fail(`카드를 읽지 못했다: href="${m[1]}"`);
  cards.push({ slug, title });
}
if (cards.length < COUNT) fail(`카드 ${cards.length}장만 읽었다(필요 ${COUNT}장).`);

const html = fs.readFileSync(indexPath, 'utf-8');
if (html.split(APP_TAG).length !== 2) fail(`dist/index.html에 ${APP_TAG}가 정확히 하나 있어야 한다.`);
if (html.includes('id="home-magazine"')) fail('dist/index.html에 이미 매거진 블록이 있다. vite build부터 다시 돌린다.');

const items = cards.map((c) => `
        <li><a href="./blog/${c.slug}/">${c.title}</a></li>`).join('');
const section = `<section id="home-magazine" class="home-magazine" aria-labelledby="home-magazine-title">
      <h2 id="home-magazine-title" class="home-magazine-title">최신 매거진 글</h2>
      <ul class="home-magazine-list">${items}
      </ul>
      <a class="home-magazine-more" href="./blog/">매거진 전체 보기 →</a>
    </section>
    `;

fs.writeFileSync(indexPath, html.replace(APP_TAG, section + APP_TAG));
console.log(`build_home_magazine: dist/index.html에 매거진 글 ${cards.length}편 블록을 넣었다 (${cards.map((c) => c.slug).join(', ')})`);
