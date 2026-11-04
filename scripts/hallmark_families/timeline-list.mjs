// 계열: 동선이 ul.timeline-list인 글(한남·이태원, 목포, 남해). 장소마다 <article class="spot-section">이고 main 바로 아래 평평하게 이어져 페이지 전체를 이 모듈이 읽는다.
// 구성: header.article-header(span.badge, h1, div.meta-bar, p.lead-text), section.timeline-card(timeline-item), 장소 구획(spot-card: 사진, spot-num, spot-chips 지도 칩, spot-desc, tip-box),
// h2.spot-name(경비) + div.table-wrap(sum-row), div.app-course-box, footer.article-footer(author-card). 사이트 푸터는 없다.
// 원본의 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견준다).
import { fail, stripLead, appBoxOf, costOf } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');

function timelineOf(el) {
  const raw = innerOf(el);
  const title = raw.match(/^<div class="timeline-title">([\s\S]*?)<\/div>/)?.[1] ?? fail('timeline-title을 찾지 못했다');
  const list = raw.match(/<ul class="timeline-list">([\s\S]*)<\/ul>\s*$/)?.[1] ?? fail('timeline-list를 찾지 못했다');
  const itemRe = /<li class="timeline-item">\s*<span class="timeline-time">([\s\S]*?)<\/span>\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/g;
  const items = [...list.matchAll(itemRe)];
  if (!items.length || list.replace(itemRe, '').trim() || raw.replace(/^<div class="timeline-title">[\s\S]*?<\/div>/, '').replace(/<ul class="timeline-list">[\s\S]*<\/ul>\s*$/, '').trim()) fail('동선(timeline-card)에 모르는 요소가 있다');
  const steps = items.map((m, i) => `<div class="tl-step" style="--r:2; --c:${i + 1}"><span class="tl-time">${m[1].trim()}</span><span class="tl-place">${m[2].trim()}</span><span class="tl-note">${m[3].trim()}</span></div>`);
  // 제목이 div라 헤딩 수를 지키려고 p로 둔다
  return `<section class="timeline-card band">
        <div class="container">
          <p class="timeline-title">${stripLead(title.replace(/<span>[\s\S]*?<\/span>/, ''))}</p>
          <div class="route range" style="--n:${items.length}">
            ${steps.join('\n            ')}
          </div>
        </div>
      </section>`;
}

function spotOf(el, n) {
  const m = el.text.match(/^<article class="spot-section">\s*<div class="spot-card">([\s\S]*)<\/div>\s*<\/article>$/);
  if (!m) fail(`스팟 ${n}: spot-card 틀을 읽지 못했다`);
  let rest = m[1];
  const photo = rest.match(/^\s*<div class="spot-image-wrap">\s*(<img\b[^>]*>)\s*<div class="spot-image-caption">([\s\S]*?)<\/div>\s*<\/div>/);
  if (photo) rest = rest.slice(photo[0].length);
  const body = rest.match(/^\s*<div class="spot-body">([\s\S]*)<\/div>\s*$/)?.[1] ?? fail(`스팟 ${n}: spot-body를 찾지 못했다`);
  const head = body.match(/^\s*<div class="spot-header-row">\s*<div>\s*(<span class="spot-num">[\s\S]*?<\/span>)\s*<h2 class="spot-name">([\s\S]*?)<\/h2>\s*<\/div>\s*<\/div>/);
  if (!head) fail(`스팟 ${n}: spot-header-row 틀을 읽지 못했다`);
  let tail = body.slice(head[0].length);
  const parts = [];
  const kinds = [
    [/^\s*<div class="spot-chips">([\s\S]*?)<\/div>/, (x) => {
      const links = [...x[1].matchAll(/<a (href="[^"]*") class="spot-chip(?: map-link)?"( target="[^"]*")?( rel="[^"]*")?>\s*([\s\S]*?)\s*<\/a>/g)];
      if (!links.length || x[1].replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail(`스팟 ${n}: spot-chips에 모르는 요소가 있다`);
      return `<div class="map-btn-wrap spot-actions">${links.map((l) => `<a ${l[1]}${l[2] ?? ''}${l[3] ?? ''} class="btn-naver-map link-quiet">${stripLead(l[4])}</a>`).join('')}</div>`;
    }],
    [/^\s*<p class="spot-desc"[^>]*>[\s\S]*?<\/p>/, (x) => noStyle(x[0]).trim()],
    [/^\s*<div class="tip-box">\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/div>/, (x) => `<div class="tip-box"><strong class="tip-title">${stripLead(x[1])}</strong>${x[2].trim()}</div>`],
  ];
  for (let hit = true; hit; ) {
    hit = false;
    for (const [re, f] of kinds) {
      const x = tail.match(re);
      if (x) { parts.push(f(x)); tail = tail.slice(x[0].length); hit = true; break; }
    }
  }
  if (tail.replace(/<!--[\s\S]*?-->/g, '').trim()) fail(`스팟 ${n}: 모르는 요소가 있다: ${tail.trim().slice(0, 100)}`);
  const cls = ['spot-section', n % 2 === 0 && photo ? 'flip' : '', photo ? '' : 'no-photo'].filter(Boolean).join(' ');
  // 원본은 사진과 설명이 제목보다 앞이라 글 순서를 지키려고 figure를 먼저 둔다(칸 위치는 grid-area가 정한다)
  const fig = photo ? `\n            <figure class="spot-photo spot-image-wrap">
              ${photo[1].replace(/\s*\/?>$/, ' />')}
              <figcaption>${photo[2].trim()}</figcaption>
            </figure>` : '';
  return `<section class="${cls}">${fig}
            <div class="spot-head">
              <div class="spot-header">${head[1]}<h2 class="spot-title">${head[2]}</h2></div>
            </div>
            <div class="spot-body">
              ${parts.join('\n              ')}
            </div>
          </section>`;
}

function costSection(title, wrap) {
  const t = wrap.text.match(/<table>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  const table = t.replace('<table>', '<table class="cost-table">').replace('<tr class="sum-row">', '<tr class="cost-total-row">');
  if (table.includes('sum-row')) fail('경비표에 모르는 합계 행이 있다');
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${title}</h3><div class="table-wrap">${table}</div></section>`).replace('<h2 class="timeline-title">', '<h2 class="timeline-title long">');
}

// author-card의 아바타(글자 "오늘")는 장식이라 화면에서 숨기고 글은 남긴다.
function creditOf(el) {
  const m = innerOf(el).match(/^<div class="author-card">\s*<div class="author-avatar">([\s\S]*?)<\/div>\s*<div class="author-info">\s*<strong>([\s\S]*?)<\/strong>\s*<span>([\s\S]*?)<\/span>\s*<\/div>\s*<\/div>\s*((?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+)$/);
  if (!m) fail('article-footer 틀을 읽지 못했다');
  return `<footer class="article-credit">
          <p class="credit-author"><span class="credit-mark" aria-hidden="true">${m[1].trim()}</span><strong>${m[2].trim()}</strong> <span>${m[3].trim()}</span></p>
          ${noStyle(m[4]).trim().replace(/<\/p>\s*<p/g, '</p>\n          <p')}
        </footer>`;
}

export default {
  name: 'timeline-list',
  match: () => false,
  matchPage: (html) => /<ul class="timeline-list">/.test(html) && /<article class="spot-section">/.test(html) && /<div class="spot-card">/.test(html),
  convertPage(html, ctx) {
    const wrap = html.match(/<main class="article-container">([\s\S]*?)<\/main>/) ?? fail('<main class="article-container">를 찾지 못했다');
    const ch = children(wrap[1]);
    const one = (f, what) => { const r = ch.filter(f); if (r.length !== 1) fail(`${what}가 ${r.length}개다(1개여야 한다)`); return r[0]; };
    const hdr = one((e) => has(e, 'article-header'), 'article-header');
    const tl = one((e) => has(e, 'timeline-card'), 'timeline-card');
    const spots = ch.filter((e) => e.tag === 'article' && has(e, 'spot-section'));
    const costH = one((e) => e.tag === 'h2' && has(e, 'spot-name'), '경비 제목(h2.spot-name)');
    const costW = one((e) => has(e, 'table-wrap'), 'table-wrap');
    const app = ch.filter((e) => has(e, 'app-course-box'));
    const credit = one((e) => e.tag === 'footer' && has(e, 'article-footer'), 'article-footer');
    if (!spots.length) fail('spot-section이 없다');
    if (app.length > 1) fail('app-course-box가 둘 이상이다');
    // 글 순서: 머리, 동선, 장소들, 경비 제목, 경비표, 앱 코스 상자, 출처
    const order = ch.map((e) => `${e.tag}.${e.cls.split(' ')[0]}`).join(' ');
    const want = ['header.article-header', 'section.timeline-card', ...spots.map(() => 'article.spot-section'), 'h2.spot-name', 'div.table-wrap', ...app.map(() => 'div.app-course-box'), 'footer.article-footer'].join(' ');
    if (order !== want) fail(`main 아래 순서가 다르다: ${order}`);

    const kicker = hdr.text.match(/<span class="badge">([\s\S]*?)<\/span>/)?.[1] ?? fail('badge를 찾지 못했다');
    const h1 = hdr.text.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? fail('h1을 찾지 못했다');
    const meta = hdr.text.match(/<div class="meta-bar">([\s\S]*?)<\/div>/)?.[1] ?? fail('meta-bar를 찾지 못했다');
    const lead = hdr.text.match(/<p class="lead-text">([\s\S]*?)<\/p>/)?.[1] ?? fail('lead-text를 찾지 못했다');
    if (/<(div|p|ul|ol|table|h[1-6])\b/.test(lead)) fail('도입 문단 안에 블록 요소가 있다');
    if (hdr.text.replace(/<span class="badge">[\s\S]*?<\/span>|<h1>[\s\S]*?<\/h1>|<div class="meta-bar">[\s\S]*?<\/div>|<p class="lead-text">[\s\S]*?<\/p>|<\/?header[^>]*>/g, '').trim()) fail('머리에 모르는 요소가 있다');
    const spans = [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
    if (!spans.length || meta.replace(/<span>[\s\S]*?<\/span>/g, '').trim()) fail('meta-bar 틀을 읽지 못했다');
    const metaHtml = spans.map((s) => (/^글/.test(s) ? `<span class="meta-credit">${s}</span>` : `<span>${s}</span>`)).join('\n            ');
    const href = wrap[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];

    const body = `
      <header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category">${kicker.split(' · ').map((s) => `<span>${s.trim()}</span>`).join('')}</p>
          <h1 class="article-title">${h1}</h1>
          <div class="article-meta">
            ${metaHtml}
          </div>${href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : ''}
        </div>
      </header>

      <div class="container">
        <p class="prose-intro">${lead.trim()}</p>
      </div>

      <!-- 동선 -->
      ${timelineOf(tl)}

      <div class="container">
        <div class="spots">
          ${spots.map((s, i) => spotOf(s, i + 1)).join('\n\n          ')}
        </div>

        <!-- 2인 예상 입장료 -->
        ${costSection(stripLead(innerOf(costH)), costW)}
${app.length ? `
        ${appBoxOf(app[0].text)}
` : ''}
        ${creditOf(credit)}
      </div>
    `;
    let out = html.replace(wrap[0], () => `<main class="article-container">\n    <article>${body}</article>\n  </main>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace('<div class="header-inner">', '<div class="header-inner container">');
    return ctx.finish(out);
  },
};
