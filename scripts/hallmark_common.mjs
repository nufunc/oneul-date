// Hallmark 변환(P-293)의 계열 공통 부품: 머리, 도입, 장소 구획, 경비표, 팁, 앱 코스 상자, 출처, 본문 조립.
// 계열 모듈(scripts/hallmark_families/*.mjs)은 동선(timeline) 틀만 다르게 읽고 나머지는 convertBody가 맡는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EMOJI_LEAD = /^[\p{Extended_Pictographic}️‍\s]+/u;
export const stripLead = (s) => s.replace(EMOJI_LEAD, '').trim();
export const fail = (msg) => { throw new Error(msg); };
export const tagText = (s) => s.replace(/<[^>]*>/g, '');

// 같은 태그가 겹치는 블록의 끝(닫는 태그 뒤 위치)을 찾는다.
export function blockEnd(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return fail(`<${tag}> 닫는 태그를 찾지 못했다`);
}

// html에서 openRe로 시작하는 블록들을 순서대로 뽑는다. 반환: [{ start, end, text }]
export function blocks(html, openRe, tag) {
  const out = [];
  const re = new RegExp(openRe.source, 'g');
  for (let m; (m = re.exec(html)); ) {
    const end = blockEnd(html, m.index, tag);
    out.push({ start: m.index, end, text: html.slice(m.index, end) });
    re.lastIndex = end;
  }
  return out;
}

export function heroOf(html) {
  const hdr = blocks(html, /<header class="article-header">/, 'header');
  if (hdr.length !== 1) fail('<header class="article-header">가 하나가 아니다');
  const t = hdr[0].text;
  const badge = t.match(/<span class="badge-category">([\s\S]*?)<\/span>/)?.[1] ?? fail('badge-category를 찾지 못했다');
  const h1 = t.match(/<h1 class="article-title">[\s\S]*?<\/h1>/)?.[0] ?? fail('h1.article-title을 찾지 못했다');
  const meta = t.match(/<div class="article-meta">([\s\S]*?)<\/div>/)?.[1] ?? fail('article-meta를 찾지 못했다');
  const rest = t.replace(/<span class="badge-category">[\s\S]*?<\/span>/, '').replace(h1, '').replace(/<div class="article-meta">[\s\S]*?<\/div>/, '').replace(/<\/?header[^>]*>/g, '');
  if (rest.trim()) fail(`머리에 모르는 요소가 있다: ${rest.trim().slice(0, 80)}`);
  const kicker = badge.split(' · ').map((s) => `<span>${s.trim()}</span>`).join('');
  const spans = [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
  if (!spans.length) fail('article-meta에 span이 없다');
  // 이모지로 시작하거나 발행일인 칸은 짧은 값이고, 나머지(글·사진 출처, 에디터)는 한 줄을 다 쓴다
  const metaHtml = spans.map((s) => (EMOJI_LEAD.test(s) ? `<span>${stripLead(s)}</span>` : /^발행일/.test(s.trim()) ? `<span>${s.trim()}</span>` : `<span class="meta-credit">${s.trim()}</span>`)).join('\n            ');
  const href = html.match(/href="([^"]*#c=[^"]*)"/)?.[1];
  const btn = href ? `\n          <p><a class="btn" href="${href}">앱에서 코스 열기</a></p>` : '';
  const out = `<header class="article-header hero container">
        <div class="hero-text">
          <p class="hero-kicker badge-category">${kicker}</p>
          ${h1}
          <div class="article-meta">
            ${metaHtml}
          </div>${btn}
        </div>
      </header>`;
  return { start: hdr[0].start, end: hdr[0].end, out };
}

const INTRO_RE = /<div class="(?:prose-intro|article-lead)">([\s\S]*?)<\/div>/;

// 도입 문단(prose-intro 또는 article-lead). 없는 글은 null이고 새 틀에서도 도입을 두지 않는다.
export function introOf(inner) {
  const m = inner.match(INTRO_RE);
  if (!m) return null;
  if (/<(div|p|ul|ol|table|h[1-6])\b/.test(m[1])) fail('도입 문단 안에 블록 요소가 있다');
  return { text: m[0], html: m[1] };
}

export function spotOf(sec, n) {
  const head = sec.match(/<div class="spot-header">[\s\S]*?<\/span>\s*<h2 class="spot-title">[\s\S]*?<\/h2>\s*<\/div>/)?.[0] ?? fail(`스팟 ${n}: spot-header를 찾지 못했다`);
  const tagline = sec.match(/<div class="spot-tagline">([\s\S]*?)<\/div>/)?.[1] ?? fail(`스팟 ${n}: spot-tagline을 찾지 못했다`);
  const img = sec.match(/<div class="spot-image-wrap">\s*(<img\b[^>]*\/>)\s*<\/div>/)?.[1];
  let body = sec.replace(/^<section class="spot-section">/, '').replace(/<\/section>$/, '').replace(head, '').replace(/<div class="spot-tagline">[\s\S]*?<\/div>/, '');
  if (img) body = body.replace(/<div class="spot-image-wrap">[\s\S]*?<\/div>/, '');
  const btnRe = /<a (href="[^"]*"[^>]*) class="btn-naver-map">\s*([\s\S]*?)\s*<\/a>/g;
  body = body.replace(btnRe, (all, attrs, label) => `<a ${attrs} class="btn-naver-map link-quiet">${stripLead(label)}</a>`);
  // 팁 상자: 제목(strong 뒤 br)이 있으면 제목 줄로, 없으면 본문 속 강조로 둔다
  body = body.replace(/<div class="tip-box">\s*([\s\S]*?)\s*<\/div>/g, (all, inside) => {
    const t = inside.match(/^<strong>([\s\S]*?)<\/strong>\s*<br\s*\/?>\s*([\s\S]*)$/);
    return t ? `<div class="tip-box"><strong class="tip-title">${stripLead(t[1])}</strong>${t[2].trim()}</div>` : `<div class="tip-box">${stripLead(inside)}</div>`;
  });
  // 남은 것은 spot-desc 문단, spot-info-box(info-row만), tip-box, map-btn-wrap뿐이어야 한다
  const probe = body
    .replace(/<p class="spot-desc">[\s\S]*?<\/p>/g, '')
    .replace(/<div class="spot-info-box">(?:\s*<div class="info-row">\s*<span class="info-label">[\s\S]*?<\/span>\s*<span class="info-val">[\s\S]*?<\/span>\s*<\/div>)+\s*<\/div>/, '')
    .replace(/<div class="tip-box">(?:(?!<div)[\s\S])*?<\/div>/g, '')
    .replace(/<div class="map-btn-wrap">\s*<a [^>]*class="btn-naver-map link-quiet">[\s\S]*?<\/a>\s*<\/div>/, '');
  if (probe.trim()) fail(`스팟 ${n}: 모르는 요소가 있다: ${probe.trim().slice(0, 100)}`);
  const flip = n % 2 === 0;
  const cls = ['spot-section', flip && img ? 'flip' : '', img ? '' : 'no-photo'].filter(Boolean).join(' ');
  const photo = img ? `\n            <figure class="spot-photo spot-image-wrap">\n              ${img}\n            </figure>` : '';
  return `<section class="${cls}">
            <div class="spot-head">
              ${head}
              <p class="spot-tagline">${tagline}</p>
            </div>${photo}
            <div class="spot-body">${body.replace(/\s+$/, '').replace(/^\s*\n/, '\n')}
            </div>
          </section>`;
}

export function costOf(sec) {
  const title = sec.match(/<h3 class="timeline-title">([\s\S]*?)<\/h3>/)?.[1] ?? fail('입장료 제목을 찾지 못했다');
  const p = sec.match(/<\/h3>\s*(<p>[\s\S]*?<\/p>)/)?.[1];
  // table-wrap이 없는 글은 표를 table-wrap으로 감싸고, 3열 표(구분, 세부 내역, 금액)는 cost-3 클래스를 단다
  let wrap = blocks(sec, /<div class="table-wrap">/, 'div')[0]?.text;
  let rest0 = sec;
  if (wrap) rest0 = rest0.replace(wrap, '');
  else {
    const tbl = sec.match(/<table class="cost-table">[\s\S]*?<\/table>/)?.[0] ?? fail('table-wrap도 표도 찾지 못했다');
    rest0 = rest0.replace(tbl, '');
    const cols = (tbl.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g) ?? []).length;
    wrap = `<div class="table-wrap">\n            ${cols === 3 ? tbl.replace('<table class="cost-table">', '<table class="cost-table cost-3">') : tbl}\n          </div>`;
  }
  const rest = rest0.replace(/^<section class="cost-table-card">/, '').replace(/<\/section>$/, '').replace(/<h3 class="timeline-title">[\s\S]*?<\/h3>/, '').replace(p ?? '', '');
  if (rest.trim()) fail(`입장료 구획에 모르는 요소가 있다: ${rest.trim().slice(0, 80)}`);
  return `<section class="cost-table-card">
          <div class="cost-head">
            <h2 class="timeline-title">${stripLead(title)}</h2>${p ? `\n            ${p}` : ''}
          </div>
          ${wrap}
        </section>`;
}

export function tipsOf(sec) {
  const m = sec.match(/^<section class="tips-card">\s*<h3 class="timeline-title">([\s\S]*?)<\/h3>\s*(<ul class="tips-list">[\s\S]*?<\/ul>)\s*<\/section>$/);
  if (!m) fail('tips-card 틀을 읽지 못했다');
  return `<section class="tips-card">
          <h2 class="timeline-title">${stripLead(m[1])}</h2>
          ${m[2]}
        </section>`;
}

export function appBoxOf(box) {
  const m = box.match(/^<div class="app-course-box"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>$/);
  if (!m) fail('app-course-box 틀을 읽지 못했다');
  return `<div class="app-course-box">
          <div>
            <h2>${stripLead(m[1])}</h2>
            <p>${m[2].trim()}</p>
          </div>
          <a class="btn app-action" href="${m[3]}">${m[4].replace(/\s*→\s*$/, '').trim()}</a>
        </div>`;
}

// 본문(<article> 안쪽) 전체를 새 틀로 옮긴다. family: { timelineRe, timeline(sec) }
export function convertBody(inner, family) {
  const hero = heroOf(inner);
  const intro = introOf(inner);
  const tl = blocks(inner, family.timelineRe, 'section');
  const spots = blocks(inner, /<section class="spot-section">/, 'section');
  const cost = blocks(inner, /<section class="cost-table-card">/, 'section');
  const tips = blocks(inner, /<section class="tips-card">/, 'section');
  const app = blocks(inner, /<div class="app-course-box"/, 'div');
  const credit = inner.match(/<footer style="[^"]*">\s*(<p>[\s\S]*?<\/p>)\s*<\/footer>/);
  if (tl.length !== 1) fail(`동선 구획이 ${tl.length}개다(1개여야 한다)`);
  if (!spots.length) fail('spot-section이 없다');
  if (cost.length !== 1) fail(`cost-table-card가 ${cost.length}개다(1개여야 한다)`);
  if (tips.length > 1) fail(`tips-card가 ${tips.length}개다(0~1개여야 한다)`);
  if (app.length > 1) fail(`app-course-box가 ${app.length}개다(0~1개여야 한다)`);
  if (!credit) fail('글 끝 출처 footer를 찾지 못했다');

  // 앞의 것을 뺀 나머지에 모르는 요소가 없어야 한다(주석과 공백만 허용)
  let rest = inner.slice(0, hero.start) + inner.slice(hero.end);
  for (const b of [tl[0], ...spots, cost[0], ...tips, ...app].map((x) => x.text)) rest = rest.replace(b, '');
  rest = rest.replace(intro?.text ?? '', '').replace(credit[0], '').replace(/<!--[\s\S]*?-->/g, '');
  if (rest.trim()) fail(`본문에 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);

  const spotHtml = spots.map((s, i) => spotOf(s.text, i + 1)).join('\n\n          ');
  return `
      ${hero.out}
${intro ? `
      <div class="container">
        <p class="prose-intro">${intro.html}</p>
      </div>
` : ''}
      <!-- 동선 -->
      ${family.timeline(tl[0].text)}

      <div class="container">
        <div class="spots">
          ${spotHtml}
        </div>

        <!-- 2인 예상 입장료 -->
        ${costOf(cost[0].text)}
${tips.length ? `
        ${tipsOf(tips[0].text)}
` : ''}${app.length ? `
        ${appBoxOf(app[0].text)}
` : ''}
        <footer class="article-credit">
          ${credit[1]}
        </footer>
      </div>
    `;
}

export const readCss = () => fs.readFileSync(path.join(HERE, 'blog_hallmark.css'), 'utf-8').trimEnd();
