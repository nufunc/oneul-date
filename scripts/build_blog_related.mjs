// 빌드 끝에 dist/blog/index.html의 카드를 읽어 dist/blog/<slug>/index.html마다 </body> 앞에 관련 글 링크 블록을 넣는다.
// 글 89편 모두 다른 글로 가는 링크가 없어 글 끝에서 목록이나 홈으로만 돌아가던 것을 막는다.
// 고르는 규칙: 같은 권역 글 최대 2편(목록에서 자기와 가까운 순, 자기 제외) + 목록 바로 앞뒤 글로 채워 3편. 목록은 최신 글이 앞이다.
// 권역은 카드 제목의 [ ] 첫 낱말로 정한다. card-region-badge는 89장 중 88장이 "경남 함안"이라 쓰지 않는다.
// 실행 시점: build_home_magazine.mjs 뒤. 원본 public/blog/는 고치지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const COUNT = 3;
const SAME_REGION_MAX = 2;
const blogDir = path.resolve('dist', 'blog');
const blogIndexPath = path.join(blogDir, 'index.html');
const BODY_END = '</body>';

// 제목이 시·군 이름으로만 시작하는 글의 권역. 여기 없는 이름은 권역 없이 목록 앞뒤 글로만 채운다.
const CITY_REGION = {
  포항: '경북', 안동: '경북', 영주: '경북', 청송: '경북', 문경: '경북', 경주: '경북',
  하동: '경남', 통영: '경남',
  파주: '경기', 양평: '경기', 가평: '경기', 포천: '경기', 수원: '경기',
  영월: '강원', 철원: '강원', 원주: '강원', 춘천: '강원', 속초: '강원', 평창: '강원', 강릉: '강원',
  청주: '충북', 괴산: '충북', 제천: '충북', 보은: '충북', 단양: '충북',
  예산: '충남', 부여: '충남', 태안: '충남', 아산: '충남', 홍성: '충남', 공주: '충남',
  고창: '전북', 정읍: '전북', 남원: '전북', 전주: '전북', 군산: '전북',
  구례: '전남', 담양: '전남', 순천: '전남', 여수: '전남',
  상암: '서울', 서촌: '서울', 성수: '서울',
};
const PROVINCES = new Set(['서울', '경기', '인천', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '대구', '대전', '부산', '제주']);

function fail(message) {
  console.error(`build_blog_related: ${message}`);
  process.exit(1);
}

function regionOf(title) {
  const word = title.match(/^\[([^\]\s·]+)/)?.[1];
  if (!word) return null;
  return PROVINCES.has(word) ? word : CITY_REGION[word] ?? null;
}

if (!fs.existsSync(blogIndexPath)) fail('dist/blog/index.html이 없다. vite build 이후에 실행해야 한다.');

const posts = [];
for (const m of fs.readFileSync(blogIndexPath, 'utf-8').matchAll(/<a href="([^"]*)" class="post-card">([\s\S]*?)<\/a>/g)) {
  const slug = m[1].match(/^([a-z0-9-]+)\/$/)?.[1];
  const title = m[2].match(/<h2 class="card-title">([\s\S]*?)<\/h2>/)?.[1].replace(/<[^>]*>/g, '').trim();
  if (!slug || !title) fail(`카드를 읽지 못했다: href="${m[1]}"`);
  if (!fs.existsSync(path.join(blogDir, slug, 'index.html'))) fail(`카드의 글이 dist에 없다: ${slug}`);
  posts.push({ slug, title, region: regionOf(title) });
}
if (posts.length <= COUNT) fail(`카드 ${posts.length}장만 읽었다(필요 ${COUNT + 1}장 이상).`);
const unknown = posts.filter((p) => !p.region).map((p) => p.slug);
if (unknown.length) console.warn(`build_blog_related: 권역을 정하지 못해 목록 앞뒤 글로만 채운 글 ${unknown.length}편 (${unknown.join(', ')})`);

// P-347: 글의 Hallmark 토큰(종이색, 먹색, 본문 글꼴)을 따르고 글처럼 다크 전환을 하지 않는다. 토큰이 없는 글은 대체값을 쓴다
const STYLE = `<style>
.od-related{box-sizing:border-box;width:calc(100% - 32px);max-width:var(--measure,720px);margin:40px auto;padding:20px;border:1px solid var(--color-rule,#e5e7eb);border-radius:var(--radius-card,12px);background:var(--color-paper-2,#fff);color:var(--color-ink,#1f2937);font:16px/1.5 var(--font-family,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif);text-align:left}
.od-related h2{margin:0 0 8px;font-size:18px;line-height:1.4;font-weight:700;color:var(--color-ink,#111827);font-family:var(--font-display,inherit)}
.od-related ul{list-style:none;margin:0;padding:0}
.od-related li{margin:0;padding:0;border-top:1px solid var(--color-rule,#e5e7eb)}
.od-related li:first-child{border-top:0}
.od-related a{display:flex;align-items:center;min-height:44px;padding:10px 0;box-sizing:border-box;color:var(--color-ink,#1f2937);text-decoration:none;overflow-wrap:anywhere}
.od-related a:hover{text-decoration:underline}
.od-related a.od-related-more{justify-content:flex-end;margin-top:4px;color:var(--color-accent-2,#be185d);font-weight:600}
</style>`;

// P-243: 남은 칸을 최신 글로 채우면 모든 글이 최신 글 한 편을 가리켜, 같은 권역도 남은 칸도 목록에서 자기와 가까운 글로 고른다.
function navFor(post) {
  const i = posts.indexOf(post);
  const picked = posts
    .filter((p) => p !== post && post.region && p.region === post.region)
    .sort((a, b) => Math.abs(posts.indexOf(a) - i) - Math.abs(posts.indexOf(b) - i))
    .slice(0, SAME_REGION_MAX);
  for (let k = 1; picked.length < COUNT; k++) {
    for (const p of [posts[i - k], posts[i + k]]) {
      if (p && picked.length < COUNT && !picked.includes(p)) picked.push(p);
    }
  }
  const items = picked.map((p) => `<li><a href="../${p.slug}/">${p.title}</a></li>`).join('');
  return `<nav class="od-related" aria-label="다른 매거진 글">${STYLE}<h2>다음에 볼 글</h2><ul>${items}</ul><a class="od-related-more" href="../">매거진 전체 보기 →</a></nav>\n`;
}

// P-240: 글 안 코스 상자가 글 끝 하나뿐이라, 코스 링크(#c=)가 있는 글에는 첫 링크를 복제한 막대를 화면 아래에 붙인다.
// spacer는 맨 끝 관련 글 링크가 막대에 가리지 않게, scroll-padding-bottom은 Tab 초점이 막대 뒤로 들어가지 않게 둔다.
const COURSE_STYLE = `<style>
.od-course-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:999px;background:#1c1917;color:#fff;font:700 15px/1.2 Pretendard,system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,.25);white-space:nowrap}
.od-course-bar:focus-visible{outline:3px solid #0284c7;outline-offset:3px}
.od-course-spacer{height:76px}
html{scroll-padding-bottom:80px}
.od-course-bar[hidden]{display:none}
</style>`;
// 320×640에서 첫 화면 코스 버튼(a.btn)이 막대에 가려지고 같은 링크가 둘 보이므로, 글 안 코스 버튼이 화면에 보이는 동안 막대를 hidden으로 뺀다(초점과 스크린리더에서도 빠진다).
// 스크립트가 없거나 IntersectionObserver가 없거나 글 안 코스 버튼이 없는 옛 틀 글은 막대가 그대로 보인다.
const COURSE_SCRIPT = `<script>(function(){var b=document.querySelector('.od-course-bar'),t=document.querySelectorAll('a.btn[href*="#c="]');if(!b||!t.length||!('IntersectionObserver' in window))return;var n=new Set(),o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)n.add(e.target);else n.delete(e.target)});b.hidden=n.size>0});t.forEach(function(e){o.observe(e)})})()</script>`;

function courseBarFor(html) {
  const href = html.match(/href="([^"]*#c=[^"]*)"/)?.[1];
  if (!href) return '';
  return `${COURSE_STYLE}<div class="od-course-spacer" aria-hidden="true"></div><a class="od-course-bar" href="${href}">🗺️ 이 코스 앱에서 열기</a>${COURSE_SCRIPT}\n`;
}

let barCount = 0;
for (const post of posts) {
  const file = path.join(blogDir, post.slug, 'index.html');
  const html = fs.readFileSync(file, 'utf-8');
  if (html.includes('class="od-related"')) fail(`${post.slug}에 이미 관련 글 블록이 있다. vite build부터 다시 돌린다.`);
  if (html.includes('od-course-bar')) fail(`${post.slug}에 이미 코스 막대가 있다. vite build부터 다시 돌린다.`);
  if (html.split(BODY_END).length !== 2) fail(`${post.slug}에 ${BODY_END}가 정확히 하나 있어야 한다.`);
  const bar = courseBarFor(html);
  if (bar) barCount++;
  fs.writeFileSync(file, html.replace(BODY_END, navFor(post) + bar + BODY_END));
}
const sameCounts = posts.map((p) => posts.filter((q) => q !== p && p.region && q.region === p.region).length);
console.log(`build_blog_related: 글 ${posts.length}편에 관련 글 블록을, ${barCount}편에 코스 막대를 넣었다 (같은 권역 글 2편 이상 ${sameCounts.filter((n) => n >= 2).length}편, 1편 ${sameCounts.filter((n) => n === 1).length}편, 0편 ${sameCounts.filter((n) => n === 0).length}편)`);
