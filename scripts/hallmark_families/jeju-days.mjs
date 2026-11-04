// 계열: main.post-container 아래 intro-box, route-summary(route-day-item), h2.spot-heading(day-badge)가 이어지는 제주 2박 3일 글(중산간, 남부).
// 장소 구획 안(p.spot-desc, photo-card, info-grid, tip-box, map-btn-wrap)은 real-photo-grid와 같아 그 모듈의 부품을 쓴다.
// 페이지 틀이 다르므로 머리 바·본문·푸터 상자까지 이 모듈이 읽는다(matchPage, convertPage). 모르는 요소가 있으면 실패한다.
import { fail, stripLead, tagText, costOf, appBoxOf, pageHeroOf } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';
import { figureOf, infoOf, tipOf, mapBtnOf } from './real-photo-grid.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');

// 동선: 날(route-day-item)마다 한 칸. "1일차 : 경로"는 날 이름과 경로로 나누고, 설명(route-stat)은 칸의 노트로 둔다.
function timelineOf(el) {
  const h3 = el.text.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? fail('route-summary 제목을 찾지 못했다');
  const items = [...el.text.matchAll(/<div class="route-day-item">\s*<div class="route-day-title">([\s\S]*?)<\/div>\s*<div class="route-stat">([\s\S]*?)<\/div>\s*<\/div>/g)];
  const left = innerOf(el).replace(/<h3>[\s\S]*?<\/h3>/, '').replace(/<div class="route-day-item">[\s\S]*?<\/div>\s*<\/div>/g, '').replace(/<div class="route-days">|<\/div>/g, '');
  if (!items.length || left.trim()) fail(`route-summary에 모르는 요소가 있다: ${left.trim().slice(0, 60)}`);
  const days = items.map((m) => {
    const t = m[1].trim().match(/^(\d+일차)\s*:\s*([\s\S]*)$/) ?? fail(`route-day-title를 읽지 못했다: ${m[1].slice(0, 30)}`);
    return { day: t[1], path: t[2].trim(), note: m[2].trim() };
  });
  return `<section class="timeline-card band">
        <div class="container">
          <h2 class="timeline-title">${stripLead(h3)}</h2>
          <div class="route" style="--n:${days.length}">
            ${days.map((d, i) => `<div class="tl-act" style="--r:1; --c:${i + 1}">${d.day}</div>\n            <div class="tl-step" style="--r:2; --c:${i + 1}"><span class="tl-place">${d.path}</span><span class="tl-note">${d.note}</span></div>`).join('\n            ')}
          </div>
        </div>
      </section>`;
}

function spotOf(g, n) {
  const body = g.items.map((el) => {
    if (el.tag === 'p' && has(el, 'spot-desc')) return noStyle(el.text).replace(/^<p class="spot-desc">/, '<p>');
    if (has(el, 'photo-card')) return figureOf(el);
    if (has(el, 'info-grid')) return infoOf(el, g.h2);
    if (has(el, 'tip-box')) return tipOf(el);
    if (has(el, 'map-btn-wrap')) return mapBtnOf(el).replace(/<\/?span>/g, '');
    return fail(`스팟 ${n}: 모르는 요소가 있다: ${el.tag}.${el.cls}`);
  });
  return `<section class="story-section">
            <h2 class="spot-title">${stripLead(g.h2)}</h2>
            <div class="story-body">
              ${body.join('\n              ')}
            </div>
          </section>`;
}

function costSection(h2, p, wrap) {
  const table = wrap.text.match(/<table\b[^>]*>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  const t = table.replace(/<table\b[^>]*>/, '<table class="cost-table">').replace(/<tr class="total-row">/, '<tr class="cost-total-row">');
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${h2}</h3>${p ? p.text : ''}<div class="table-wrap">${t}</div></section>`);
}

function mapSection(el) {
  const h3 = el.text.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? fail('map-collection 제목을 찾지 못했다');
  const ul = el.text.match(/<ul class="map-list">[\s\S]*<\/ul>/)?.[0] ?? fail('map-list를 찾지 못했다');
  if (innerOf(el).replace(/<h3>[\s\S]*?<\/h3>/, '').replace(ul, '').trim()) fail('map-collection에 모르는 요소가 있다');
  return `<section class="map-links">
          <h2 class="timeline-title">${stripLead(h3)}</h2>
          ${ul.replace(/<li class="map-list-item">/g, '<li>')}
        </section>`;
}

export default {
  name: 'jeju-days',
  match: () => false,
  matchPage: (html) => /<main class="post-container">/.test(html) && /class="route-day-item"/.test(html) && /<h2 class="spot-heading">/.test(html),
  convertPage(html, ctx) {
    const main = html.match(/<main class="post-container">\s*<article>([\s\S]*?)<\/article>\s*<\/main>/) ?? fail('main.post-container > article를 찾지 못했다');
    const ch = children(main[1]);
    let i = 0;
    const next = (test, what) => { const e = ch[i]; if (!e || !test(e)) fail(`${what}가 ${i}번째에 없다`); i++; return e; };

    // 머리: post-header(분류, 제목, 글쓴이 줄), 도입 상자, 동선 상자
    const head = next((e) => has(e, 'post-header'), 'post-header');
    const kicker = head.text.match(/<span class="post-category">([\s\S]*?)<\/span>/)?.[1] ?? fail('post-category를 찾지 못했다');
    const h1 = head.text.match(/<h1 class="post-title">([\s\S]*?)<\/h1>/)?.[1] ?? fail('h1.post-title을 찾지 못했다');
    const meta = head.text.match(/<div class="post-meta">([\s\S]*?)<\/div>/)?.[1] ?? fail('post-meta를 찾지 못했다');
    const spans = [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
    const leftH = head.text.replace(/<span class="post-category">[\s\S]*?<\/span>|<h1 class="post-title">[\s\S]*?<\/h1>|<div class="post-meta">[\s\S]*?<\/div>/g, '').replace(/<\/?div[^>]*>/g, '').trim();
    if (!spans.length || meta.replace(/<span>[\s\S]*?<\/span>|<span class="divider">\/<\/span>/g, '').trim() || leftH) fail('post-header 틀을 읽지 못했다');
    const intro = next((e) => has(e, 'intro-box'), 'intro-box');
    const ips = [...innerOf(intro).matchAll(/<p>[\s\S]*?<\/p>/g)].map((m) => m[0]);
    if (!ips.length || innerOf(intro).replace(/<p>[\s\S]*?<\/p>/g, '').trim()) fail('intro-box 틀을 읽지 못했다');
    const route = next((e) => has(e, 'route-summary'), 'route-summary');
    const href = main[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const hero = pageHeroOf({ kicker: kicker.split(' · ').map((s) => s.trim()).join('</span><span>'), title: h1, quote: '', spans, href });

    // 이어지는 요소: 장소 구획(h2.spot-heading + 아래 요소), 경비표(h2 + 표), 지도 목록, 앱 코스 상자, 푸터 상자
    const groups = [];
    let g = null;
    let costH2 = null, costP = null, costWrap = null, map = null, app = null, foot = null;
    for (; i < ch.length; i++) {
      const e = ch[i];
      if (e.tag === 'h2' && has(e, 'spot-heading')) { g = { h2: innerOf(e), items: [] }; groups.push(g); }
      else if (e.tag === 'h2') { if (costH2) fail('경비표 제목이 둘이다'); costH2 = stripLead(innerOf(e)); g = null; }
      else if (has(e, 'table-wrap')) { if (!costH2 || costWrap) fail('경비표 위치가 맞지 않다'); costWrap = e; }
      else if (costH2 && !costWrap && e.tag === 'p') costP = e;
      else if (has(e, 'map-collection')) map = e;
      else if (has(e, 'app-course-box')) app = e;
      else if (e.tag === 'footer' && has(e, 'post-footer')) foot = e;
      else if (g && !costH2 && !map) g.items.push(e);
      else fail(`article 아래에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
    }
    if (!groups.length || !costWrap || !map || !foot) fail('장소 구획, 경비표, 지도 목록, 푸터 상자가 모두 있어야 한다');
    const fm = innerOf(foot).match(/^<div class="editorial-badge">([\s\S]*?)<\/div>\s*((?:<p\b[\s\S]*?<\/p>\s*)+)$/) ?? fail('post-footer 틀을 읽지 못했다');
    const credit = `<p>${fm[1].trim()}</p>\n          ${noStyle(fm[2]).trim().replace(/<\/p>\s*<p/g, '</p>\n          <p')}`;

    const inner = `
      ${hero}

      <div class="container">
        <div class="prose-intro">${ips.join('\n        ')}</div>
      </div>

      <!-- 동선 -->
      ${timelineOf(route)}

      <div class="container">
        <div class="spots stories">
          ${groups.map((x, k) => spotOf(x, k + 1)).join('\n\n          ')}
        </div>

        ${costSection(costH2, costP, costWrap)}

        ${mapSection(map)}
${app ? `
        ${appBoxOf(app.text)}
` : ''}
        <footer class="article-credit">
          ${credit}
        </footer>
      </div>
    `;
    let out = html.replace(main[0], () => `<main class="article-container"><article>${inner}</article></main>`);

    const bar = out.match(/<header class="nav-header">\s*<div class="nav-inner">\s*<a href="([^"]*)" class="brand-logo">\s*<span>오늘 데이트 매거진<\/span>\s*<\/a>\s*<a href="([^"]*)" class="nav-back">([\s\S]*?)<\/a>\s*<\/div>\s*<\/header>/);
    if (!bar) fail('nav-header 틀을 읽지 못했다');
    out = out.replace(bar[0], () => `<header class="site-header">
    <div class="header-inner container">
      <a href="${bar[1]}" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav">
        <a href="${bar[2]}">${bar[3].trim()}</a>
      </nav>
    </div>
  </header>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    return ctx.finish(out);
  },
};
