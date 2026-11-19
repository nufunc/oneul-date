// 빌드 끝에 dist의 모든 HTML 쪽 </body> 앞에 소개, 개인정보처리방침, 문의 링크 줄을 넣는다(P-536).
// 애드센스 심사는 어느 쪽에서든 정책 쪽으로 가는 길을 본다. 매거진 글 105편은 바닥글 틀이 서너 가지이고
// 앱 바닥글은 src/main.ts가 그리므로, 원본을 고치지 않고 산출물 한 곳에서 같은 줄을 넣는다.
// 주소는 기본 사이트 주소로 쓰고 뒤에 도는 rebase_dist.mjs가 SITE_ORIGIN으로 바꾼다. 이미 있으면 넣지 않는다.
// 실행 시점: vite build와 generate_seo_pages.mjs 뒤, rebase_dist.mjs 앞.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://nufunc.github.io/oneul-date/';
const MARK = 'class="site-policy-links"';
// assets는 번들, data는 장소 자료라 HTML 쪽이 없다
const SKIP_DIRS = new Set(['assets', 'data']);
const link = (href, text, ext = false) =>
  `<a href="${href}" style="color:inherit"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
const POLICY_NAV = `<nav ${MARK} aria-label="사이트 정보" style="grid-column:1 / -1;max-width:680px;margin:0 auto;`
  + `padding:16px 20px calc(16px + env(safe-area-inset-bottom, 0px));text-align:center;font-size:13px;line-height:1.6;opacity:.75">`
  + [link(`${SITE}about`, '소개'), link(`${SITE}privacy`, '개인정보처리방침'),
    link('https://github.com/nufunc/oneul-date/issues', '문의', true)].join(' · ')
  + '</nav>';

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  console.error('build_policy_links: dist가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

let done = 0;
const missing = [];
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!(dir === distDir && SKIP_DIRS.has(ent.name))) walk(p);
      continue;
    }
    if (!ent.name.endsWith('.html')) continue;
    const html = fs.readFileSync(p, 'utf-8');
    if (html.includes(MARK)) continue;
    const at = html.lastIndexOf('</body>');
    if (at < 0) { missing.push(path.relative(distDir, p)); continue; }
    fs.writeFileSync(p, `${html.slice(0, at)}  ${POLICY_NAV}\n  ${html.slice(at)}`);
    done++;
  }
};
walk(distDir);
console.log(`build_policy_links: 소개·개인정보처리방침·문의 링크를 ${done}쪽에 넣었다`);
if (missing.length) console.warn(`build_policy_links: </body>가 없어 건너뛴 쪽 ${missing.length}개\n  ${missing.join('\n  ')}`);
