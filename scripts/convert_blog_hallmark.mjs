// 매거진 글 하나를 Hallmark(테마 Solstice) 디자인으로 바꾼다(P-293).
//   node scripts/convert_blog_hallmark.mjs [--check] <slug...>   # public/blog/<slug>/index.html을 제자리에서 바꾼다
// --check는 파일을 쓰지 않고 변환과 보존 비교만 돌린다.
//
// 바꾸는 것은 둘이다.
//   CSS 교체: 글의 <style> 전체를 scripts/blog_hallmark.css로 바꾸고, 제목용 Noto Serif KR을 그 글의 제목 글자만 받도록 <head>에 더한다.
//   마크업 변환: 머리(첫 화면), 동선 띠, 장소 구획(머리·사진·본문 세 칸), 입장료 표 머리, 앱 코스 상자, 글 끝 출처, 사이트 푸터를 새 틀로 옮긴다.
//     이모지와 ↓→를 지우고, 첫 화면에 기존 앱 코스 링크와 같은 주소의 버튼을 더한다. 사진은 제자리(그 장소 구획)에 둔다.
// 본문 문장, 링크, 사진, 헤딩, 메타, JSON-LD는 그대로 두고, 바꾼 뒤 다시 읽어 달라졌으면 실패한다(snapshot·compare).
// 아는 틀(강화 글과 같은 계열)만 바꾼다. 모르는 요소가 남으면 파일을 쓰지 않고 실패한다.
// 실행 시점: 원본 public/blog/를 고치는 일회성 작업이다. 빌드 후처리(related, image_sizes, dates, fonts)는 변환 뒤에도 그대로 돈다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MARKER = 'hallmark-solstice';
const SERIF_BASE = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap';

const EMOJI_LEAD = /^[\p{Extended_Pictographic}️‍\s]+/u;
const stripLead = (s) => s.replace(EMOJI_LEAD, '').trim();
const fail = (msg) => { throw new Error(msg); };
const tagText = (s) => s.replace(/<[^>]*>/g, '');

// 같은 태그가 겹치는 블록의 끝(닫는 태그 뒤 위치)을 찾는다.
function blockEnd(html, start, tag) {
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
function blocks(html, openRe, tag) {
  const out = [];
  const re = new RegExp(openRe.source, 'g');
  for (let m; (m = re.exec(html)); ) {
    const end = blockEnd(html, m.index, tag);
    out.push({ start: m.index, end, text: html.slice(m.index, end) });
    re.lastIndex = end;
  }
  return out;
}

// 변환 전후에 같아야 하는 것들을 뽑는다.
export function snapshot(html) {
  const bodyAt = html.indexOf('<body');
  const head = html.slice(0, bodyAt < 0 ? 0 : bodyAt);
  const body = bodyAt < 0 ? html : html.slice(bodyAt);
  const norm = (s) => tagText(s).replace(/[\p{Extended_Pictographic}️‍↓→·]/gu, '').replace(/\s+/g, '');
  const links = [...body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]).sort();
  const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((m) => `${m[0].match(/\ssrc="([^"]*)"/)?.[1]}|${m[0].match(/\salt="([^"]*)"/)?.[1]}`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.stringify(JSON.parse(m[1])));
  const metas = [...head.matchAll(/<(?:meta|title|link rel="canonical")\b[\s\S]*?(?:>|<\/title>)/g)].map((m) => m[0].replace(/\s+/g, ' '));
  // 앱 코스 상자의 <strong> 제목은 새 틀에서 h2가 되므로 헤딩으로 센다
  const headings = [...body.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<div class="app-course-box"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/g)].map((m) => norm(m[2] ?? m[3]));
  // 첫 화면과 하단 상자의 같은 버튼 문구는 개수가 달라지므로 비교에서 뺀다
  const text = norm(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')).replaceAll('앱에서코스열기', '');
  return { links, imgs, ld, metas, headings, text };
}

// 원본(before)과 변환본(after)의 보존 항목을 견줘 달라진 것을 문장으로 돌려준다. 빈 배열이면 보존.
export function compare(before, after) {
  const errors = [];
  const a = snapshot(before);
  const b = snapshot(after);
  const courseHref = before.match(/href="([^"]*#c=[^"]*)"/)?.[1];
  const left = [...b.links];
  for (const href of a.links) {
    const i = left.indexOf(href);
    if (i < 0) errors.push(`링크가 사라졌다: ${href}`);
    else left.splice(i, 1);
  }
  for (const href of left) if (href !== courseHref) errors.push(`원본에 없던 링크가 생겼다: ${href}`);
  if (JSON.stringify(a.imgs) !== JSON.stringify(b.imgs)) errors.push(`이미지(src|alt)가 달라졌다: ${a.imgs.length}장 → ${b.imgs.length}장`);
  if (JSON.stringify(a.ld) !== JSON.stringify(b.ld)) errors.push('JSON-LD가 달라졌다');
  if (JSON.stringify(a.metas) !== JSON.stringify(b.metas)) errors.push('메타(title, meta, canonical)가 달라졌다');
  if (JSON.stringify(a.headings) !== JSON.stringify(b.headings)) errors.push(`헤딩 글자가 달라졌다: ${a.headings.join(' | ')} → ${b.headings.join(' | ')}`);
  if (a.text !== b.text) errors.push('본문 글자가 달라졌다(이모지, ↓→, 가운뎃점, 공백은 제외하고 비교)');
  return errors;
}

// ---- 변환 ----

function heroOf(html) {
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
  const metaHtml = spans.map((s) => (EMOJI_LEAD.test(s) ? `<span>${stripLead(s)}</span>` : `<span class="meta-credit">${s.trim()}</span>`)).join('\n            ');
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

function timelineOf(sec) {
  const title = sec.match(/<h3 class="timeline-title">([\s\S]*?)<\/h3>/)?.[1] ?? fail('timeline-title을 찾지 못했다');
  const inner = sec.replace(/^<section class="timeline-card">/, '').replace(/<\/section>$/, '').replace(/<h3 class="timeline-title">[\s\S]*?<\/h3>/, '');
  const tokRe = /<div class="tl-act">([\s\S]*?)<\/div>|<div class="tl-step"><span class="tl-time">([\s\S]*?)<\/span><div><span class="tl-place">([\s\S]*?)<\/span>(?:<span class="tl-note">([\s\S]*?)<\/span>)?<\/div><\/div>|<div class="tl-move">([\s\S]*?)<\/div>/g;
  const toks = [];
  let last = 0;
  for (let m; (m = tokRe.exec(inner)); ) {
    if (inner.slice(last, m.index).trim()) fail(`동선에 모르는 요소가 있다: ${inner.slice(last, m.index).trim().slice(0, 80)}`);
    last = tokRe.lastIndex;
    if (m[1] !== undefined) toks.push({ k: 'act', text: m[1] });
    else if (m[2] !== undefined) toks.push({ k: 'step', time: m[2], place: m[3], note: m[4] });
    else toks.push({ k: 'move', text: m[5] });
  }
  if (inner.slice(last).trim()) fail(`동선에 모르는 요소가 있다: ${inner.slice(last).trim().slice(0, 80)}`);
  const steps = toks.filter((t) => t.k === 'step').length;
  if (!steps) fail('동선에 tl-step이 없다');
  const lastStepIdx = toks.map((t) => t.k).lastIndexOf('step');
  const rows = [];
  let col = 0;
  toks.forEach((t, i) => {
    if (t.k === 'act') {
      let span = 0;
      for (let j = i + 1; j < toks.length && toks[j].k !== 'act'; j++) if (toks[j].k === 'step') span++;
      rows.push(`<div class="tl-act" style="--r:1; --c:${col + 1}${span > 1 ? `; --s:${span}` : ''}">${t.text}</div>`);
    } else if (t.k === 'step') {
      col++;
      const note = t.note !== undefined ? `<span class="tl-note">${t.note}</span>` : '';
      rows.push(`<div class="tl-step" style="--r:2; --c:${col}"><span class="tl-time">${t.time}</span><span class="tl-place">${t.place}</span>${note}</div>`);
    } else if (i > lastStepIdx && !/^\s*↓/.test(t.text)) {
      rows.push(`<div class="tl-total" style="--r:4">${t.text.trim()}</div>`);
    } else {
      if (col === 0) fail('첫 tl-step 앞에 tl-move가 있다');
      rows.push(`<div class="tl-move" style="--r:3; --c:${col}">${t.text.replace(/^\s*↓\s*/, '').trim()}</div>`);
    }
  });
  return `<section class="timeline-card band">
        <div class="container">
          <h2 class="timeline-title">${stripLead(title)}</h2>
          <div class="route" style="--n:${steps}">
            ${rows.join('\n            ')}
          </div>
        </div>
      </section>`;
}

function spotOf(sec, n) {
  const head = sec.match(/<div class="spot-header">[\s\S]*?<\/span>\s*<h2 class="spot-title">[\s\S]*?<\/h2>\s*<\/div>/)?.[0] ?? fail(`스팟 ${n}: spot-header를 찾지 못했다`);
  const tagline = sec.match(/<div class="spot-tagline">([\s\S]*?)<\/div>/)?.[1] ?? fail(`스팟 ${n}: spot-tagline을 찾지 못했다`);
  const img = sec.match(/<div class="spot-image-wrap">\s*(<img\b[^>]*\/>)\s*<\/div>/)?.[1];
  let body = sec.replace(/^<section class="spot-section">/, '').replace(/<\/section>$/, '').replace(head, '').replace(/<div class="spot-tagline">[\s\S]*?<\/div>/, '');
  if (img) body = body.replace(/<div class="spot-image-wrap">[\s\S]*?<\/div>/, '');
  const btnRe = /<a (href="[^"]*"[^>]*) class="btn-naver-map">\s*([\s\S]*?)\s*<\/a>/g;
  body = body.replace(btnRe, (all, attrs, label) => `<a ${attrs} class="btn-naver-map link-quiet">${stripLead(label)}</a>`);
  // 남은 것은 spot-desc 문단, spot-info-box(info-row만), map-btn-wrap뿐이어야 한다
  const probe = body
    .replace(/<p class="spot-desc">[\s\S]*?<\/p>/g, '')
    .replace(/<div class="spot-info-box">(?:\s*<div class="info-row">\s*<span class="info-label">[\s\S]*?<\/span>\s*<span class="info-val">[\s\S]*?<\/span>\s*<\/div>)+\s*<\/div>/, '')
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

function costOf(sec) {
  const title = sec.match(/<h3 class="timeline-title">([\s\S]*?)<\/h3>/)?.[1] ?? fail('입장료 제목을 찾지 못했다');
  const p = sec.match(/<\/h3>\s*(<p>[\s\S]*?<\/p>)/)?.[1];
  const wrap = blocks(sec, /<div class="table-wrap">/, 'div')[0]?.text ?? fail('table-wrap을 찾지 못했다');
  const rest = sec.replace(/^<section class="cost-table-card">/, '').replace(/<\/section>$/, '').replace(/<h3 class="timeline-title">[\s\S]*?<\/h3>/, '').replace(p ?? '', '').replace(wrap, '');
  if (rest.trim()) fail(`입장료 구획에 모르는 요소가 있다: ${rest.trim().slice(0, 80)}`);
  return `<section class="cost-table-card">
          <div class="cost-head">
            <h2 class="timeline-title">${stripLead(title)}</h2>${p ? `\n            ${p}` : ''}
          </div>
          ${wrap}
        </section>`;
}

function appBoxOf(box) {
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

// 제목 글꼴(Noto Serif KR 700)이 그리는 글자만 받도록 text= 인수를 만든다.
function serifLink(html) {
  const sel = [/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g, /<span class="(?:tl-time|spot-num)">([\s\S]*?)<\/span>/g, /<a [^>]*class="header-logo"[^>]*>([\s\S]*?)<\/a>/g, /<p class="footer-mark">([\s\S]*?)<\/p>/g];
  const cost = html.match(/<tr class="cost-total-row">([\s\S]*?)<\/tr>/)?.[1] ?? '';
  let chars = '0123456789,.:~';
  for (const re of sel) for (const m of html.matchAll(re)) chars += tagText(m[1]);
  chars += tagText(cost).replace(/\s+/g, '');
  const uniq = [...new Set(chars.replace(/\s+/g, '').replace(/&amp;/g, '&'))].sort().join('');
  return `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${SERIF_BASE}&text=${encodeURIComponent(uniq)}" rel="stylesheet">`;
}

export function convert(html) {
  if (html.includes(MARKER)) return null; // 이미 바꾼 글
  if (blocks(html, /<style>/, 'style').length !== 1) fail('<style>이 하나가 아니다');
  const css = fs.readFileSync(path.join(HERE, 'blog_hallmark.css'), 'utf-8').trimEnd();

  // 본문: <main class="article-container"><article> ... </article></main> 안쪽을 앞에서부터 읽는다.
  const art = html.match(/(<main class="article-container">\s*<article>)([\s\S]*?)(<\/article>\s*<\/main>)/);
  if (!art) fail('<main class="article-container"><article>를 찾지 못했다');
  let inner = art[2];

  const hero = heroOf(inner);
  const intro = inner.match(/<div class="prose-intro">([\s\S]*?)<\/div>/)?.[1] ?? fail('prose-intro를 찾지 못했다');
  if (/<(div|p|ul|ol|table|h[1-6])\b/.test(intro)) fail('prose-intro 안에 블록 요소가 있다');
  const tl = blocks(inner, /<section class="timeline-card">/, 'section');
  const spots = blocks(inner, /<section class="spot-section">/, 'section');
  const cost = blocks(inner, /<section class="cost-table-card">/, 'section');
  const app = blocks(inner, /<div class="app-course-box"/, 'div');
  const credit = inner.match(/<footer style="[^"]*">\s*(<p>[\s\S]*?<\/p>)\s*<\/footer>/);
  if (tl.length !== 1) fail(`timeline-card가 ${tl.length}개다(1개여야 한다)`);
  if (!spots.length) fail('spot-section이 없다');
  if (cost.length !== 1) fail(`cost-table-card가 ${cost.length}개다(1개여야 한다)`);
  if (app.length !== 1) fail(`app-course-box가 ${app.length}개다(1개여야 한다)`);
  if (!credit) fail('글 끝 출처 footer를 찾지 못했다');

  // 앞의 것을 뺀 나머지에 모르는 요소가 없어야 한다(주석과 공백만 허용)
  let rest = inner.slice(0, hero.start) + inner.slice(hero.end);
  for (const b of [tl[0], ...spots, cost[0], app[0]].map((x) => x.text)) rest = rest.replace(b, '');
  rest = rest.replace(/<div class="prose-intro">[\s\S]*?<\/div>/, '').replace(credit[0], '').replace(/<!--[\s\S]*?-->/g, '');
  if (rest.trim()) fail(`본문에 모르는 요소가 있다: ${rest.trim().slice(0, 100)}`);

  const spotHtml = spots.map((s, i) => spotOf(s.text, i + 1)).join('\n\n          ');
  const newInner = `
      ${hero.out}

      <div class="container">
        <p class="prose-intro">${intro}</p>
      </div>

      <!-- 동선 -->
      ${timelineOf(tl[0].text)}

      <div class="container">
        <div class="spots">
          ${spotHtml}
        </div>

        <!-- 2인 예상 입장료 -->
        ${costOf(cost[0].text)}

        ${appBoxOf(app[0].text)}

        <footer class="article-credit">
          ${credit[1]}
        </footer>
      </div>
    `;

  let out = html.replace(art[0], () => art[1] + newInner + art[3]);
  out = out.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${css}\n  </style>`);
  out = out.replace('<div class="header-inner">', '<div class="header-inner container">');

  // 사이트 푸터: 마크, 한 줄 설명, 링크 둘
  const foot = out.match(/<footer class="site-footer">\s*<div[^>]*>\s*<p[^>]*><strong>([\s\S]*?)<\/strong>\s*·\s*([\s\S]*?)<\/p>\s*<p><a href="([^"]*)">([\s\S]*?)<\/a>\s*·\s*<a href="([^"]*)">([\s\S]*?)<\/a><\/p>\s*<\/div>\s*<\/footer>/);
  if (!foot) fail('site-footer 틀을 읽지 못했다');
  out = out.replace(foot[0], () => `<footer class="site-footer">
    <div class="footer-inner container">
      <p class="footer-mark"><strong>${foot[1]}</strong></p>
      <p class="footer-line">${foot[2]}</p>
      <p class="footer-links"><a href="${foot[3]}">${foot[4]}</a><a href="${foot[5]}">${foot[6]}</a></p>
    </div>
  </footer>`);

  // 제목 글꼴 링크는 Pretendard 링크 바로 뒤. 글자 목록은 변환 후 본문에서 뽑는다.
  const pret = out.match(/[ \t]*<link rel="stylesheet" as="style" crossorigin href="[^"]*pretendard[^"]*" \/>/);
  if (!pret) fail('Pretendard 링크를 찾지 못했다');
  out = out.replace(pret[0], () => `${pret[0]}\n${serifLink(out)}`);
  return out;
}

// ---- CLI ----

function main(argv) {
  const check = argv.includes('--check');
  const slugs = argv.filter((a) => !a.startsWith('--'));
  if (!slugs.length) {
    console.error('사용법: node scripts/convert_blog_hallmark.mjs [--check] <slug...>');
    process.exit(2);
  }
  const results = [];
  let failed = 0;
  for (const slug of slugs) {
    const file = path.join(ROOT, 'public', 'blog', slug, 'index.html');
    try {
      if (!fs.existsSync(file)) fail(`${file}이 없다`);
      const before = fs.readFileSync(file, 'utf-8');
      const after = convert(before);
      if (after === null) { console.log(`convert_blog_hallmark: ${slug}: 이미 바꾼 글이라 건너뛴다`); continue; }
      const errors = compare(before, after);
      if (errors.length) fail(`보존 비교 실패\n  - ${errors.join('\n  - ')}`);
      results.push({ slug, file, after });
      console.log(`convert_blog_hallmark: ${slug}: 보존 비교 통과 (링크 ${snapshot(after).links.length}, 이미지 ${snapshot(after).imgs.length}, 헤딩 ${snapshot(after).headings.length})`);
    } catch (e) {
      failed++;
      console.error(`convert_blog_hallmark: ${slug}: 실패: ${e.message}`);
    }
  }
  if (failed) { console.error(`convert_blog_hallmark: ${failed}편 실패, 아무것도 쓰지 않았다`); process.exit(1); }
  if (!check) for (const r of results) fs.writeFileSync(r.file, r.after);
  console.log(`convert_blog_hallmark: ${results.length}편 ${check ? '검사' : '변환'} 완료`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
