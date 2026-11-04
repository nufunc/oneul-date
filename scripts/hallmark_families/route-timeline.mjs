// 계열: article.spot-section + div.route-timeline 글(보령, 거제, 고성). 장소마다 <article>이고 main 바로 아래 평평하게 이어져 페이지 전체를 이 모듈이 읽는다.
// 구성: header.article-header(span.badge, h1, div.meta-info), div.intro-box, section.overview-card(timeline-item), 장소 구획(spot-chips 칩, 사진, spot-info-list, spot-desc, tip-box, action-chips),
// section.cost-section, div.conclusion-box, div.app-course-box, site-footer(footer-links, 저작권 줄).
// 원본의 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견준다).
import { fail, stripLead, tagText, appBoxOf, costOf } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');

function timelineOf(el) {
  const raw = innerOf(el);
  const title = raw.match(/<h2 class="overview-title">([\s\S]*?)<\/h2>/)?.[1] ?? fail('overview-title을 찾지 못했다');
  const lead = raw.match(/<p style="[^"]*">([\s\S]*?)<\/p>/)?.[1];
  const list = raw.match(/<div class="route-timeline">([\s\S]*)<\/div>\s*$/)?.[1] ?? fail('route-timeline을 찾지 못했다');
  const itemRe = /<div class="timeline-item">\s*<span class="timeline-time">([\s\S]*?)<\/span>\s*<span class="timeline-name"><strong>([\s\S]*?)<\/strong>\s*([\s\S]*?)<\/span>\s*(?:<span class="timeline-dist">([\s\S]*?)<\/span>\s*)?<\/div>/g;
  const items = [...list.matchAll(itemRe)];
  const left = raw.replace(/<h2 class="overview-title">[\s\S]*?<\/h2>/, '').replace(lead ? /<p style="[^"]*">[\s\S]*?<\/p>/ : /$^/, '').replace(/<div class="route-timeline">[\s\S]*$/, '');
  if (!items.length || left.trim() || list.replace(itemRe, '').trim()) fail('동선(overview-card)에 모르는 요소가 있다');
  const steps = items.map((m, i) => {
    const note = m[3].trim();
    const dist = m[4] ? `<em class="tl-meta">${m[4].trim()}</em>` : '';
    return `<div class="tl-step" style="--r:2; --c:${i + 1}"><span class="tl-time">${m[1].trim()}</span><span class="tl-place">${m[2].trim()}</span><span class="tl-note">${note}${dist}</span></div>`;
  });
  return `<section class="timeline-card band">
        <div class="container">
          <h2 class="timeline-title">${stripLead(title)}</h2>${lead ? `\n          <p class="tl-lead">${lead.trim()}</p>` : ''}
          <div class="route range" style="--n:${items.length}">
            ${steps.join('\n            ')}
          </div>
        </div>
      </section>`;
}

function spotOf(el, n) {
  const m = el.text.match(/^<article class="spot-section">\s*<div class="spot-header">\s*<div>\s*(<span class="spot-number">[\s\S]*?<\/span>)\s*(<h2 class="spot-title">[\s\S]*?<\/h2>)\s*<div class="spot-chips">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>([\s\S]*)<\/article>$/);
  if (!m) fail(`스팟 ${n}: spot-header 틀을 읽지 못했다`);
  const chips = [...m[3].matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].map((c) => c[1].trim());
  if (!chips.length || m[3].replace(/<span class="chip">[\s\S]*?<\/span>/g, '').trim()) fail(`스팟 ${n}: spot-chips에 모르는 요소가 있다`);
  let rest = m[4];
  const photo = rest.match(/^\s*<div class="spot-image-wrap">\s*(<img\b[^>]*>)\s*<div class="image-caption">([\s\S]*?)<\/div>\s*<\/div>/);
  if (photo) rest = rest.slice(photo[0].length);
  const parts = [];
  const kinds = [
    [/^\s*<ul class="spot-info-list">([\s\S]*?)<\/ul>/, (x) => {
      const rows = [...x[1].matchAll(/<li><span class="spot-info-label">([\s\S]*?)<\/span><span class="spot-info-val">([\s\S]*?)<\/span><\/li>/g)];
      if (!rows.length || x[1].replace(/<li>[\s\S]*?<\/li>/g, '').trim()) fail(`스팟 ${n}: spot-info-list에 모르는 요소가 있다`);
      return `<div class="spot-info-box info-wide">${rows.map((r) => `<div class="info-row"><span class="info-label">${r[1].trim()}</span><span class="info-val">${r[2].trim()}</span></div>`).join('')}</div>`;
    }],
    [/^\s*<p class="spot-desc">[\s\S]*?<\/p>/, (x) => x[0].trim()],
    [/^\s*<div class="tip-box">\s*<div class="tip-box-title">([\s\S]*?)<\/div>([\s\S]*?)<\/div>/, (x) => `<div class="tip-box"><strong class="tip-title">${stripLead(x[1])}</strong>${x[2].trim()}</div>`],
    [/^\s*<div class="action-chips">([\s\S]*?)<\/div>/, (x) => {
      const links = [...x[1].matchAll(/<a (href="[^"]*"[^>]*?) class="btn-map">\s*([\s\S]*?)\s*<\/a>/g)];
      if (!links.length || x[1].replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail(`스팟 ${n}: action-chips에 모르는 요소가 있다`);
      return `<div class="map-btn-wrap spot-actions">${links.map((l) => `<a ${l[1]} class="btn-naver-map link-quiet">${stripLead(l[2])}</a>`).join('')}</div>`;
    }],
  ];
  for (let hit = true; hit; ) {
    hit = false;
    for (const [re, f] of kinds) {
      const x = rest.match(re);
      if (x) { parts.push(f(x)); rest = rest.slice(x[0].length); hit = true; break; }
    }
  }
  if (rest.replace(/<!--[\s\S]*?-->/g, '').trim()) fail(`스팟 ${n}: 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);
  const cls = ['spot-section', n % 2 === 0 && photo ? 'flip' : '', photo ? '' : 'no-photo'].filter(Boolean).join(' ');
  const fig = photo ? `\n            <figure class="spot-photo spot-image-wrap">
              ${photo[1].replace(/\s*\/?>$/, ' />')}
              <figcaption>${noStyle(photo[2]).replace(/<span>/g, '<span class="cap-src">').trim()}</figcaption>
            </figure>` : '';
  return `<section class="${cls}">
            <div class="spot-head">
              <div class="spot-header">${m[1]}${m[2]}</div>
              <p class="spot-tagline">${chips.join(' · ')}</p>
            </div>${fig}
            <div class="spot-body">
              ${parts.join('\n              ')}
            </div>
          </section>`;
}

function costSection(el) {
  const raw = innerOf(el);
  const title = raw.match(/<h2 class="cost-title">([\s\S]*?)<\/h2>/)?.[1] ?? fail('cost-title을 찾지 못했다');
  const sub = raw.match(/<p class="cost-sub">([\s\S]*?)<\/p>/)?.[1];
  let table = raw.match(/<div class="table-wrap">\s*(<table>[\s\S]*<\/table>)\s*<\/div>/)?.[1] ?? fail('경비표 table을 찾지 못했다');
  table = table.replace('<table>', '<table class="cost-table">').replace(/<tr style="[^"]*font-weight:\s*700[^"]*">/, '<tr class="cost-total-row">').replace(/<t([dh])([^>]*?) style="[^"]*"/g, '<t$1$2');
  if (/ style="/.test(table)) fail('경비표에 모르는 인라인 스타일이 있다');
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${title}</h3>${sub ? `<p>${sub.trim()}</p>` : ''}<div class="table-wrap">${table}</div></section>`);
}

function conclusionOf(el) {
  const m = innerOf(el).match(/^<h2 class="conclusion-title">([\s\S]*?)<\/h2>\s*((?:<p>[\s\S]*?<\/p>\s*)+)$/);
  if (!m) fail('conclusion-box 틀을 읽지 못했다');
  return `<section class="prose-section">
          <h2>${stripLead(m[1])}</h2>
          ${m[2].trim()}
        </section>`;
}

export default {
  name: 'route-timeline',
  match: () => false,
  matchPage: (html) => /<article class="spot-section">/.test(html) && /<div class="route-timeline">/.test(html) && /<section class="overview-card">/.test(html),
  convertPage(html, ctx) {
    const wrap = html.match(/<main class="article-container">([\s\S]*?)<\/main>/) ?? fail('<main class="article-container">를 찾지 못했다');
    const ch = children(wrap[1]);
    const one = (cls) => { const f = ch.filter((e) => has(e, cls)); if (f.length !== 1) fail(`${cls}가 ${f.length}개다(1개여야 한다)`); return f[0]; };
    const hdr = one('article-header');
    const kicker = hdr.text.match(/<span class="badge">([\s\S]*?)<\/span>/)?.[1] ?? fail('badge를 찾지 못했다');
    const h1 = hdr.text.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? fail('h1을 찾지 못했다');
    const meta = hdr.text.match(/<div class="meta-info">([\s\S]*?)<\/div>/)?.[1] ?? fail('meta-info를 찾지 못했다');
    const spans = [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter((s) => s !== '·');
    if (!spans.length) fail('meta-info에 span이 없다');
    if (hdr.text.replace(/<span class="badge">[\s\S]*?<\/span>|<h1>[\s\S]*?<\/h1>|<div class="meta-info">[\s\S]*?<\/div>|<\/?header[^>]*>/g, '').trim()) fail('머리에 모르는 요소가 있다');
    const intro = one('intro-box');
    if (/<(div|p|ul|ol|table|h[1-6])\b/.test(innerOf(intro))) fail('도입 문단 안에 블록 요소가 있다');
    const spots = ch.filter((e) => e.tag === 'article' && has(e, 'spot-section'));
    const app = ch.filter((e) => has(e, 'app-course-box'));
    const known = new Set([hdr, intro, one('overview-card'), one('cost-section'), one('conclusion-box'), ...spots, ...app]);
    const unknown = ch.find((e) => !known.has(e));
    if (unknown) fail(`main 아래에 모르는 요소가 있다: ${unknown.tag}.${unknown.cls}`);
    if (!spots.length) fail('spot-section이 없다');
    if (app.length > 1) fail('app-course-box가 둘 이상이다');
    // 글 순서: 머리, 도입, 동선, 장소들, 경비, 총평, 앱 코스 상자
    const order = ch.map((e) => e.cls.split(' ')[0]).join(' ');
    const want = ['article-header', 'intro-box', 'overview-card', ...spots.map(() => 'spot-section'), 'cost-section', 'conclusion-box', ...app.map(() => 'app-course-box')].join(' ');
    if (order !== want) fail(`main 아래 순서가 다르다: ${order}`);

    const href = wrap[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const metaHtml = spans.map((s) => (/^발행일/.test(s) ? `<span>${s}</span>` : `<span class="meta-credit">${s}</span>`)).join('\n            ');
    const hero = `<header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category">${tagText(kicker).split(' · ').map((s) => `<span>${s.trim()}</span>`).join('')}</p>
          <h1 class="article-title">${h1}</h1>
          <div class="article-meta">
            ${metaHtml}
          </div>${href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : ''}
        </div>
      </header>`;
    const body = `
      ${hero}

      <div class="container">
        <p class="prose-intro">${innerOf(intro)}</p>
      </div>

      <!-- 동선 -->
      ${timelineOf(ch.find((e) => has(e, 'overview-card')))}

      <div class="container">
        <div class="spots">
          ${spots.map((s, i) => spotOf(s, i + 1)).join('\n\n          ')}
        </div>

        ${costSection(one('cost-section'))}

        ${conclusionOf(one('conclusion-box'))}
${app.length ? `
        ${appBoxOf(app[0].text)}
` : ''}      </div>
    `;
    let out = html.replace(wrap[0], () => `<main class="article-container">\n    <article>${body}</article>\n  </main>`);

    const foot = out.match(/<footer class="site-footer">\s*<div class="footer-links">\s*<a href="([^"]*)">([\s\S]*?)<\/a>\s*<a href="([^"]*)">([\s\S]*?)<\/a>\s*<\/div>\s*<p>([\s\S]*?)<\/p>\s*<\/footer>/);
    if (!foot) fail('site-footer 틀을 읽지 못했다');
    out = out.replace(foot[0], () => `<footer class="site-footer">
    <div class="footer-inner container">
      <p class="footer-links"><a href="${foot[1]}">${foot[2]}</a><a href="${foot[3]}">${foot[4]}</a></p>
      <p class="footer-line">${foot[5]}</p>
    </div>
  </footer>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace('<div class="header-inner">', '<div class="header-inner container">');
    return ctx.finish(out);
  },
};
