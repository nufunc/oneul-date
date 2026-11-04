// 계열: 지도 칩 줄 글(div.spot-chips-row, 부안, 봉화, 옥천, 곡성, 함양, 정선, 논산, 영동, 연천). 앱 코스 상자가 article 밖에 있어 페이지 전체를 이 모듈이 읽는다.
// 틀이 둘이다: 요약형(cost-table-card, course-summary-card, site-footer 있음)과 대표 사진형(hero-image-wrap, budget-section, source-notice, back-btn-wrap, 푸터 없음).
// 장소 구획은 spot-header(번호, 제목, 태그), spot-image-wrap(사진, 설명), spot-desc, spot-chips-row, tip-box(tip-box-title)다.
// 원본의 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견준다).
import { fail, stripLead, blocks, heroOf, introOf, appBoxOf, costOf } from '../hallmark_common.mjs';
import step from './spot-info-step.mjs';

function figureOf(box) {
  const m = box.match(/^<div class="hero-image-wrap">\s*(<img\b[^>]*\/>)\s*<p class="image-caption">([\s\S]*?)<\/p>\s*<\/div>$/);
  if (!m) fail('hero-image-wrap 틀을 읽지 못했다');
  return `<div class="container">
        <figure class="hero-figure">
          ${m[1]}
          <figcaption>${m[2].trim()}</figcaption>
        </figure>
      </div>`;
}

function summaryOf(sec) {
  const m = sec.match(/^<section class="course-summary-card">\s*<h3 class="summary-title">([\s\S]*?)<\/h3>\s*<div class="summary-grid">([\s\S]*)<\/div>\s*<\/section>$/);
  if (!m) fail('course-summary-card 틀을 읽지 못했다');
  const itemRe = /<div class="summary-item">\s*<span class="summary-label">([\s\S]*?)<\/span>\s*<span class="summary-val">([\s\S]*?)<\/span>\s*<\/div>/g;
  const items = [...m[2].matchAll(itemRe)];
  if (!items.length || m[2].replace(itemRe, '').trim()) fail('summary-grid에 모르는 요소가 있다');
  return `<div class="summary-card">
          <h2 class="summary-title">${stripLead(m[1])}</h2>
          <ul class="summary-list">
            ${items.map((i) => `<li><strong>${i[1].trim()}</strong> ${i[2].trim()}</li>`).join('\n            ')}
          </ul>
        </div>`;
}

function spotOf(sec, n) {
  const m = sec.match(/^<section class="spot-section">\s*<div class="spot-header">\s*(<span class="spot-number">[\s\S]*?<\/span>)\s*(<h2 class="spot-title">[\s\S]*?<\/h2>)\s*<span class="spot-tag">([\s\S]*?)<\/span>\s*<\/div>([\s\S]*)<\/section>$/);
  if (!m) fail(`스팟 ${n}: spot-header 틀을 읽지 못했다`);
  let rest = m[4];
  const photo = rest.match(/^\s*<div class="spot-image-wrap">\s*(<img\b[^>]*\/>)\s*(?:<p class="image-caption">([\s\S]*?)<\/p>\s*)?<\/div>/);
  if (photo) rest = rest.slice(photo[0].length);
  const parts = [];
  const kinds = [
    [/^\s*<p class="spot-desc">[\s\S]*?<\/p>/, (x) => x[0].trim()],
    [/^\s*<div class="spot-chips-row">([\s\S]*?)<\/div>/, (x) => {
      const links = [...x[1].matchAll(/<a (href="[^"]*"[^>]*?) class="spot-chip-btn(?: map-chip)?">\s*([\s\S]*?)\s*<\/a>/g)];
      if (!links.length || x[1].replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail(`스팟 ${n}: spot-chips-row에 모르는 요소가 있다`);
      return `<div class="map-btn-wrap spot-actions">${links.map((l) => `<a ${l[1]} class="btn-naver-map link-quiet">${stripLead(l[2])}</a>`).join('')}</div>`;
    }],
    [/^\s*<div class="tip-box">\s*<div class="tip-box-title">([\s\S]*?)<\/div>([\s\S]*?)<\/div>/, (x) => `<div class="tip-box"><strong class="tip-title">${stripLead(x[1])}</strong>${x[2].trim()}</div>`],
  ];
  for (let hit = true; hit; ) {
    hit = false;
    for (const [re, f] of kinds) {
      const x = rest.match(re);
      if (x) { parts.push(f(x)); rest = rest.slice(x[0].length); hit = true; break; }
    }
  }
  if (rest.trim()) fail(`스팟 ${n}: 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);
  const cls = ['spot-section', n % 2 === 0 && photo ? 'flip' : '', photo ? '' : 'no-photo'].filter(Boolean).join(' ');
  const fig = photo ? `\n            <figure class="spot-photo spot-image-wrap">
              ${photo[1]}${photo[2] ? `\n              <figcaption>${photo[2].trim()}</figcaption>` : ''}
            </figure>` : '';
  return `<section class="${cls}">
            <div class="spot-head">
              <div class="spot-header">${m[1]}${m[2]}</div>
              <p class="spot-tagline">${m[3].trim()}</p>
            </div>${fig}
            <div class="spot-body">
              ${parts.join('\n              ')}
            </div>
          </section>`;
}

export default {
  name: 'spot-chips',
  match: () => false,
  matchPage: (html) => /<div class="spot-chips-row">/.test(html) && /class="tl-step"/.test(html) && !/<div class="spot-card">/.test(html) && !/class="timeline-item"/.test(html),
  convertPage(html, ctx) {
    const main = html.match(/<main class="article-container">\s*<article>([\s\S]*?)<\/article>\s*([\s\S]*?)\s*<\/main>/);
    if (!main) fail('<main class="article-container"><article>를 찾지 못했다');
    const inner = main[1];
    const hero = heroOf(inner + main[2]); // 앱 코스 링크가 article 밖에 있어 같이 넘겨야 첫 화면 버튼이 생긴다
    const intro = introOf(inner);
    const hb = blocks(inner, /<div class="hero-image-wrap">/, 'div');
    const tl = blocks(inner, /<section class="timeline-card">/, 'section');
    const spots = blocks(inner, /<section class="spot-section">/, 'section');
    const cost = blocks(inner, /<section class="(?:cost-table-card|budget-section)">/, 'section');
    const sum = blocks(inner, /<section class="course-summary-card">/, 'section');
    const notice = blocks(inner, /<div class="source-notice">/, 'div');
    const back = blocks(inner, /<div class="back-btn-wrap">/, 'div');
    const app = blocks(main[2], /<div class="app-course-box"/, 'div');
    if (hb.length > 1 || sum.length > 1 || notice.length > 1 || back.length > 1 || app.length > 1) fail('대표 사진, 요약 상자, 출처, 돌아가기, 앱 코스 상자는 각각 0~1개여야 한다');
    if (tl.length !== 1) fail(`동선 구획이 ${tl.length}개다(1개여야 한다)`);
    if (cost.length !== 1) fail(`경비 구획이 ${cost.length}개다(1개여야 한다)`);
    if (!spots.length) fail('spot-section이 없다');
    if (main[2].replace(app[0]?.text ?? '', '').trim()) fail(`article 밖에 모르는 요소가 있다: ${main[2].replace(app[0]?.text ?? '', '').trim().slice(0, 80)}`);
    let rest = inner.slice(0, hero.start) + inner.slice(hero.end);
    for (const b of [...hb, ...tl, ...spots, ...cost, ...sum, ...notice, ...back]) rest = rest.replace(b.text, '');
    rest = rest.replace(intro?.text ?? '', '').replace(/<!--[\s\S]*?-->/g, '');
    if (rest.trim()) fail(`본문에 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);

    const costSrc = cost[0].text.replace(/^<section class="(?:cost-table-card|budget-section)">/, '<section class="cost-table-card">').replace(/<h2 class="budget-title">([\s\S]*?)<\/h2>/, '<h3 class="timeline-title">$1</h3>');
    const noticeText = notice[0]?.text.match(/^<div class="source-notice">([\s\S]*)<\/div>$/)?.[1].trim();
    const backA = back[0]?.text.match(/^<div class="back-btn-wrap">\s*<a (href="[^"]*") class="back-btn">([\s\S]*?)<\/a>\s*<\/div>$/);
    if (back.length && !backA) fail('back-btn-wrap 틀을 읽지 못했다');
    if (notice.length && !noticeText) fail('source-notice 틀을 읽지 못했다');
    const tlHtml = step.timeline(tl[0].text.replace(/<h2 class="timeline-title">([\s\S]*?)<\/h2>/, '<h3 class="timeline-title">$1</h3>'));
    const body = `
      ${hero.out}
${hb.length ? `
      ${figureOf(hb[0].text)}
` : ''}${intro ? `
      <div class="container">
        <p class="prose-intro">${intro.html.trim()}</p>
      </div>
` : ''}
      <!-- 동선 -->
      ${tlHtml}

      <div class="container">
        <div class="spots">
          ${spots.map((s, i) => spotOf(s.text, i + 1)).join('\n\n          ')}
        </div>

        ${costOf(costSrc)}
${sum.length ? `
        ${summaryOf(sum[0].text)}
` : ''}${notice.length ? `
        <footer class="article-credit${back.length ? ' tight' : ''}">
          <p>${noticeText}</p>
        </footer>
` : ''}${back.length ? `
        <p class="back-link"><a class="link-quiet" ${backA[1]}>${backA[2].trim()}</a></p>
` : ''}${app.length ? `
        ${appBoxOf(app[0].text)}
` : ''}      </div>
    `;
    let out = html.replace(main[0], () => `<main class="article-container">\n    <article>${body}</article>\n  </main>`);

    // 푸터: 요약형만 있다. 문단마다 한 줄로 옮긴다.
    const foot = out.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/);
    if (foot) {
      const ps = [...foot[1].matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((x) => x[1].trim());
      if (!ps.length || foot[1].replace(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g, '').trim()) fail('site-footer에 모르는 요소가 있다');
      out = out.replace(foot[0], () => `<footer class="site-footer">
    <div class="footer-inner container">
      ${ps.map((p) => `<p class="footer-line">${p}</p>`).join('\n      ')}
    </div>
  </footer>`);
    }
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace('<div class="header-inner">', '<div class="header-inner container">');
    return ctx.finish(out);
  },
};
