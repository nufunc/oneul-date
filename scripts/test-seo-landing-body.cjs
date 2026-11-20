// 지역 랜딩 본문 분량 시험(P-538): npm run build 뒤 node scripts/test-seo-landing-body.cjs
// 랜딩 32쪽마다 #seo-landing 본문이 공백 제외 1,500자 이상이고, 데이터 집계 본문(.seo-guide)의 문장이 다른 쪽과 거의 겹치지 않는지 본다
// --report를 붙이면 쪽별 글자 수와 중복 문장 비율을 출력한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const SLUGS = ['seoul', 'gyeonggi', 'incheon', 'gangwon', 'chungcheong', 'yeongnam', 'honam', 'jeju'];
const SLOTS = ['day', 'evening', 'night', 'stay'];
const MIN_CHARS = 1500;
// 집계 본문 문장 가운데 다른 쪽에도 똑같이 나오는 문장의 비율 상한
const MAX_GUIDE_DUP = 0.05;

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '\n')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const sentences = (t) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 8);
const chars = (t) => t.replace(/\s+/g, '').length;

const pages = [];
for (const slug of SLUGS) {
  for (const slot of SLOTS) {
    const f = path.join(dist, slug, slot, 'index.html');
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const start = html.indexOf('<section id="seo-landing"');
    assert.ok(start >= 0, `${slug}/${slot}: #seo-landing이 없다`);
    const section = html.slice(start, html.indexOf('</section>', start));
    const g = section.indexOf('<div class="seo-guide">');
    const guide = g >= 0 ? section.slice(g, section.indexOf('<nav', g)) : '';
    pages.push({ rel: `${slug}/${slot}`, all: text(section), guide: text(guide), section });
  }
}
assert.strictEqual(pages.length, 32, `지역 랜딩이 32쪽이 아니다: ${pages.length}`);

function dupRatio(key) {
  const seen = new Map();
  for (const p of pages) for (const s of new Set(sentences(p[key]))) seen.set(s, (seen.get(s) || 0) + 1);
  let total = 0;
  let dup = 0;
  for (const p of pages) for (const s of sentences(p[key])) { total += 1; if (seen.get(s) > 1) dup += 1; }
  return { total, dup, ratio: total ? dup / total : 0 };
}

const counts = pages.map((p) => ({ rel: p.rel, all: chars(p.all), guide: chars(p.guide) }));
if (process.argv.includes('--report')) {
  const sorted = counts.map((c) => c.all).sort((a, b) => a - b);
  console.log(counts.map((c) => `${c.rel}\t${c.all}\t${c.guide}`).join('\n'));
  console.log(`전체 글자 수 최소 ${sorted[0]} 중앙 ${(sorted[15] + sorted[16]) / 2} 최대 ${sorted[31]}`);
  for (const key of ['all', 'guide']) {
    const d = dupRatio(key);
    console.log(`${key} 중복 문장 ${d.dup}/${d.total} = ${(d.ratio * 100).toFixed(1)}%`);
  }
}

for (const c of counts) assert.ok(c.all >= MIN_CHARS, `${c.rel}: 본문이 공백 제외 ${c.all}자로 ${MIN_CHARS}자에 못 미친다`);
for (const p of pages) {
  // 새 본문은 장소 목록 뒤, 다른 쪽 링크 앞에 있어 첫 화면 단추 위치를 바꾸지 않는다(P-528)
  const s = p.section;
  assert.ok(s.indexOf('</ul>') < s.indexOf('<div class="seo-guide">') && s.indexOf('<div class="seo-guide">') < s.indexOf('<nav'), `${p.rel}: 집계 본문이 장소 목록과 다른 쪽 링크 사이에 없다`);
}
const d = dupRatio('guide');
assert.ok(d.ratio <= MAX_GUIDE_DUP, `집계 본문 중복 문장 비율 ${(d.ratio * 100).toFixed(1)}%가 ${MAX_GUIDE_DUP * 100}%를 넘는다`);

console.log('test-seo-landing-body: 통과');
