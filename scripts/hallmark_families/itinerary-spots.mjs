// 계열: main.article-wrap 아래 post-category-tag·itinerary-card·spot-section(spot-badge, spot-heading)·transition-bridge가 이어지는 글(군산).
// 페이지 틀이 다르므로 머리·푸터까지 이 모듈이 읽는다(matchPage, convertPage). 모르는 요소가 있으면 실패한다.
// 장소 구획은 spot-block 계열과 같은 한 열(story-section)이고, 동선은 막(act)마다 route 하나다.
import { fail, stripLead, tagText, appBoxOf, costOf, pageHeroOf, siteHeaderHtml, siteFooterHtml } from '../hallmark_common.mjs';
import { children } from './real-photo-flat.mjs';

const innerOf = (el) => el.text.replace(/^<\w+[^>]*>/, '').replace(/<\/\w+>$/, '').trim();
const has = (el, cls) => el.cls.split(/\s+/).includes(cls);
const noStyle = (s) => s.replace(/ style="[^"]*"/g, '');
const bare = (p) => noStyle(p).replace(/^<p class="[^"]*">/, '<p>').replace(/<p>\s+/, '<p>').replace(/\s+<\/p>$/, '</p>');

function figureOf(el) {
  const img = el.text.match(/<img\b[^>]*\/?>/)?.[0] ?? fail('article-photo에 img가 없다');
  const cap = el.text.match(/<div class="photo-caption">([\s\S]*?)<\/div>/)?.[1];
  const rest = el.text.replace(img, '').replace(/<div class="photo-caption">[\s\S]*?<\/div>/, '').replace(/^<div[^>]*>|<\/div>$/g, '');
  if (rest.trim()) fail(`article-photo에 모르는 요소가 있다: ${rest.trim().slice(0, 60)}`);
  return `<figure class="story-photo">
              ${img.replace(/\s*\/?>$/, ' />')}${cap ? `\n              <figcaption>${cap.trim()}</figcaption>` : ''}
            </figure>`;
}

// 동선 카드: itinerary-title, 막마다 itinerary-section-title + ul.itinerary-list(li: span.time, span: strong 장소 : 설명)
function timelineOf(el, note) {
  const ch = children(innerOf(el));
  const head = ch.find((e) => has(e, 'itinerary-title')) ?? fail('itinerary-title을 찾지 못했다');
  const title = stripLead(tagText(innerOf(head))).replace(/\s+/g, ' ');
  const acts = [];
  for (const e of ch) {
    if (e === head) continue;
    if (has(e, 'itinerary-section-title')) acts.push({ label: stripLead(innerOf(e)), steps: [] });
    else if (e.tag === 'ul' && has(e, 'itinerary-list') && acts.length) {
      for (const li of children(innerOf(e))) {
        const s = innerOf(li).match(/^<span class="time"[^>]*>([\s\S]*?)<\/span>\s*<span>([\s\S]*)<\/span>$/);
        if (li.tag !== 'li' || !s) fail('itinerary-list 항목 틀을 읽지 못했다');
        const named = s[2].trim().match(/^<strong>([\s\S]*?)<\/strong>\s*:\s*([\s\S]*)$/);
        acts.at(-1).steps.push({ time: s[1].trim(), place: named ? named[1].trim() : s[2].trim(), note: named ? named[2].trim() : '' });
      }
    } else fail(`동선 카드에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  }
  if (!acts.length || acts.some((a) => !a.steps.length)) fail('동선 카드에 막이나 단계가 없다');
  const routes = acts.map((a) => `<div class="route" style="--n:${a.steps.length}">
            <div class="tl-act" style="--r:1; --c:1; --s:${a.steps.length}">${a.label}</div>
            ${a.steps.map((s, i) => `<div class="tl-step" style="--r:2; --c:${i + 1}"><span class="tl-time">${s.time}</span><span class="tl-place">${s.place}</span>${s.note ? `<span class="tl-note">${s.note}</span>` : ''}</div>`).join('\n            ')}
          </div>`);
  return `<section class="timeline-card band">
        <div class="container">
          <p class="timeline-title">${title}</p>
          ${routes.join('\n          ')}
          ${note ? `<p class="tl-total">${innerOf(note)}</p>` : ''}
        </div>
      </section>`;
}

// 참고 영상 카드: 제목·출처 칸, iframe, 한 줄 설명
function videoOf(el) {
  const ch = children(innerOf(el));
  const head = ch.find((e) => has(e, 'video-header')) ?? fail('video-header를 찾지 못했다');
  const frame = ch.find((e) => has(e, 'video-iframe-wrap')) ?? fail('video-iframe-wrap을 찾지 못했다');
  const cap = ch.find((e) => has(e, 'video-caption')) ?? fail('video-caption을 찾지 못했다');
  if (ch.length !== 3) fail('youtube-embed-card에 모르는 요소가 있다');
  const spans = [...innerOf(head).matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
  if (spans.length !== 2 || innerOf(head).replace(/<span[^>]*>[\s\S]*?<\/span>/g, '').trim()) fail('video-header 틀을 읽지 못했다');
  const iframe = innerOf(frame).match(/^<iframe\b[^>]*><\/iframe>$/)?.[0] ?? fail('iframe 하나를 읽지 못했다');
  return `<section class="video-card">
          <p class="video-title">${stripLead(spans[0])}</p>
          <p class="video-source">${spans[1]}</p>
          <div class="video-frame">${iframe}</div>
          <p class="video-caption">${noStyle(innerOf(cap))}</p>
        </section>`;
}

function spotOf(el, n) {
  const ch = children(innerOf(el));
  const badge = ch[0]?.cls === 'spot-badge' ? innerOf(ch[0]) : fail(`스팟 ${n}: spot-badge가 첫 요소가 아니다`);
  const [num, ...when] = badge.split(' · ');
  const h2 = ch[1]?.tag === 'h2' ? innerOf(ch[1]) : fail(`스팟 ${n}: h2가 둘째 요소가 아니다`);
  const body = ch.slice(2).map((e) => {
    if (e.tag === 'p' && has(e, 'spot-desc')) return bare(e.text);
    if (has(e, 'article-photo')) return figureOf(e);
    if (has(e, 'tip-box')) {
      const t = innerOf(e).match(/^<div class="tip-box-title">([\s\S]*?)<\/div>\s*(<ul>[\s\S]*<\/ul>)$/);
      if (!t) fail(`스팟 ${n}: tip-box 틀을 읽지 못했다`);
      return `<div class="tip-box"><strong class="tip-title">${stripLead(t[1])}</strong>${t[2]}</div>`;
    }
    return fail(`스팟 ${n}: 모르는 요소가 있다: ${e.tag}.${e.cls}`);
  });
  return `<section class="story-section">
            <p class="story-kicker"><span class="spot-num">${num.trim()}</span>${when.length ? `<span>${when.join(' · ').trim()}</span>` : ''}</p>
            <h2 class="spot-title">${stripLead(h2)}</h2>
            <div class="story-body">
              ${body.join('\n              ')}
            </div>
          </section>`;
}

function bridgeOf(el) {
  const m = el.text.match(/^<div class="transition-bridge"[^>]*>\s*<div class="bridge-icon">[\s\S]*?<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>$/);
  if (!m) fail('transition-bridge 틀을 읽지 못했다');
  return `<p class="drive-bridge">${m[1].trim()}</p>`;
}

// 경비 구획: 스타일을 인라인으로 단 section(h2, p, div.table-container > table.expense-table)
function costSection(el) {
  const ch = children(innerOf(el));
  const h2 = ch.find((e) => e.tag === 'h2') ?? fail('경비 구획의 h2를 찾지 못했다');
  const p = ch.find((e) => e.tag === 'p');
  const wrap = ch.find((e) => has(e, 'table-container')) ?? fail('table-container를 찾지 못했다');
  if (ch.length !== 2 + (p ? 1 : 0)) fail('경비 구획에 모르는 요소가 있다');
  const table = wrap.text.match(/<table\b[^>]*>[\s\S]*<\/table>/)?.[0] ?? fail('경비표 table을 찾지 못했다');
  const t = noStyle(table).replace(/<table\b[^>]*>/, '<table class="cost-table">').replace(/<tr class="total-row">/, '<tr class="cost-total-row">');
  return costOf(`<section class="cost-table-card"><h3 class="timeline-title">${innerOf(h2)}</h3>${p ? `<p>${innerOf(p)}</p>` : ''}<div class="table-wrap">${t}</div></section>`);
}

function mapSection(el) {
  const ch = children(innerOf(el));
  const title = ch.find((e) => has(e, 'map-action-title')) ?? fail('map-action-title을 찾지 못했다');
  const desc = ch.find((e) => has(e, 'map-action-desc')) ?? fail('map-action-desc를 찾지 못했다');
  const grid = ch.find((e) => has(e, 'spot-links-grid')) ?? fail('spot-links-grid를 찾지 못했다');
  if (ch.length !== 3) fail('map-action-card에 모르는 요소가 있다');
  const links = [...innerOf(grid).matchAll(/<a (href="[^"]*"[^>]*?)\s*class="spot-link-chip">\s*([\s\S]*?)\s*<\/a>/g)];
  if (!links.length || innerOf(grid).replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail('spot-link-chip 줄을 읽지 못했다');
  return `<section class="map-links">
          <p class="timeline-title">${stripLead(innerOf(title))}</p>
          <p>${innerOf(desc)}</p>
          <ul class="map-list">
            ${links.map((l) => `<li><a ${l[1]}>${stripLead(l[2])}</a></li>`).join('\n            ')}
          </ul>
        </section>`;
}

function tagsOf(el) {
  const tags = [...innerOf(el).matchAll(/<span class="tag-item">([\s\S]*?)<\/span>/g)].map((m) => m[1].trim());
  if (!tags.length || innerOf(el).replace(/<span class="tag-item">[\s\S]*?<\/span>/g, '').trim()) fail('tag-list 틀을 읽지 못했다');
  return `<p class="tag-list">${tags.map((t) => `<span>${t}</span>`).join('')}</p>`;
}

export default {
  name: 'itinerary-spots',
  matchPage: (html) => /<main class="article-wrap">/.test(html) && /<div class="itinerary-card">/.test(html) && /<h2 class="spot-heading">/.test(html),
  convertPage(html, ctx) {
    const main = html.match(/<main class="article-wrap">([\s\S]*?)<\/main>/) ?? fail('<main class="article-wrap">를 찾지 못했다');
    const ch = children(main[1]);
    let i = 0;
    const next = (test, what) => { const e = ch[i]; if (!e || !test(e)) fail(`${what}가 ${i}번째에 없다`); i++; return e; };

    // 머리: 분류, 제목, 부제, 글쓴이 줄, 도입, 동선 카드와 안내 문단
    const tag = next((e) => has(e, 'post-category-tag'), 'post-category-tag');
    const h1 = next((e) => e.tag === 'h1', 'h1');
    const sub = next((e) => has(e, 'post-subtitle'), 'post-subtitle');
    const who = next((e) => has(e, 'post-meta-row'), 'post-meta-row');
    const lead = next((e) => has(e, 'post-lead'), 'post-lead');
    const card = next((e) => has(e, 'itinerary-card'), 'itinerary-card');
    const note = ch[i]?.tag === 'p' && has(ch[i], 'spot-desc') ? ch[i++] : null;

    const whoBody = innerOf(who).replace(/<div class="author-profile">\s*<div class="author-avatar">[\s\S]*?<\/div>\s*<span>([\s\S]*?)<\/span>\s*<\/div>/, '<span>$1</span>');
    const spans = [...whoBody.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter((s) => s !== '·');
    if (!spans.length || whoBody.replace(/<span>[\s\S]*?<\/span>/g, '').trim()) fail('post-meta-row 틀을 읽지 못했다');
    const href = main[1].match(/href="([^"]*#c=[^"]*)"/)?.[1];
    const hero = pageHeroOf({ kicker: innerOf(tag), title: innerOf(h1), quote: innerOf(sub), spans, href });

    // 이어지는 요소: 영상, 장소와 이동 연결(한 묶음), 경비, 지도, 태그, 앱 코스 상자
    const parts = [];
    let n = 0;
    const story = (s) => { if (parts.at(-1)?.stories) parts.at(-1).stories.push(s); else parts.push({ stories: [s] }); };
    let app = null;
    for (; i < ch.length; i++) {
      const e = ch[i];
      if (has(e, 'youtube-embed-card')) parts.push(videoOf(e));
      else if (e.tag === 'section' && has(e, 'spot-section')) story(spotOf(e, ++n));
      else if (has(e, 'transition-bridge')) story(bridgeOf(e));
      else if (e.tag === 'section' && !e.cls) parts.push(costSection(e));
      else if (has(e, 'map-action-card')) parts.push(mapSection(e));
      else if (has(e, 'tag-list')) parts.push(tagsOf(e));
      else if (has(e, 'app-course-box')) { if (app) fail('app-course-box가 둘이다'); app = e; }
      else fail(`main 아래에 모르는 요소가 있다: ${e.tag}.${e.cls}`);
    }
    if (!n) fail('spot-section이 없다');
    const secs = parts.map((p) => (p.stories ? `<div class="spots stories bridged">\n          ${p.stories.join('\n\n          ')}\n        </div>` : p));

    const inner = `
      ${hero}

      <div class="container">
        <div class="prose-intro">${innerOf(lead)}</div>
      </div>

      <!-- 동선 -->
      ${timelineOf(card, note)}

      <div class="container">
        ${secs.join('\n\n        ')}
${app ? `
        ${appBoxOf(app.text)}
` : ''}      </div>
    `;
    let out = html.replace(main[0], () => `<main class="article-container"><article>${inner}</article></main>`);

    const bar = out.match(/<header class="blog-header">\s*<div class="header-inner">\s*<a href="([^"]*)" class="blog-brand"[^>]*>\s*<span[^>]*>[^<]*오늘 데이트 매거진<\/span>\s*<span class="blog-sub-text">([\s\S]*?)<\/span>\s*<\/a>\s*<a href="#naver-map-section"[^>]*>[\s\S]*?<\/a>\s*<\/div>\s*<\/header>/);
    if (!bar) fail('blog-header 틀을 읽지 못했다');
    out = out.replace(bar[0], () => siteHeaderHtml(bar[1], bar[2].trim()));

    const foot = out.match(/<footer class="blog-footer">\s*<p>([\s\S]*?)<\/p>\s*<p class="footer-license">([\s\S]*?)<\/p>\s*<\/footer>/);
    if (!foot) fail('blog-footer 틀을 읽지 못했다');
    out = out.replace(foot[0], () => siteFooterHtml(`<p class="footer-line">${foot[1].trim()}</p>\n      <p class="footer-line">${foot[2].trim()}</p>`));
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    return ctx.finish(out);
  },
};
