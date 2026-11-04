// 계열: 평면 글 중 정보가 info-grid(주소·관람시간·입장료·주차안내)인 글(고창, 제주 동부·서부 2박 3일, 양평, 영월, 파주 등).
// main.article-container(또는 article.article-container) 아래 h2·p·real-photo-card·info-grid·tip-box·map-btn-wrap이 한 줄로 이어진다.
// 머리가 둘로 갈린다: div.post-badge+post-meta+course-summary-card(tl-act·tl-step·tl-move) / header.article-header+summary-card(route-step-item).
// 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견주고, 사진 설명을 따로 빼지 않는다).
import spotInfoStep from './spot-info-step.mjs';
import { children } from './real-photo-flat.mjs';
import { fail, stripLead, tagText, costOf, appBoxOf } from '../hallmark_common.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');
const squeeze = (s) => s.replace(/>\s+</g, '><').trim();

// 동선 A: tl-act, tl-step(span 셋), tl-move가 평평하게 이어지는 요약 상자
function routeA(card) {
  const raw = innerOf(card);
  const title = raw.match(/<div class="summary-card-title">([\s\S]*?)<\/div>/)?.[1] ?? fail('summary-card-title을 찾지 못했다');
  const body = squeeze(raw.replace(/<div class="summary-card-title">[\s\S]*?<\/div>/, ''))
    .replace(/<div class="tl-step"><span class="tl-time">([\s\S]*?)<\/span><span class="tl-place">([\s\S]*?)<\/span>(?:<span class="tl-note">([\s\S]*?)<\/span>)?<\/div>/g,
      (a, t, p, n) => `<div class="tl-step"><span class="tl-time">${t}</span><div><span class="tl-place">${p}</span>${n !== undefined ? `<span class="tl-note">${n}</span>` : ''}</div></div>`)
    .replace(/<div class="(tl-act|tl-move)">\s*([\s\S]*?)\s*<\/div>/g, '<div class="$1">$2</div>');
  return { title: tagText(title).trim(), body, badges: false };
}

// 동선 B: route-step-item(번호, 이름·시각, 설명). 번호는 tl-badge로, 시각이 앞에 있으면 tl-time으로 둔다.
function routeB(card) {
  const raw = innerOf(card);
  const title = raw.match(/<div class="summary-title">([\s\S]*?)<\/div>/)?.[1] ?? fail('summary-title을 찾지 못했다');
  const items = [...raw.matchAll(/<div class="route-step-item">\s*<div class="step-num">(\d+)<\/div>\s*<div>\s*<div class="step-text">([\s\S]*?)<\/div>\s*<div class="step-note">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)];
  if (!items.length) fail('route-step-item을 읽지 못했다');
  // 끝의 거리 요약 줄은 동선 아래 합계 줄(tl-total)로 둔다
  const dist = raw.match(/<div class="route-distance-summary">([\s\S]*?)<\/div>/)?.[1];
  const rest = raw.replace(/<div class="route-distance-summary">[\s\S]*?<\/div>/, '').replace(/<div class="summary-title">[\s\S]*?<\/div>/, '').replace(/<div class="route-steps">|<\/div>\s*$/g, '').replace(/<div class="route-step-item">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, '');
  if (rest.trim()) fail(`route-steps에 모르는 요소가 있다: ${rest.trim().slice(0, 80)}`);
  const steps = items.map((m) => {
    const note = m[3].trim();
    const a = m[2].trim().match(/^<strong>\s*(\d{1,2}:\d{2}(?:\s*~\s*\d{1,2}:\d{2})?)\s*·\s*([\s\S]*?)<\/strong>$/);
    if (a) return `<div class="tl-step"><span class="tl-time">${a[1]}</span><div><span class="tl-place">${a[2].trim()}</span><span class="tl-note">${note}</span></div></div>`;
    const b = m[2].trim().match(/^<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/);
    if (!b) fail(`route-step-item ${m[1]}: step-text를 읽지 못했다`);
    const meta = b[2].trim() ? `<em class="tl-meta">${b[2].trim()}</em>` : '';
    return `<div class="tl-step"><span class="tl-time"></span><div><span class="tl-place">${b[1].trim()}</span><span class="tl-note">${meta}${note}</span></div></div>`;
  });
  return { title: tagText(title).trim(), body: steps.join('') + (dist ? `<div class="tl-move">${stripLead(dist).replace(/\s+/g, ' ')}</div>` : ''), nums: items.map((m) => m[1]) };
}

function timelineOf(card, kind) {
  const r = kind === 'A' ? routeA(card) : routeB(card);
  const sec = `<section class="timeline-card"><h3 class="timeline-title">${r.title}</h3>${r.body}</section>`;
  let out = spotInfoStep.timeline(sec).replace(/<h2 class="timeline-title">([\s\S]*?)<\/h2>/, '<p class="timeline-title">$1</p>');
  if (r.nums) {
    let i = 0;
    out = out.replace(/(<div class="tl-step" style="[^"]*">)/g, (m) => `${m}<span class="tl-badge">${r.nums[i++]}</span>`);
  }
  return out.replace(/<span class="tl-time"><\/span>/g, '');
}

function figureOf(el) {
  const img = el.text.match(/<img\b[^>]*\/?>/)?.[0] ?? fail('real-photo-card에 img가 없다');
  const cap = el.text.match(/<div class="photo-caption">([\s\S]*?)<\/div>/)?.[1];
  const rest = el.text.replace(img, '').replace(/<div class="photo-caption">[\s\S]*?<\/div>/, '').replace(/^<div[^>]*>|<\/div>$/g, '');
  if (rest.trim()) fail(`real-photo-card에 모르는 요소가 있다: ${rest.trim().slice(0, 60)}`);
  return `<figure class="story-photo">
              ${img.replace(/\s*\/?>$/, ' />')}${cap ? `\n              <figcaption>${squeeze(cap)}</figcaption>` : ''}
            </figure>`;
}

function infoOf(el, h2) {
  const rows = [...el.text.matchAll(/<div class="info-item">\s*<span class="info-label">([\s\S]*?)<\/span>\s*<span class="info-val">([\s\S]*?)<\/span>\s*<\/div>/g)];
  const left = el.text.replace(/<div class="info-item">[\s\S]*?<\/div>/g, '').replace(/^<div class="info-grid">|<\/div>$/g, '').trim();
  if (!rows.length || left) fail(`info-grid에 모르는 요소가 있다(${tagText(h2).slice(0, 20)}): ${left.slice(0, 60)}`);
  return `<div class="spot-info-box info-wide">${rows.map((r) => `<div class="info-row"><span class="info-label">${r[1].trim()}</span><span class="info-val">${r[2].trim()}</span></div>`).join('')}</div>`;
}

function tipOf(el) {
  const t = innerOf(el).match(/^<div class="tip-title">([\s\S]*?)<\/div>\s*([\s\S]*)$/);
  return t ? `<div class="tip-box"><strong class="tip-title">${stripLead(t[1])}</strong>${t[2].trim()}</div>` : `<div class="tip-box">${stripLead(innerOf(el))}</div>`;
}

function mapBtnOf(el) {
  const m = innerOf(el).match(/^<a ([^>]*?)\s*class="map-btn"([^>]*)>\s*([\s\S]*?)\s*<\/a>$/);
  if (!m) fail('map-btn-wrap 틀을 읽지 못했다');
  return `<div class="map-btn-wrap"><a ${(m[1] + m[2]).trim()} class="btn-naver-map link-quiet">${stripLead(m[3])}</a></div>`;
}

function spotOf(g, n) {
  const body = g.items.map((el) => {
    if (el.tag === 'p') return noStyle(el.text);
    if (has(el, 'real-photo-card')) return figureOf(el);
    if (has(el, 'info-grid')) return infoOf(el, g.h2);
    if (has(el, 'tip-box')) return tipOf(el);
    if (has(el, 'map-btn-wrap')) return mapBtnOf(el);
    return fail(`장소 구획에 모르는 요소가 있다: ${el.tag}.${el.cls} (${tagText(g.h2).slice(0, 30)})`);
  });
  return `<section class="story-section">
            <h2 class="spot-title">${stripLead(g.h2)}</h2>
            <div class="story-body">
              ${body.join('\n              ')}
            </div>
          </section>`;
}

function costSection(g) {
  const wrapEl = g.items.find((e) => has(e, 'table-wrap'));
  let table = wrapEl.text.match(/<table\b[^>]*>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  const cols = (table.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g) ?? []).length;
  table = table.replace(/<table\b[^>]*>/, `<table class="cost-table${cols === 3 ? ' cost-3' : ''}">`)
    .replace(/<tr style="[^"]*font-weight:\s*700[^"]*">/, '<tr class="cost-total-row">')
    .replace(/<t([dh])([^>]*?) style="[^"]*"/g, '<t$1$2');
  const ps = g.items.filter((e) => e.tag === 'p');
  const other = g.items.filter((e) => e !== wrapEl && e.tag !== 'p');
  if (other.length) fail(`경비표 구획에 모르는 요소가 있다: ${other[0].tag}.${other[0].cls}`);
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${g.h2}</h3>${ps.map((p) => p.text).join('')}<div class="table-wrap">${table}</div></section>`);
}

function mapSection(g) {
  const items = g.items.map((e) => {
    if (e.tag === 'p') return noStyle(e.text);
    if (e.tag === 'ul') return e.text.replace(/<ul\b[^>]*>/, '<ul class="map-list">');
    return fail(`지도 목록 구획에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  });
  return `<section class="map-links">
          <h2 class="timeline-title">${stripLead(g.h2)}</h2>
          ${items.join('\n          ')}
        </section>`;
}

function ctaOf(el) {
  const raw = innerOf(el);
  const h3 = raw.match(/^<h3>([\s\S]*?)<\/h3>/);
  const t = h3 ?? raw.match(/^<div class="outro-title">([\s\S]*?)<\/div>/) ?? fail('outro-card 제목을 읽지 못했다');
  const rest = raw.slice(t[0].length).trim();
  if (!/^<p\b[^>]*>[\s\S]*<\/p>$/.test(rest) || (rest.match(/<p\b/g) ?? []).length !== 1) fail('outro-card 본문 틀을 읽지 못했다');
  const head = h3 ? `<h3>${stripLead(t[1])}</h3>` : `<p class="cta-title">${stripLead(t[1])}</p>`;
  return `<div class="cta-card">
          ${head}
          ${noStyle(rest)}
        </div>`;
}

export default {
  name: 'real-photo-grid',
  matchPage: (html) => /<(?:main|article) class="article-container">/.test(html) && /<div class="info-grid">/.test(html) && /class="real-photo-card"/.test(html)
    && (/class="course-summary-card"/.test(html) || (/<div class="summary-card">/.test(html) && /class="route-step-item"/.test(html))) && !/<main[^>]*>\s*<article>/.test(html),
  convertPage(html, ctx) {
    const wrap = html.match(/<(main|article) class="article-container">([\s\S]*?)<\/\1>/) ?? fail('article-container를 찾지 못했다');
    const tag = wrap[1];
    const ch = children(wrap[2]);

    // 머리: A(post-badge, h1, post-meta) 또는 B(header.article-header)
    let kicker, h1, spans;
    const used = new Set();
    const hdr = ch.find((e) => e.tag === 'header' && has(e, 'article-header'));
    if (hdr) {
      kicker = hdr.text.match(/<span class="badge">([\s\S]*?)<\/span>/)?.[1] ?? fail('badge를 찾지 못했다');
      h1 = hdr.text.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? fail('h1을 찾지 못했다');
      const meta = hdr.text.match(/<div class="meta-info">([\s\S]*?)<\/div>/)?.[1] ?? fail('meta-info를 찾지 못했다');
      spans = [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
      const left = hdr.text.replace(/<span class="badge">[\s\S]*?<\/span>|<h1>[\s\S]*?<\/h1>|<div class="meta-info">[\s\S]*?<\/div>|<\/?header[^>]*>/g, '').trim();
      if (left) fail(`머리에 모르는 요소가 있다: ${left.slice(0, 60)}`);
      used.add(hdr);
    } else {
      const badge = ch.find((e) => has(e, 'post-badge')) ?? fail('post-badge를 찾지 못했다');
      const h1e = ch.find((e) => e.tag === 'h1') ?? fail('h1을 찾지 못했다');
      const meta = ch.find((e) => has(e, 'post-meta')) ?? fail('post-meta를 찾지 못했다');
      kicker = innerOf(badge);
      h1 = innerOf(h1e);
      spans = [...meta.text.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter((s) => s !== '·' && s !== '•');
      if (innerOf(meta).replace(/<span>[\s\S]*?<\/span>/g, '').trim()) fail('post-meta에 모르는 요소가 있다');
      [badge, h1e, meta].forEach((e) => used.add(e));
    }
    if (!spans.length) fail('머리 메타에 span이 없다');
    const metaHtml = spans.map((s) => (tagText(s).length <= 20 ? `<span>${s}</span>` : `<span class="meta-credit">${s}</span>`)).join('\n            ');
    const href = wrap[2].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const btn = href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : '';
    const hero = `<header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category">${tagText(kicker).split(' · ').map((s) => `<span>${s.trim()}</span>`).join('')}</p>
          <h1 class="article-title">${h1}</h1>
          <div class="article-meta">
            ${metaHtml}
          </div>${btn}
        </div>
      </header>`;

    // 동선 요약 상자를 기준으로 앞은 도입, 뒤는 구획
    const si = ch.findIndex((e) => has(e, 'course-summary-card') || has(e, 'summary-card'));
    if (si < 0) fail('동선 요약 상자를 찾지 못했다');
    const kind = has(ch[si], 'course-summary-card') ? 'A' : 'B';
    const intro = ch.slice(0, si).filter((e) => !used.has(e));
    if (!intro.length || intro.some((e) => e.tag !== 'p')) fail('도입이 p가 아니다');
    const early = [];
    const groups = [];
    const tail = [];
    let g = null;
    for (const e of ch.slice(si + 1)) {
      if (e.tag === 'h2') { g = { h2: innerOf(e), items: [] }; groups.push(g); continue; }
      if (has(e, 'outro-card') || has(e, 'app-course-box') || e.tag === 'footer') { tail.push(e); continue; }
      if (!g) { if (has(e, 'app-link-card')) { early.push(e); continue; } fail(`동선 상자 다음에 모르는 요소가 있다: ${e.tag}.${e.cls}`); }
      g.items.push(e);
    }
    const costG = groups.filter((x) => x.items.some((e) => has(e, 'table-wrap')));
    if (costG.length !== 1) fail(`경비표 구획이 ${costG.length}개다(1개여야 한다)`);
    const isMap = (x) => x !== costG[0] && x.items.some((e) => e.tag === 'ul') && x.items.every((e) => e.tag === 'p' || e.tag === 'ul');
    let n = 0;
    // 장소 구획이 이어진 구간은 .spots로 묶고, 경비표와 지도 목록은 원래 순서대로 그 사이나 뒤에 둔다
    const parts = [];
    for (const x of groups) {
      if (x === costG[0]) parts.push(costSection(x));
      else if (isMap(x)) parts.push(mapSection(x));
      else {
        const s = spotOf(x, ++n);
        if (parts.at(-1)?.spots) parts.at(-1).spots.push(s);
        else parts.push({ spots: [s] });
      }
    }
    if (!n) fail('장소 구획이 없다');
    const secs = parts.map((x) => (x.spots ? `<div class="spots stories">\n          ${x.spots.join('\n\n          ')}\n        </div>` : x));
    const cta = tail.filter((e) => has(e, 'outro-card'));
    const apps = tail.filter((e) => has(e, 'app-course-box'));
    const credits = tail.filter((e) => e.tag === 'footer');
    if (cta.length > 1 || apps.length > 1 || credits.length > 1 || tail.length !== cta.length + apps.length + credits.length) fail('맺음 요소(outro-card, app-course-box, footer)가 맞지 않는다');

    const earlyHtml = early.map((e) => {
      const m = e.text.match(/^<div class="app-link-card">\s*<div class="app-link-title">([\s\S]*?)<\/div>\s*<div class="app-link-desc">([\s\S]*?)<\/div>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>$/);
      if (!m) fail('app-link-card 틀을 읽지 못했다');
      return `<div class="container">
        <div class="app-course-box early">
          <div>
            <p class="cta-title">${stripLead(m[1])}</p>
            <p>${m[2].trim()}</p>
          </div>
          <a class="btn app-action" href="${m[3]}">${m[4].trim()}</a>
        </div>
      </div>`;
    }).join('\n');

    const inner = `
      ${hero}

      <div class="container">
        <div class="prose-intro">${intro.map((p) => noStyle(p.text)).join('\n        ')}</div>
      </div>

      <!-- 동선 -->
      ${timelineOf(ch[si], kind)}
${earlyHtml ? `\n      ${earlyHtml}\n` : ''}
      <div class="container">
        ${secs.join('\n\n        ')}
${cta.length ? `\n        ${ctaOf(cta[0])}\n` : ''}${apps.length ? `\n        ${appBoxOf(apps[0].text)}\n` : ''}${credits.length ? `
        <footer class="article-credit">
          ${noStyle(innerOf(credits[0]))}
        </footer>
` : ''}      </div>
    `;
    let out = html.replace(wrap[0], () => `<${tag} class="article-container">${inner}</${tag}>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace('<div class="header-inner">', '<div class="header-inner container">');
    return ctx.finish(out);
  },
};
