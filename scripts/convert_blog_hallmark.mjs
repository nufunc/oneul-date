// 매거진 글 하나를 Hallmark(테마 Solstice) 디자인으로 바꾼다(P-293).
//   node scripts/convert_blog_hallmark.mjs [--check] <slug...>   # public/blog/<slug>/index.html을 제자리에서 바꾼다
// --check는 파일을 쓰지 않고 변환과 보존 비교만 돌린다.
//
// 바꾸는 것은 둘이다.
//   CSS 교체: 글의 <style> 전체를 scripts/blog_hallmark.css로 바꾸고, 제목용 Noto Serif KR을 그 글의 제목 글자만 받도록 <head>에 더한다.
//   마크업 변환: 머리(첫 화면), 동선 띠, 장소 구획(머리·사진·본문 세 칸), 입장료 표 머리, 앱 코스 상자, 글 끝 출처, 사이트 푸터를 새 틀로 옮긴다.
//     이모지와 ↓→를 지우고, 첫 화면에 기존 앱 코스 링크와 같은 주소의 버튼을 더한다. 사진은 제자리(그 장소 구획)에 둔다.
// 본문 문장, 링크, 사진, 헤딩, 메타, JSON-LD는 그대로 두고, 바꾼 뒤 다시 읽어 달라졌으면 실패한다(snapshot·compare).
// 아는 계열(scripts/hallmark_families/)만 바꾼다. 모르는 요소가 남으면 파일을 쓰지 않고 실패한다.
// 실행 시점: 원본 public/blog/를 고치는 일회성 작업이다. 빌드 후처리(related, image_sizes, dates, fonts)는 변환 뒤에도 그대로 돈다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, EMOJI_LEAD, fail, tagText, blocks, convertBody, readCss } from './hallmark_common.mjs';

const ROOT = path.resolve(HERE, '..');
const MARKER = 'hallmark-solstice';
const SERIF_BASE = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap';

// 계열 등록: 새 계열은 scripts/hallmark_families/<이름>.mjs를 만들고 아래 배열에 이름 한 줄을 더한다.
// 계열 모듈은 { name, match(inner), timelineRe, timeline(sec) }를 내보낸다. 위에서부터 처음 match한 계열이 맡는다.
const FAMILY_NAMES = [
  'spot-info-step',
  'spot-info-list',
  'real-photo-flat',
  'spot-card',
];
const FAMILIES = await Promise.all(FAMILY_NAMES.map(async (n) => (await import(`./hallmark_families/${n}.mjs`)).default));

// 변환 전후에 같아야 하는 것들을 뽑는다.
// mainOnly: 옛 머리·푸터 틀이 새 틀과 달라 <main> 안만 견주는 글(real-photo-flat 계열)
export function snapshot(html, mainOnly = false) {
  const bodyAt = html.indexOf('<body');
  const head = html.slice(0, bodyAt < 0 ? 0 : bodyAt);
  let body = bodyAt < 0 ? html : html.slice(bodyAt);
  let captions = [];
  if (mainOnly) {
    body = body.slice(body.indexOf('<main'), body.lastIndexOf('</main>'));
    // 사진 설명은 사진이 놓이는 칸이 달라져 본문 속 순서가 바뀌므로 따로 순서대로 견준다
    const capRe = /<(div) class="photo-caption">([\s\S]*?)<\/\1>|<(figcaption)>([\s\S]*?)<\/figcaption>/g;
    captions = [...body.matchAll(capRe)].map((m) => tagText(m[2] ?? m[4]).replace(/\s+/g, ''));
    body = body.replace(capRe, '');
  }
  const norm = (s) => tagText(s).replace(/[\p{Extended_Pictographic}️‍↓→·•]/gu, '').replace(/\s+/g, '');
  const links = [...body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]).sort();
  const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((m) => `${m[0].match(/\ssrc="([^"]*)"/)?.[1]}|${m[0].match(/\salt="([^"]*)"/)?.[1]}`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.stringify(JSON.parse(m[1])));
  const metas = [...head.matchAll(/<(?:meta|title|link rel="canonical")\b[\s\S]*?(?:>|<\/title>)/g)].map((m) => m[0].replace(/\s+/g, ' '));
  // 앱 코스 상자의 <strong> 제목은 새 틀에서 h2가 되므로 헤딩으로 센다
  const headings = [...body.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<div class="app-course-box"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/g)].map((m) => norm(m[2] ?? m[3]));
  // 첫 화면과 하단 상자의 같은 버튼 문구는 개수가 달라지므로 비교에서 뺀다
  const text = norm(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')).replaceAll('앱에서코스열기', '');
  return { links, imgs, ld, metas, headings, text, captions };
}

// 원본(before)과 변환본(after)의 보존 항목을 견줘 달라진 것을 문장으로 돌려준다. 빈 배열이면 보존.
export function compare(before, after) {
  const errors = [];
  const mainOnly = before.includes('<main class="article-wrap">');
  const a = snapshot(before, mainOnly);
  const b = snapshot(after, mainOnly);
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
  if (JSON.stringify(a.captions) !== JSON.stringify(b.captions)) errors.push('사진 설명이 달라졌다');
  if (a.text !== b.text) errors.push('본문 글자가 달라졌다(이모지, ↓→, 가운뎃점, 공백은 제외하고 비교)');
  return errors;
}

// ---- 변환 ----

// 제목 글꼴(Noto Serif KR 700)이 그리는 글자만 받도록 text= 인수를 만든다.
function serifLink(html) {
  const sel = [/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g, /<span class="(?:tl-time|spot-num)">([\s\S]*?)<\/span>/g, /<a [^>]*class="header-logo"[^>]*>([\s\S]*?)<\/a>/g, /<p class="footer-mark">([\s\S]*?)<\/p>/g, /<p class="(?:timeline-title|summary-title|cta-title)">([\s\S]*?)<\/p>/g];
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
  const css = readCss();

  // 페이지 틀 전체가 다른 계열(머리·푸터까지 모듈이 읽는다)
  const pageFamily = FAMILIES.find((f) => f.matchPage?.(html));
  if (pageFamily) return pageFamily.convertPage(html, { css, finish: addSerif });

  // 본문: <main class="article-container"><article> ... </article></main> 안쪽을 계열 모듈이 읽는다.
  const art = html.match(/(<main class="article-container">\s*<article>)([\s\S]*?)(<\/article>\s*<\/main>)/);
  if (!art) fail('<main class="article-container"><article>를 찾지 못했다');
  const family = FAMILIES.find((f) => f.match?.(art[2])) ?? fail('아는 계열(' + FAMILY_NAMES.join(', ') + ')에 맞지 않는 모르는 틀이다');
  const newInner = convertBody(art[2], family);

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

  return addSerif(out);
}

// 제목 글꼴 링크는 Pretendard 링크 바로 뒤. 글자 목록은 변환 후 본문에서 뽑는다.
function addSerif(out) {
  const pret = out.match(/[ \t]*<link rel="stylesheet" as="style" crossorigin href="[^"]*pretendard[^"]*" \/>/);
  if (!pret) fail('Pretendard 링크를 찾지 못했다');
  return out.replace(pret[0], () => `${pret[0]}\n${serifLink(out)}`);
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
