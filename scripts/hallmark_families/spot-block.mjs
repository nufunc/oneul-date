// 계열: article.article-card + section.spot-block 글(강릉, 경주 1박 2일). 머리 바, 인용문, 동선 상자(itinerary-box), 장소 구획 사이의 이동 연결(bridge-card),
// 경비표(expense-section), 지도 상자(map-box), 에필로그, 앱 코스 상자가 한 article 안에 평평하게 이어져 페이지 전체를 이 모듈이 읽는다.
// 원본의 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견준다).
import { fail, stripLead, tagText, appBoxOf, costOf } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');
const bare = (p) => noStyle(p).replace(/^<p class="[^"]*">/, '<p>');

function figureOf(el, cls) {
  const m = el.text.match(/^<div class="content-photo">\s*(<img\b[^>]*>)\s*<div class="photo-caption">([\s\S]*?)<\/div>\s*<\/div>$/);
  if (!m) fail('content-photo 틀을 읽지 못했다');
  return `<figure class="${cls}">
              ${m[1].replace(/\s*\/?>$/, ' />')}
              <figcaption>${m[2].trim()}</figcaption>
            </figure>`;
}

// 동선 상자: 날(Day)마다 route 하나. 단계의 "이름 : 설명"에서 콜론은 구분 기호라 비교에서 뺀다(convert_blog_hallmark.mjs의 snapshot).
function timelineOf(el) {
  const ch = children(innerOf(el));
  const head = ch.find((e) => has(e, 'itinerary-header')) ?? fail('itinerary-header를 찾지 못했다');
  const title = stripLead(tagText(innerOf(head))).replace(/\s+/g, ' ');
  const days = [];
  for (const e of ch) {
    if (e === head) continue;
    if (e.tag === 'div' && !e.cls) {
      const d = innerOf(e).match(/^<span class="day-pill">([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>$/);
      if (!d) fail('day-pill 틀을 읽지 못했다');
      days.push({ label: `${d[1].trim()} · ${d[2].trim()}`, steps: [] });
    } else if (has(e, 'itinerary-step')) {
      const s = innerOf(e).match(/^<span class="time-tag">([\s\S]*?)<\/span>\s*<span>([\s\S]*)<\/span>$/);
      if (!s || !days.length) fail('itinerary-step 틀을 읽지 못했다');
      const named = s[2].trim().match(/^<strong>([\s\S]*?)<\/strong>\s*:\s*([\s\S]*)$/);
      days.at(-1).steps.push({ time: s[1].trim(), place: named ? named[1].trim() : s[2].trim(), note: named ? named[2].trim() : '' });
    } else fail(`동선 상자에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  }
  if (!days.length || days.some((d) => !d.steps.length)) fail('동선 상자에 날이나 단계가 없다');
  const routes = days.map((d) => `<div class="route" style="--n:${d.steps.length}">
            <div class="tl-act" style="--r:1; --c:1; --s:${d.steps.length}">${d.label}</div>
            ${d.steps.map((s, i) => `<div class="tl-step" style="--r:2; --c:${i + 1}"><span class="tl-time">${s.time}</span><span class="tl-place">${s.place}</span>${s.note ? `<span class="tl-note">${s.note}</span>` : ''}</div>`).join('\n            ')}
          </div>`);
  return `<section class="timeline-card band">
        <div class="container">
          <p class="timeline-title">${title}</p>
          ${routes.join('\n          ')}
        </div>
      </section>`;
}

function spotOf(el, n) {
  const ch = children(innerOf(el));
  const badge = ch[0]?.cls === 'spot-badge-wrap' ? ch[0] : fail(`스팟 ${n}: spot-badge-wrap이 첫 요소가 아니다`);
  const num = badge.text.match(/<span class="spot-num">([\s\S]*?)<\/span>/)?.[1];
  const cat = badge.text.match(/<span class="spot-category-label">([\s\S]*?)<\/span>/)?.[1];
  if (!num || !cat) fail(`스팟 ${n}: 번호나 분류를 찾지 못했다`);
  const h2 = ch[1]?.tag === 'h2' ? innerOf(ch[1]) : fail(`스팟 ${n}: h2가 둘째 요소가 아니다`);
  const body = ch.slice(2).map((e) => {
    if (e.tag === 'p' && has(e, 'spot-text')) return bare(e.text);
    if (has(e, 'content-photo')) return figureOf(e, 'story-photo');
    if (has(e, 'tip-card')) {
      const t = innerOf(e).match(/^<div class="tip-card-title">([\s\S]*?)<\/div>\s*(<ul>[\s\S]*<\/ul>)$/);
      if (!t) fail(`스팟 ${n}: tip-card 틀을 읽지 못했다`);
      return `<div class="tip-box"><strong class="tip-title">${stripLead(t[1])}</strong>${t[2]}</div>`;
    }
    return fail(`스팟 ${n}: 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  });
  return `<section class="story-section">
            <p class="story-kicker"><span class="spot-num">${num.trim()}</span><span>${cat.trim()}</span></p>
            <h2 class="spot-title">${stripLead(h2)}</h2>
            <div class="story-body">
              ${body.join('\n              ')}
            </div>
          </section>`;
}

function bridgeOf(el) {
  const m = el.text.match(/^<div class="bridge-card"[^>]*>\s*<span class="bridge-icon">[\s\S]*?<\/span>\s*<div>([\s\S]*?)<\/div>\s*<\/div>$/);
  if (!m) fail('bridge-card 틀을 읽지 못했다');
  return `<p class="drive-bridge">${m[1].trim()}</p>`;
}

function dayBreakOf(el) {
  const m = innerOf(el).match(/^<span[^>]*>([\s\S]*?)<\/span>$/);
  if (!m) fail('날 구분 상자 틀을 읽지 못했다');
  return `<p class="drive-bridge"><strong>${stripLead(m[1])}</strong></p>`;
}

function costSection(el) {
  const ch = children(innerOf(el));
  const title = ch.find((e) => has(e, 'expense-title')) ?? fail('expense-title을 찾지 못했다');
  const desc = ch.find((e) => has(e, 'expense-desc'));
  const wrap = ch.find((e) => has(e, 'table-responsive')) ?? fail('table-responsive를 찾지 못했다');
  if (ch.length !== 2 + (desc ? 1 : 0)) fail('경비 구획에 모르는 요소가 있다');
  let table = wrap.text.match(/<table\b[^>]*>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  table = table.replace(/<table\b[^>]*>/, '<table class="cost-table">').replace(/<tr class="total-row">/, '<tr class="cost-total-row">').replace(/<t([dh])([^>]*?) style="[^"]*"/g, '<t$1$2');
  if (/ style="/.test(table)) fail('경비표에 모르는 인라인 스타일이 있다');
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${stripLead(tagText(innerOf(title)))}</h3>${desc ? `<p>${innerOf(desc)}</p>` : ''}<div class="table-wrap">${table}</div></section>`)
    .replace('<div class="table-wrap">', '<div class="table-wrap amount-last">')
    .replace(/<h2 class="timeline-title">([\s\S]*?)<\/h2>/, '<p class="timeline-title">$1</p>');
}

function mapSection(el) {
  const ch = children(innerOf(el));
  const title = ch.find((e) => has(e, 'map-box-title')) ?? fail('map-box-title을 찾지 못했다');
  const desc = ch.find((e) => has(e, 'map-box-desc')) ?? fail('map-box-desc를 찾지 못했다');
  const row = ch.find((e) => e.tag === 'div' && !e.cls) ?? fail('지도 링크 줄을 찾지 못했다');
  if (ch.length !== 3) fail('map-box에 모르는 요소가 있다');
  const links = [...innerOf(row).matchAll(/<a class="naver-btn"(?: style="[^"]*")? (href="[^"]*"[^>]*)>\s*([\s\S]*?)\s*<\/a>/g)];
  if (!links.length || innerOf(row).replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail('naver-btn 링크 줄을 읽지 못했다');
  return `<section class="map-links">
          <p class="timeline-title">${stripLead(innerOf(title))}</p>
          <p>${innerOf(desc)}</p>
          <ul class="map-list">
            ${links.map((l) => `<li><a ${l[1]}>${stripLead(l[2])}</a></li>`).join('\n            ')}
          </ul>
        </section>`;
}

function epilogueOf(el) {
  const m = innerOf(el).match(/^<h3[^>]*>([\s\S]*?)<\/h3>\s*((?:<p\b[\s\S]*?<\/p>\s*)+)$/);
  if (!m) fail('에필로그 틀을 읽지 못했다');
  const ps = [...m[2].matchAll(/<p\b[\s\S]*?<\/p>/g)].map((p) => bare(p[0]));
  return `<section class="prose-section">
          <h2>${stripLead(m[1])}</h2>
          ${ps.join('\n          ')}
        </section>`;
}

export default {
  name: 'spot-block',
  match: () => false,
  matchPage: (html) => /<article class="article-card">/.test(html) && /<section class="spot-block">/.test(html) && /<div class="itinerary-box">/.test(html),
  convertPage(html, ctx) {
    const wrap = html.match(/<main class="article-container">\s*<article class="article-card">([\s\S]*?)<\/article>\s*<\/main>/) ?? fail('article.article-card를 찾지 못했다');
    const ch = children(wrap[1]);
    let i = 0;
    const next = (test, what) => { const e = ch[i]; if (!e || !test(e)) fail(`${what}가 ${i}번째에 없다`); i++; return e; };

    // 머리: 배지, 제목, 인용문, 글쓴이 줄, 대표 사진, 도입 문단, 동선 상자
    const badge = next((e) => has(e, 'post-badge'), 'post-badge');
    const h1 = next((e) => e.tag === 'h1', 'h1');
    const quote = next((e) => has(e, 'post-quote'), 'post-quote');
    const who = next((e) => has(e, 'post-meta-row'), 'post-meta-row');
    const photo = next((e) => has(e, 'content-photo'), '대표 사진');
    const lead = [];
    while (ch[i] && has(ch[i], 'lead-paragraph')) lead.push(ch[i++]);
    if (!lead.length) fail('lead-paragraph가 없다');
    const box = next((e) => has(e, 'itinerary-box'), 'itinerary-box');

    const name = innerOf(who).match(/<div class="author-avatar">[\s\S]*?<\/div>\s*<div>\s*<div>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div>([\s\S]*?)<\/div>$/);
    if (!name) fail('post-meta-row 틀을 읽지 못했다');
    const href = wrap[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const hero = `<header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category"><span>${innerOf(badge)}</span></p>
          <h1 class="article-title">${innerOf(h1)}</h1>
          <p class="hero-quote">${innerOf(quote)}</p>
          <div class="article-meta">
            <span>${name[1].trim()}</span>
            <span>${name[2].trim()}</span>
            <span>${name[3].trim()}</span>
          </div>${href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : ''}
        </div>
      </header>`;

    // 이어지는 요소: 장소 구획과 이동 연결은 한 묶음(.stories.bridged), 나머지 구획은 원래 순서대로
    const parts = [];
    let n = 0;
    const story = (s) => { if (parts.at(-1)?.stories) parts.at(-1).stories.push(s); else parts.push({ stories: [s] }); };
    let app = null;
    for (; i < ch.length; i++) {
      const e = ch[i];
      if (e.tag === 'p' && has(e, 'spot-text')) story(`<p class="drive-bridge">${innerOf(e)}</p>`);
      else if (e.tag === 'section' && has(e, 'spot-block')) story(spotOf(e, ++n));
      else if (has(e, 'bridge-card')) story(bridgeOf(e));
      else if (e.tag === 'div' && !e.cls) story(dayBreakOf(e));
      else if (has(e, 'expense-section')) parts.push(costSection(e));
      else if (has(e, 'map-box')) parts.push(mapSection(e));
      else if (e.tag === 'section' && !e.cls) parts.push(epilogueOf(e));
      else if (has(e, 'app-course-box')) { if (app) fail('app-course-box가 둘이다'); app = e; }
      else fail(`article 아래에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
    }
    if (!n) fail('spot-block이 없다');
    const secs = parts.map((p) => (p.stories ? `<div class="spots stories bridged">\n          ${p.stories.join('\n\n          ')}\n        </div>` : p));

    const body = `
      ${hero}

      <div class="container">
        ${figureOf(photo, 'hero-figure').replace(/\n {2}/g, '\n')}
      </div>

      <div class="container">
        <div class="prose-intro">${lead.map((p) => bare(p.text)).join('\n        ')}</div>
      </div>

      <!-- 동선 -->
      ${timelineOf(box)}

      <div class="container">
        ${secs.join('\n\n        ')}
${app ? `
        ${appBoxOf(app.text)}
` : ''}      </div>
    `;
    let out = html.replace(wrap[0], () => `<main class="article-container">\n    <article>${body}</article>\n  </main>`);

    const bar = out.match(/<header class="travel-header-bar">\s*<div class="header-inner">\s*<div class="blog-tagline"><a href="([^"]*)"[^>]*>←\s*[\s\S]*?오늘 데이트 매거진<\/a><\/div>\s*<div class="read-time">([\s\S]*?)<\/div>\s*<\/div>\s*<\/header>/);
    if (!bar) fail('travel-header-bar 틀을 읽지 못했다');
    out = out.replace(bar[0], () => `<header class="site-header">
    <div class="header-inner container">
      <a href="${bar[1]}" class="header-logo">← 오늘 데이트 <span>매거진</span></a>
      <span class="header-note">${bar[2].trim()}</span>
    </div>
  </header>`);

    const foot = out.match(/<footer class="site-footer">\s*<div>([\s\S]*?)<\/div>\s*<div class="source-credit">([\s\S]*?)<\/div>\s*<\/footer>/);
    if (!foot) fail('site-footer 틀을 읽지 못했다');
    out = out.replace(foot[0], () => `<footer class="site-footer">
    <div class="footer-inner container">
      <p class="footer-line">${foot[1].trim()}</p>
      <p class="footer-line">${foot[2].trim()}</p>
    </div>
  </footer>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    return ctx.finish(out);
  },
};
