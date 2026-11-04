// 계열: 장소 카드 글(div.spot-card, 안성, 청도, 당진, 삼척 등). 본문 틀이 spot-info-box 계열과 달라 페이지 전체를 이 모듈이 읽는다.
// 구성: 머리, 대표 사진(hero-image-wrap), 요약 상자(summary-box), 동선(tl-step), content-section(프롤로그, 세부 코스, 경비, 총평), cta-card, 앱 코스 상자(article 밖), site-footer.
// 원본의 글 순서를 그대로 지킨다(보존 비교가 본문 글자를 순서대로 견준다).
import { fail, stripLead, blocks, heroOf, appBoxOf, costOf, EMOJI_LEAD } from '../hallmark_common.mjs';
import step from './spot-info-step.mjs';

const noBlock = (s, what) => {
  const left = s.replace(/<p>[\s\S]*?<\/p>/g, '').replace(/<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>/g, '').trim();
  if (left) fail(`${what}에 모르는 요소가 있다: ${left.slice(0, 80)}`);
};

function figureOf(box) {
  const m = box.match(/^<div class="hero-image-wrap">\s*(<img\b[^>]*\/>)\s*<div class="hero-caption">([\s\S]*?)<\/div>\s*<\/div>$/);
  if (!m) fail('hero-image-wrap 틀을 읽지 못했다');
  return `<div class="container">
        <figure class="hero-figure">
          ${m[1]}
          <figcaption>${m[2].trim()}</figcaption>
        </figure>
      </div>`;
}

function summaryOf(box) {
  const m = box.match(/^<div class="summary-(?:box|card)">\s*<div class="summary-title">\s*(?:<span>[\s\S]*?<\/span>)?([\s\S]*?)<\/div>\s*(<ul class="summary-list">[\s\S]*?<\/ul>)\s*<\/div>$/);
  if (!m) fail('summary-box 틀을 읽지 못했다');
  return `<div class="container">
        <div class="summary-card">
          <p class="summary-title">${m[1].trim()}</p>
          ${m[2]}
        </div>
      </div>`;
}

function proseOf(sec) {
  const m = sec.match(/^<section class="content-section">\s*(<h2>[\s\S]*?<\/h2>)([\s\S]*)<\/section>$/);
  if (!m) fail('content-section 틀을 읽지 못했다');
  noBlock(m[2], `본문 구획(${m[1].slice(0, 30)})`);
  return `<section class="prose-section">
          ${m[1]}${m[2].replace(/\s+$/, '')}
        </section>`;
}

function infoOf(ul, n) {
  const rows = [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => {
    const t = m[1].replace(EMOJI_LEAD, '');
    // 라벨 없는 항목(이모지로만 구분한 줄)은 값 한 칸으로 둔다
    if (!/^<strong>/.test(t)) return `<div class="info-row plain"><span class="info-val">${t.trim()}</span></div>`;
    const r = t.match(/^<strong>([\s\S]*?)<\/strong>\s*:\s*([\s\S]*)$/);
    if (!r) fail(`스팟 ${n}: spot-info-list 항목을 읽지 못했다: ${m[1].slice(0, 60)}`);
    return `<div class="info-row"><span class="info-label">${r[1]}:</span><span class="info-val">${r[2].trim()}</span></div>`;
  });
  if (!rows.length || ul.replace(/<li>[\s\S]*?<\/li>/g, '').replace(/<\/?ul[^>]*>/g, '').trim()) fail(`스팟 ${n}: spot-info-list에 모르는 요소가 있다`);
  return `<div class="spot-info-box info-wide">${rows.join('')}</div>`;
}

function spotOf(card, n) {
  const m = card.match(/^<div class="spot-card">\s*(?:<div class="spot-image-wrap">\s*(<img\b[^>]*\/>)\s*<span class="spot-badge">([\s\S]*?)<\/span>\s*<\/div>\s*)?<div class="spot-content">\s*<div class="spot-title-wrap">\s*<h3 class="spot-title">([\s\S]*?)<\/h3>\s*<span class="spot-category">([\s\S]*?)<\/span>\s*<\/div>([\s\S]*)<\/div>\s*<\/div>$/);
  if (!m) fail(`스팟 ${n}: spot-card 틀을 읽지 못했다`);
  const [, img, badge, title, category] = m;
  let rest = m[5];
  const parts = [];
  // 정보 목록, 지도 버튼들, 설명, 팁이 글마다 다른 순서로 오므로 앞에서부터 아는 블록을 하나씩 뗀다(원래 순서 유지)
  const kinds = [
    [/^\s*<ul class="spot-info-list">[\s\S]*?<\/ul>/, (x) => infoOf(x[0], n)],
    [/^\s*<div class="spot-actions">([\s\S]*?)<\/div>/, (x) => {
      const links = [...x[1].matchAll(/<a (href="[^"]*"[^>]*) class="action-chip chip-[a-z]+">\s*([\s\S]*?)\s*<\/a>/g)];
      if (!links.length || x[1].replace(/<a [\s\S]*?<\/a>/g, '').trim()) fail(`스팟 ${n}: spot-actions에 모르는 요소가 있다`);
      return `<div class="map-btn-wrap spot-actions">${links.map((l) => `<a ${l[1]} class="btn-naver-map link-quiet">${stripLead(l[2]).replace(/\s*↗$/, '')}</a>`).join('')}</div>`;
    }],
    [/^\s*<p class="spot-desc">[\s\S]*?<\/p>/, (x) => x[0].trim()],
    [/^\s*<div class="tip-box">\s*<span class="tip-icon">[\s\S]*?<\/span>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/, (x) => `<div class="tip-box">${x[1].trim()}</div>`],
  ];
  for (let hit = true; hit; ) {
    hit = false;
    for (const [re, f] of kinds) {
      const x = rest.match(re);
      if (x) { parts.push(f(x)); rest = rest.slice(x[0].length); hit = true; break; }
    }
  }
  if (rest.trim()) fail(`스팟 ${n}: 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);
  const flip = n % 2 === 0;
  const cls = ['spot-section', flip && img ? 'flip' : '', img ? '' : 'no-photo'].filter(Boolean).join(' ');
  const photo = img ? `\n            <figure class="spot-photo spot-image-wrap">\n              ${img}\n            </figure>` : '';
  const kicker = badge ? `<span class="spot-badge">${badge.trim()}</span>` : '';
  return `<section class="${cls}">
            <div class="spot-head">
              <div class="spot-header">${kicker}<h3 class="spot-title">${title}</h3></div>
              <p class="spot-tagline">${category}</p>
            </div>${photo}
            <div class="spot-body">
              ${parts.join('\n              ')}
            </div>
          </section>`;
}

function bridgeOf(b) {
  const m = b.match(/^<div class="drive-bridge">\s*<span class="bridge-icon">[\s\S]*?<\/span>\s*<div>([\s\S]*?)<\/div>\s*<\/div>$/);
  if (!m) fail('drive-bridge 틀을 읽지 못했다');
  return `<p class="drive-bridge">${m[1].trim()}</p>`;
}

function spotsOf(sec) {
  const m = sec.match(/^<section class="content-section">\s*(<h2>[\s\S]*?<\/h2>)([\s\S]*)<\/section>$/);
  if (!m) fail('세부 코스 구획 틀을 읽지 못했다');
  const items = [
    ...blocks(m[2], /<div class="spot-card">/, 'div').map((b) => ({ at: b.start, kind: 'spot', text: b.text })),
    ...blocks(m[2], /<div class="drive-bridge">/, 'div').map((b) => ({ at: b.start, kind: 'bridge', text: b.text })),
  ].sort((a, b) => a.at - b.at);
  let left = m[2];
  for (const it of items) left = left.replace(it.text, '');
  if (left.replace(/<!--[\s\S]*?-->/g, '').trim()) fail(`세부 코스 구획에 모르는 요소가 있다: ${left.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 80)}`);
  let n = 0;
  const out = items.map((it) => (it.kind === 'spot' ? spotOf(it.text, ++n) : bridgeOf(it.text)));
  if (!n) fail('spot-card가 없다');
  const bridged = items.some((it) => it.kind === 'bridge');
  return `<section class="stops-section">
          ${m[1].replace('<h2>', '<h2 class="spots-title">')}
          <div class="spots${bridged ? ' bridged' : ''}">
          ${out.join('\n\n          ')}
          </div>
        </section>`;
}

function ctaOf(box) {
  const o = box.match(/^<div class="outro-card">\s*<div class="outro-title">([\s\S]*?)<\/div>\s*<p class="outro-desc">([\s\S]*?)<\/p>\s*<a (href="[^"]*") class="btn-cta">([\s\S]*?)<\/a>\s*<\/div>$/);
  if (o) return `<div class="cta-card">
          <p class="cta-title">${o[1]}</p>
          <p>${o[2]}</p>
          <a ${o[3]} class="link-quiet">${o[4].trim()}</a>
        </div>`;
  const m = box.match(/^<div class="cta-card">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a (href="[^"]*") class="(?:cta-btn|btn-cta)">([\s\S]*?)<\/a>\s*<\/div>$/);
  if (!m) fail('cta-card 틀을 읽지 못했다');
  return `<div class="cta-card">
          <h3>${m[1]}</h3>
          <p>${m[2]}</p>
          <a ${m[3]} class="link-quiet">${m[4].trim()}</a>
        </div>`;
}

export default {
  name: 'spot-card',
  match: () => false,
  matchPage: (html) => /<div class="spot-card">/.test(html) && /<section class="content-section">/.test(html) && /class="tl-step"/.test(html) && !/class="timeline-item"/.test(html),
  convertPage(html, ctx) {
    const main = html.match(/<main class="article-container">\s*<article>([\s\S]*?)<\/article>\s*([\s\S]*?)\s*<\/main>/);
    if (!main) fail('<main class="article-container"><article>를 찾지 못했다');
    const inner = main[1];
    // 옛 머리 변형: 분류가 span.article-tag 여럿이면 badge-category 하나로 모은다
    const tagWrap = inner.match(/<div class="article-tag-wrap">\s*((?:<span class="article-tag">[\s\S]*?<\/span>\s*)+)<\/div>/);
    const innerN = tagWrap ? inner.replace(tagWrap[0], `<span class="badge-category">${[...tagWrap[1].matchAll(/<span class="article-tag">([\s\S]*?)<\/span>/g)].map((x) => x[1].trim()).join(' · ')}</span>`) : inner;
    const hero = heroOf(innerN + main[2]); // 앱 코스 링크가 article 밖에 있어 같이 넘겨야 첫 화면 버튼이 생긴다
    const lead = innerN.match(/<div class="lead-box">([\s\S]*?)<\/div>/);
    const hb = blocks(inner, /<div class="hero-image-wrap">/, 'div');
    const sb = blocks(inner, /<div class="summary-(?:box|card)">/, 'div');
    const tl = blocks(inner, /<section class="timeline-card">/, 'section');
    const cs = blocks(inner, /<section class="content-section">/, 'section');
    const cta = blocks(inner, /<div class="(?:cta-card|outro-card)">/, 'div');
    const app = blocks(main[2], /<div class="app-course-box"/, 'div');
    if (hb.length > 1 || sb.length > 1 || cta.length > 1 || app.length > 1) fail('대표 사진, 요약 상자, cta, 앱 코스 상자는 각각 0~1개여야 한다');
    if (tl.length !== 1) fail(`동선 구획이 ${tl.length}개다(1개여야 한다)`);
    if (!cs.length) fail('content-section이 없다');
    if (main[2].replace(app[0]?.text ?? '', '').trim()) fail(`article 밖에 모르는 요소가 있다: ${main[2].replace(app[0]?.text ?? '', '').trim().slice(0, 80)}`);
    let rest = innerN.slice(0, hero.start) + innerN.slice(hero.end);
    for (const b of [...hb, ...sb, ...tl, ...cs, ...cta]) rest = rest.replace(b.text, '');
    if (lead) rest = rest.replace(lead[0], '');
    rest = rest.replace(/<!--[\s\S]*?-->/g, '');
    if (rest.trim()) fail(`본문에 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);

    const sections = cs.map((b) => {
      if (/<div class="spot-card">/.test(b.text)) return spotsOf(b.text);
      if (/<table class="cost-table"/.test(b.text)) return costOf(b.text.replace('<section class="content-section">', '<section class="cost-table-card">').replace(/<h2>([\s\S]*?)<\/h2>/, '<h3 class="timeline-title">$1</h3>')).replace('<h2 class="timeline-title">', '<h2 class="timeline-title long">');
      return proseOf(b.text);
    });
    // 동선 제목이 h2인 글과 헤딩이 아닌 div인 글이 있다. div는 헤딩 목록을 바꾸지 않도록 p로 둔다.
    const divTitle = /<div class="timeline-title">/.test(tl[0].text);
    let tlHtml = step.timeline(tl[0].text.replace(/<(h2|div) class="timeline-title">([\s\S]*?)<\/\1>/, '<h3 class="timeline-title">$2</h3>'));
    if (divTitle) tlHtml = tlHtml.replace(/<h2 class="timeline-title">([\s\S]*?)<\/h2>/, '<p class="timeline-title">$1</p>');
    const body = `
      ${hero.out}
${lead ? `
      <div class="container">
        <p class="prose-intro">${lead[1].trim()}</p>
      </div>
` : ''}${hb.length ? `
      ${figureOf(hb[0].text)}
` : ''}${sb.length ? `
      ${summaryOf(sb[0].text)}
` : ''}
      <!-- 동선 -->
      ${tlHtml}

      <div class="container">
        ${sections.join('\n\n        ')}
${cta.length ? `
        ${ctaOf(cta[0].text)}
` : ''}${app.length ? `
        ${appBoxOf(app[0].text)}
` : ''}      </div>
    `;
    let out = html.replace(main[0], () => `<main class="article-container">\n    <article>${body}</article>\n  </main>`);

    const foot = out.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/);
    if (!foot) fail('site-footer를 찾지 못했다');
    const ps = [...foot[1].matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((x) => x[1].trim());
    if (!ps.length || foot[1].replace(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g, '').trim()) fail('site-footer에 모르는 요소가 있다');
    out = out.replace(foot[0], () => `<footer class="site-footer">
    <div class="footer-inner container">
      ${ps.map((p) => `<p class="footer-line">${p}</p>`).join('\n      ')}
    </div>
  </footer>`);
    out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${ctx.css}\n  </style>`);
    out = out.replace('<div class="header-inner">', '<div class="header-inner container">');
    return ctx.finish(out);
  },
};
