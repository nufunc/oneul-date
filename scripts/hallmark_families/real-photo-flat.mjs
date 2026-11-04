// 계열: 평면 글(main.article-wrap 아래 h2·p·real-photo-card·guide-box·tip-box가 한 줄로 이어지고 동선은 div.timeline-card).
// 대표: andong, asan, boeun. 페이지 틀이 다르므로 본문만이 아니라 머리·푸터까지 이 모듈이 읽는다(matchPage, convertPage).
// h2로 구획을 나눠 동선, 장소, 경비표, 지도 목록으로 분류하고, 모르는 요소가 있으면 실패한다.
import spotInfoStep from './spot-info-step.mjs';
import { fail, stripLead, tagText, costOf, appBoxOf } from '../hallmark_common.mjs';

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);

// 조각의 최상위 자식을 순서대로 뽑는다: [{ tag, cls, text }]. 주석은 버린다.
export function children(html) {
  const out = [];
  const re = /<(\/?)(\w+)([^>]*?)(\/?)>/g;
  let depth = 0, start = 0, cur = null, last = 0;
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (let m; (m = re.exec(html)); ) {
    const [all, close, tag, attrs, self] = m;
    const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
    if (depth === 0 && !close) {
      const gap = html.slice(last, m.index).trim();
      if (gap) fail(`최상위에 글자가 있다: ${gap.slice(0, 60)}`);
    }
    if (VOID.has(tag) || self) { if (depth === 0) { out.push({ tag, cls, text: all }); last = re.lastIndex; } continue; }
    if (!close) { if (depth === 0) { start = m.index; cur = { tag, cls }; } depth++; }
    else { depth--; if (depth === 0) { out.push({ ...cur, text: html.slice(start, re.lastIndex) }); last = re.lastIndex; } }
  }
  if (html.slice(last).trim()) fail(`최상위에 글자가 있다: ${html.slice(last).trim().slice(0, 60)}`);
  return out;
}

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);

function figureOf(el, cls) {
  const img = el.text.match(/<img\b[^>]*\/?>/)?.[0] ?? fail('사진 칸에 img가 없다');
  const cap = el.text.match(/<div class="(?:photo|hero)-caption">([\s\S]*?)<\/div>/)?.[1];
  const rest = el.text.replace(img, '').replace(/<div class="(?:photo|hero)-caption">[\s\S]*?<\/div>/, '').replace(/^<div[^>]*>|<\/div>$/g, '');
  if (rest.trim()) fail(`real-photo-card에 모르는 요소가 있다: ${rest.trim().slice(0, 60)}`);
  return `<figure class="${cls}">
              ${img.replace(/\s*\/?>$/, ' />')}${cap ? `\n              <figcaption>${cap.trim()}</figcaption>` : ''}
            </figure>`;
}

// 동선: 옛 틀(tl-step 안의 span 셋)을 첫째 계열이 읽는 틀로 맞춰 그 모듈에 맡긴다.
function timelineOf(title, before, card, after) {
  const h3 = card.text.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1];
  const ttl = h3 ?? title ?? '';
  const body = innerOf(card).replace(/<h3\b[^>]*>[\s\S]*?<\/h3>/, '')
    .replace(/<div class="tl-step">\s*<span class="tl-time">([\s\S]*?)<\/span>\s*<span class="tl-place">([\s\S]*?)<\/span>\s*(?:<span class="tl-note">([\s\S]*?)<\/span>\s*)?<\/div>/g,
      (a, t, p, n) => `<div class="tl-step"><span class="tl-time">${t}</span><div><span class="tl-place">${p}</span>${n !== undefined ? `<span class="tl-note">${n}</span>` : ''}</div></div>`)
    .replace(/>\s+</g, '><');
  const sec = `<section class="timeline-card"><h3 class="timeline-title">${ttl}</h3>${body}</section>`;
  let out = spotInfoStep.timeline(sec);
  if (!ttl) out = out.replace(/\s*<h2 class="timeline-title"><\/h2>/, '');
  const lead = (ps) => ps.map((p) => `<p class="tl-lead">${innerOf(p)}</p>`).join('\n          ');
  if (before.length) out = out.replace('<div class="route"', () => `${lead(before)}\n          <div class="route"`);
  if (after.length) out = out.replace(/(\s*<\/div>\s*<\/section>)$/, (m) => `\n          ${lead(after)}${m}`);
  return out;
}

function spotOf(g, n) {
  const photos = [];
  const body = [];
  for (const el of g.items) {
    if (el.tag === 'p') body.push(el.text);
    else if (has(el, 'real-photo-card')) photos.push(el);
    else if (has(el, 'guide-box')) body.push(el.text.replace(/<h4>([\s\S]*?)<\/h4>/, (a, t) => `<h4>${stripLead(t)}</h4>`));
    else if (has(el, 'tip-box')) {
      const inside = innerOf(el);
      const t = inside.match(/^<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/);
      body.push(t ? `<div class="tip-box"><strong class="tip-title">${stripLead(t[1])}</strong>${t[2].trim()}</div>` : `<div class="tip-box">${stripLead(inside)}</div>`);
    } else if (has(el, 'map-btn-wrap')) {
      // 링크가 여럿이면 원문처럼 &nbsp;로 잇는다(글자 보존)
      const raw = innerOf(el);
      const links = [...raw.matchAll(/<a ([^>]*?)\s*class="map-btn"([^>]*)>\s*([\s\S]*?)\s*<\/a>/g)];
      if (!links.length || raw.replace(/<a [\s\S]*?<\/a>/g, '').replace(/&nbsp;/g, '').trim()) fail('map-btn-wrap 틀을 읽지 못했다');
      const sep = /&nbsp;/.test(raw) ? '&nbsp;' : '';
      body.push(`<div class="map-btn-wrap">${links.map((m) => `<a ${(m[1] + m[2]).trim()} class="btn-naver-map link-quiet">${stripLead(m[3])}</a>`).join(sep)}</div>`);
    } else if (has(el, 'bridge-box')) body.push(`<p class="bridge">${innerOf(el)}</p>`);
    else if (el.tag === 'div' && !el.cls) body.push(`<div class="order-box">${innerOf(el).replace(/ style="[^"]*"/g, '')}</div>`);
    else fail(`장소 구획에 모르는 요소가 있다: ${el.tag}.${el.cls} (${tagText(g.h2 ?? '').slice(0, 30)})`);
  }
  const flip = n % 2 === 0 && photos.length > 0;
  const cls = ['spot-section', 'flat', flip ? 'flip' : '', photos.length ? '' : 'no-photo'].filter(Boolean).join(' ');
  const main = photos.length ? `\n            ${figureOf(photos[0], 'spot-photo spot-image-wrap')}` : '';
  const extra = photos.slice(1).map((p) => figureOf(p, 'body-photo'));
  return `<section class="${cls}">
            <div class="spot-head">
              <h2 class="spot-title">${stripLead(g.h2)}</h2>
            </div>${main}
            <div class="spot-body">
              ${[...body, ...extra].join('\n              ')}
            </div>
          </section>`;
}

function costSection(g) {
  const wrapEl = g.items.find((e) => has(e, 'table-wrap'));
  let table = wrapEl.text.match(/<table\b[^>]*>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  const cols = (table.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g) ?? []).length;
  table = table.replace(/<table\b[^>]*>/, `<table class="cost-table${cols === 3 ? ' cost-3' : ''}">`)
    .replace(/<tr style="[^"]*font-weight:\s*700[^"]*">/, '<tr class="cost-total-row">')
    .replace(/<td([^>]*?) style="[^"]*"/g, '<td$1')
    // 합계 행이 th 두 칸(colspan)인 글: 새 틀의 합계 행은 td다
    .replace(/<tr>\s*(<th colspan="\d+"[^>]*>[\s\S]*?<\/th>\s*<th colspan="\d+"[^>]*>[\s\S]*?<\/th>)\s*<\/tr>/, (all, cells) => `<tr class="cost-total-row">${cells.replace(/<th( colspan="\d+")[^>]*>/g, '<td$1>').replace(/<\/th>/g, '</td>')}</tr>`);
  const ps = g.items.filter((e) => e.tag === 'p');
  const other = g.items.filter((e) => e !== wrapEl && e.tag !== 'p');
  if (other.length) fail(`경비표 구획에 모르는 요소가 있다: ${other[0].tag}.${other[0].cls}`);
  const sec = `<section class="cost-table-card"><h3 class="timeline-title">${g.h2}</h3>${ps.map((p) => p.text).join('')}<div class="table-wrap">${table}</div></section>`;
  return costOf(sec);
}

// 앱 소개 배너: h3, p, 링크(app-cta-btn)를 cta-card로 옮긴다. 끝의 ↗는 지운다.
function ctaOf(el) {
  const m = innerOf(el).match(/^<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a (href="[^"]*") class="app-cta-btn">([\s\S]*?)<\/a>$/);
  if (!m) fail('app-cta-banner 틀을 읽지 못했다');
  return `<div class="cta-card">
          <h3>${m[1]}</h3>
          <p>${m[2]}</p>
          <a ${m[3]} class="link-quiet">${m[4].replace(/\s*↗\s*$/, '').trim()}</a>
        </div>`;
}

function mapSection(g) {
  const items = g.items.map((e) => {
    if (e.tag === 'p') return e.text;
    if (e.tag === 'ul') return e.text.replace('<ul>', '<ul class="map-list">');
    if (has(e, 'map-links-grid')) return e.text;
    return fail(`지도 목록 구획에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  });
  return `<section class="map-links">
          <h2 class="timeline-title">${stripLead(g.h2)}</h2>
          ${items.join('\n          ')}
        </section>`;
}

function closingSection(g) {
  const ps = g.items.map((e) => (e.tag === 'p' ? e.text : fail(`맺음 구획에 모르는 요소가 있다: ${e.tag}.${e.cls}`)));
  return `<section class="map-links">
          <h2 class="timeline-title">${stripLead(g.h2)}</h2>
          ${ps.join('\n          ')}
        </section>`;
}

export default {
  name: 'real-photo-flat',
  matchPage: (html) => /<main class="article-wrap">/.test(html) && /<div class="timeline-card">/.test(html) && /class="real-photo-card"/.test(html),
  // ctx: { css, finish(out) }  finish는 제목 글꼴 링크를 더한다
  convertPage(html, ctx) {
    const main = html.match(/<main class="article-wrap">([\s\S]*?)<\/main>/) ?? fail('<main class="article-wrap">를 찾지 못했다');
    const ch = children(main[1]);

    // 머리: 배지, h1, 메타, 도입, 대표 사진(첫 h2 앞의 real-photo-card)
    // 머리 변형: header.article-header(div.badge-wrap의 span.badge, h1.article-title, div.article-meta) + div.hero-img-wrap + 첫 h2 앞의 평문 <p>(도입). 대표 사진이 도입보다 앞이다.
    const hdr = ch.find((e) => e.tag === 'header' && has(e, 'article-header'));
    let badge, h1, subMeta, lead, kickerSpans, metaSpans, heroFirst = false;
    if (hdr) {
      const hh = hdr.text;
      kickerSpans = [...(hh.match(/<div class="badge-wrap">([\s\S]*?)<\/div>/) ?? fail('badge-wrap을 찾지 못했다'))[1].matchAll(/<span class="badge">([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
      const h1m = hh.match(/<h1 class="article-title">([\s\S]*?)<\/h1>/) ?? fail('h1.article-title을 찾지 못했다');
      const metaText = hh.match(/<div class="article-meta">([\s\S]*?)<\/div>/)?.[1] ?? fail('article-meta를 찾지 못했다');
      if (hh.replace(/<div class="badge-wrap">[\s\S]*?<\/div>|<h1 class="article-title">[\s\S]*?<\/h1>|<div class="article-meta">[\s\S]*?<\/div>|<\/?header[^>]*>/g, '').trim()) fail('머리에 모르는 요소가 있다');
      if (/<(div|p|ul|ol|table|h[1-6])\b/.test(metaText) || !metaText.trim()) fail('article-meta 틀을 읽지 못했다');
      h1 = { text: h1m[0] };
      metaSpans = [metaText.trim()];
      const firstH2 = ch.findIndex((e) => e.tag === 'h2');
      lead = ch.find((e, i) => e.tag === 'p' && i < firstH2) ?? fail('첫 h2 앞의 도입 <p>를 찾지 못했다');
      heroFirst = true;
      badge = hdr; subMeta = hdr;
    } else {
      badge = ch.find((e) => has(e, 'post-badge')) ?? fail('post-badge를 찾지 못했다');
      h1 = ch.find((e) => e.tag === 'h1') ?? fail('h1을 찾지 못했다');
      subMeta = ch.find((e) => has(e, 'post-sub-meta')) ?? fail('post-sub-meta를 찾지 못했다');
      lead = ch.find((e) => has(e, 'lead-box')) ?? fail('lead-box를 찾지 못했다');
    }
    const used = new Set([badge, h1, subMeta, lead]);
    const leadPhotos = [];
    const tail = []; // 앱 코스 상자, 출처
    const ctas = []; // 앱 소개 배너(app-cta-banner)
    const groups = [];
    let g = null;
    let seenH2 = false;
    for (const e of ch) {
      if (used.has(e)) continue;
      if (e.tag === 'h2') { seenH2 = true; g = { h2: innerOf(e), items: [] }; groups.push(g); continue; }
      if (has(e, 'app-course-box') || has(e, 'footer-source') || e.tag === 'footer') { tail.push(e); continue; }
      if (has(e, 'app-cta-banner')) { ctas.push(e); continue; }
      if (!seenH2 && (has(e, 'real-photo-card') || has(e, 'hero-img-wrap')) && !g) { leadPhotos.push(e); continue; }
      if (!g) { g = { h2: null, items: [] }; groups.push(g); }
      g.items.push(e);
    }
    const spans = metaSpans ?? [...subMeta.text.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter((s) => s !== '•');
    if (!spans.length) fail('post-sub-meta에 span이 없다');
    if (!metaSpans && innerOf(subMeta).replace(/<span>[\s\S]*?<\/span>/g, '').replace(/•/g, '').trim()) fail('post-sub-meta에 모르는 요소가 있다');
    const metaHtml = spans.map((s) => (tagText(s).length <= 20 ? `<span>${s}</span>` : `<span class="meta-credit">${s}</span>`)).join('\n            ');
    const href = main[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const btn = href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : '';
    const hero = `<header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category">${(kickerSpans ?? badge.text.replace(/<[^>]*>/g, '').split(' · ')).map((s) => `<span>${s.trim()}</span>`).join('')}</p>
          <h1 class="article-title">${innerOf(h1)}</h1>
          <div class="article-meta">
            ${metaHtml}
          </div>${btn}
        </div>
      </header>`;

    // 구획 분류: 동선, 경비표, 지도 목록, 나머지는 장소
    const tlG = groups.filter((x) => x.items.some((e) => has(e, 'timeline-card')));
    if (tlG.length !== 1) fail(`동선 구획이 ${tlG.length}개다(1개여야 한다)`);
    const costG = groups.filter((x) => x.items.some((e) => has(e, 'table-wrap')));
    if (costG.length !== 1) fail(`경비표 구획이 ${costG.length}개다(1개여야 한다)`);
    const isMap = (x) => x !== tlG[0] && x !== costG[0] && x.items.some((e) => e.tag === 'ul' || has(e, 'map-links-grid')) && x.items.every((e) => e.tag === 'p' || e.tag === 'ul' || has(e, 'map-links-grid'));
    // 경비표 앞의 나머지는 장소, 뒤의 지도 목록과 나머지는 원래 순서대로 맺음 구획
    const costAt = groups.indexOf(costG[0]);
    const spotG = groups.filter((x, i) => i < costAt && x !== tlG[0] && !isMap(x));
    const postG = groups.filter((x, i) => i > costAt);
    if ([...spotG, ...postG].some((x) => x.h2 === null)) fail('h2 없는 구획이 있다');

    const t = tlG[0];
    const ci = t.items.findIndex((e) => has(e, 'timeline-card'));
    const timeline = timelineOf(t.h2, t.items.slice(0, ci), t.items[ci], t.items.slice(ci + 1));
    const apps = tail.filter((e) => has(e, 'app-course-box'));
    const credits = tail.filter((e) => !has(e, 'app-course-box'));
    if (apps.length > 1) fail('app-course-box가 둘 이상이다');
    if (credits.length !== 1) fail(`출처 footer가 ${credits.length}개다(1개여야 한다)`);
    const cr = credits[0];
    const credit = cr.tag === 'footer' ? innerOf(cr) : `<p>${innerOf(cr)}</p>`;

    // 도입: lead-box 안의 br은 문단 나눔이므로 그대로 둔다
    const lp = leadPhotos.map((p) => figureOf(p, 'lead-photo')).join('\n        ');
    const spotHtml = spotG.map((x, i) => spotOf(x, i + 1)).join('\n\n          ');
    const introHtml = `<div class="prose-intro">${innerOf(lead)}</div>`;
    const inner = `
      ${hero}

      <div class="container">
        ${heroFirst ? `${lp}\n        ${introHtml}` : `${introHtml}${lp ? `\n        ${lp}` : ''}`}
      </div>

      <!-- 동선 -->
      ${timeline}

      <div class="container">
        <div class="spots">
          ${spotHtml}
        </div>

        <!-- 2인 예상 입장료 -->
        ${costSection(costG[0])}
${postG.map((x) => `\n        ${isMap(x) ? mapSection(x) : closingSection(x)}\n`).join('')}${ctas.map((c) => `\n        ${ctaOf(c)}\n`).join('')}${apps.length ? `\n        ${appBoxOf(apps[0].text)}\n` : ''}
        <footer class="article-credit">
          ${credit}
        </footer>
      </div>
    `;

    let out = html.replace(main[0], () => `<main class="article-container"><article>${inner}</article></main>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace(/<header class="travel-header-bar">[\s\S]*?<\/header>|<header class="top-nav">[\s\S]*?<\/header>|<header class="site-header">[\s\S]*?<\/header>/, () => `<header class="site-header">
    <div class="header-inner container">
      <a href="https://nufunc.github.io/oneul-date/blog/" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav">
        <a href="https://nufunc.github.io/oneul-date/">홈으로</a>
        <a href="https://nufunc.github.io/oneul-date/blog/">전체 코스</a>
      </nav>
    </div>
  </header>`);
    out = out.replace('</main>', () => `</main>

  <footer class="site-footer">
    <div class="footer-inner container">
      <p class="footer-mark"><strong>오늘 데이트 (Oneul Date)</strong></p>
      <p class="footer-line">전국 데이트 & 여행 코스 큐레이션 매거진</p>
      <p class="footer-links"><a href="https://nufunc.github.io/oneul-date/">홈으로 가기</a><a href="https://nufunc.github.io/oneul-date/blog/">매거진 전체보기</a></p>
    </div>
  </footer>`);
    return ctx.finish(out);
  },
};
