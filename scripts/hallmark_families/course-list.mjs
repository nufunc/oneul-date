// 계열: main.article-wrap 아래 nav.toc-box와 section.course(real-photo-card 한 장, ol.spot-list)가 이어지는 모음 글(서울·경기 20선).
// 동선 띠와 경비표가 없는 목록형 글이라 장소 구획(spot-section) 틀을 코스 하나에 쓰고 장소는 목록(stop-list)으로 둔다.
// 페이지 틀이 다르므로 머리·푸터까지 이 모듈이 읽는다(matchPage, convertPage). 모르는 요소가 있으면 실패한다.
import { fail, stripLead, tagText, pageHeroOf, siteHeaderHtml, siteFooterHtml } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');

function figureOf(el) {
  const img = el.text.match(/<img\b[^>]*\/?>/)?.[0] ?? fail('real-photo-card에 img가 없다');
  const cap = el.text.match(/<div class="photo-caption">([\s\S]*?)<\/div>/)?.[1];
  const rest = el.text.replace(img, '').replace(/<div class="photo-caption">[\s\S]*?<\/div>/, '').replace(/^<div[^>]*>|<\/div>$/g, '');
  if (rest.trim()) fail(`real-photo-card에 모르는 요소가 있다: ${rest.trim().slice(0, 60)}`);
  return `<figure class="spot-photo spot-image-wrap">
              ${img.replace(/\s*\/?>$/, ' />')}${cap ? `\n              <figcaption>${cap.trim()}</figcaption>` : ''}
            </figure>`;
}

// 장소 한 곳: spot-head(strong 이름, span.spot-cat), spot-addr, p.spot-desc, spot-foot(span.spot-hop, a.spot-map)
function stopOf(li, where) {
  const m = li.text.match(/^<li class="spot-item">\s*<div class="spot-head"><strong>([\s\S]*?)<\/strong>\s*<span class="spot-cat">([\s\S]*?)<\/span><\/div>\s*<div class="spot-addr">([\s\S]*?)<\/div>\s*<p class="spot-desc">([\s\S]*?)<\/p>\s*<div class="spot-foot">(?:<span class="spot-hop">([\s\S]*?)<\/span>)?<a (href="[^"]*"[^>]*?)\s*class="spot-map">([\s\S]*?)<\/a><\/div>\s*<\/li>$/);
  if (!m) fail(`${where}: spot-item 틀을 읽지 못했다`);
  return `<li class="stop">
                <p class="stop-name"><strong>${m[1]}</strong><span class="stop-cat">${m[2]}</span></p>
                <p class="stop-addr">${m[3]}</p>
                <p class="stop-desc">${m[4]}</p>
                <p class="stop-foot">${m[5] ? `<span class="stop-hop">${m[5]}</span>` : ''}<a ${m[6]} class="link-quiet">${m[7].replace(/\s*↗\s*$/, '').trim()}</a></p>
              </li>`;
}

function courseOf(el, n) {
  const id = el.text.match(/^<section class="course" id="([^"]*)">/)?.[1] ?? fail(`코스 ${n}: id를 찾지 못했다`);
  const ch = children(innerOf(el));
  let i = 0;
  const next = (test, what) => { const e = ch[i]; if (!e || !test(e)) fail(`코스 ${n}: ${what}가 ${i}번째에 없다`); i++; return e; };
  const h2 = next((e) => e.tag === 'h2', 'h2');
  const mood = next((e) => e.tag === 'span' && has(e, 'course-mood'), 'course-mood');
  const desc = next((e) => e.tag === 'p', '설명 문단');
  const photo = next((e) => has(e, 'real-photo-card'), 'real-photo-card');
  const list = next((e) => e.tag === 'ol' && has(e, 'spot-list'), 'spot-list');
  const back = next((e) => e.tag === 'a' && has(e, 'back-toc'), 'back-toc');
  if (i !== ch.length) fail(`코스 ${n}: 모르는 요소가 있다: ${ch[i].tag}.${ch[i].cls}`);
  const items = children(innerOf(list));
  if (!items.length || items.some((x) => x.tag !== 'li')) fail(`코스 ${n}: spot-list에 li가 아닌 요소가 있다`);
  const flip = n % 2 === 0;
  return `<section class="spot-section flat course${flip ? ' flip' : ''}" id="${id}">
            <div class="spot-head">
              <h2 class="spot-title">${innerOf(h2)}</h2>
              <p class="course-mood">${innerOf(mood)}</p>
              <p class="spot-desc">${innerOf(desc)}</p>
            </div>
            ${figureOf(photo)}
            <div class="spot-body">
              <ol class="stop-list">
              ${items.map((x, k) => stopOf(x, `코스 ${n} ${k + 1}번째`)).join('\n              ')}
              </ol>
              ${noStyle(back.text).replace(' class="back-toc"', ' class="back-toc link-quiet"')}
            </div>
          </section>`;
}

function tocOf(el) {
  const ch = children(innerOf(el));
  const title = ch.find((e) => e.tag === 'strong') ?? fail('toc-box의 strong 제목을 찾지 못했다');
  const ol = ch.find((e) => e.tag === 'ol') ?? fail('toc-box의 ol을 찾지 못했다');
  if (ch.length !== 2) fail('toc-box에 모르는 요소가 있다');
  const lis = children(innerOf(ol)).map((li) => {
    const m = li.text.match(/^<li><a (href="#[^"]*")>([\s\S]*?)<\/a>\s*<span class="toc-mood">([\s\S]*?)<\/span><\/li>$/);
    if (li.tag !== 'li' || !m) fail('toc-box 목록 항목 틀을 읽지 못했다');
    return `<li><a ${m[1]}>${m[2]}</a><span class="toc-mood">${m[3]}</span></li>`;
  });
  return `<nav class="map-links toc" id="toc">
          <p class="timeline-title">${stripLead(innerOf(title))}</p>
          <ol class="toc-list">
            ${lis.join('\n            ')}
          </ol>
        </nav>`;
}

export default {
  name: 'course-list',
  matchPage: (html) => /<main class="article-wrap">/.test(html) && /<nav class="toc-box" id="toc">/.test(html) && /<section class="course" id="course-1">/.test(html),
  convertPage(html, ctx) {
    const main = html.match(/<main class="article-wrap">([\s\S]*?)<\/main>/) ?? fail('<main class="article-wrap">를 찾지 못했다');
    const ch = children(main[1]);
    let i = 0;
    const next = (test, what) => { const e = ch[i]; if (!e || !test(e)) fail(`${what}가 ${i}번째에 없다`); i++; return e; };

    const badge = next((e) => has(e, 'post-badge'), 'post-badge');
    const h1 = next((e) => e.tag === 'h1', 'h1');
    const meta = next((e) => has(e, 'post-sub-meta'), 'post-sub-meta');
    const lead = next((e) => has(e, 'lead-box'), 'lead-box');
    const toc = next((e) => e.tag === 'nav' && has(e, 'toc-box'), 'toc-box');
    const spans = [...innerOf(meta).matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter((s) => s !== '•');
    if (!spans.length || innerOf(meta).replace(/<span>[\s\S]*?<\/span>/g, '').trim()) fail('post-sub-meta 틀을 읽지 못했다');
    const href = main[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const hero = pageHeroOf({ kicker: innerOf(badge), title: innerOf(h1), spans, href });

    const courses = [];
    while (ch[i] && ch[i].tag === 'section' && has(ch[i], 'course')) courses.push(courseOf(ch[i++], courses.length + 1));
    if (!courses.length) fail('section.course가 없다');
    // 맺음: h2와 문단들, 출처 footer-source
    const endH2 = next((e) => e.tag === 'h2', '맺음 h2');
    const ps = [];
    while (ch[i] && ch[i].tag === 'p') ps.push(ch[i++]);
    const credit = next((e) => has(e, 'footer-source'), 'footer-source');
    if (i !== ch.length) fail(`main 아래에 모르는 요소가 있다: ${ch[i].tag}.${ch[i].cls}`);

    const inner = `
      ${hero}

      <div class="container">
        <div class="prose-intro">${innerOf(lead)}</div>
        ${tocOf(toc)}

        <div class="spots">
          ${courses.join('\n\n          ')}
        </div>

        <section class="prose-section">
          <h2>${stripLead(innerOf(endH2))}</h2>
          ${ps.map((p) => `<p>${noStyle(innerOf(p))}</p>`).join('\n          ')}
        </section>

        <footer class="article-credit">
          <p>${innerOf(credit)}</p>
        </footer>
      </div>
    `;
    let out = html.replace(main[0], () => `<main class="article-container"><article>${inner}</article></main>`);

    const bar = out.match(/<header class="travel-header-bar">\s*<div class="header-inner">\s*<div class="header-title"><a href="([^"]*)"[^>]*>←[\s\S]*?오늘 데이트 매거진<\/a><\/div>\s*<div class="header-meta">([\s\S]*?)<\/div>\s*<\/div>\s*<\/header>/);
    if (!bar) fail('travel-header-bar 틀을 읽지 못했다');
    out = out.replace(bar[0], () => siteHeaderHtml(bar[1], bar[2].trim()));
    out = out.replace('</main>', () => `</main>

  ${siteFooterHtml(`<p class="footer-mark"><strong>오늘 데이트 (Oneul Date)</strong></p>
      <p class="footer-line">전국 데이트 & 여행 코스 큐레이션 매거진</p>`)}`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    return ctx.finish(out);
  },
};
