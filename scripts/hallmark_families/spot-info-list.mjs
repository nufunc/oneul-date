// 계열: 동선이 timeline-list(시간 범위, 장소, 한 줄 설명)이고 팁 상자와 경비표(table-wrap 없음)를 쓰는 spot-info-box 글(금산, 함안, 인제, 장흥).
// 틀이 둘이다: div.timeline-item(번호 배지, timeline-spot, timeline-desc, 앞에 timeline-meta-box)과 li.timeline-item(timeline-name, timeline-sub).
import { fail, stripLead } from '../hallmark_common.mjs';

export default {
  name: 'spot-info-list',
  match: (inner) => /class="timeline-item"/.test(inner) && /<section class="timeline-card">/.test(inner),
  timelineRe: /<section class="timeline-card">/,
  timeline(sec) {
    const title = sec.match(/<h3 class="timeline-title">([\s\S]*?)<\/h3>/)?.[1] ?? fail('timeline-title을 찾지 못했다');
    let inner = sec.replace(/^<section class="timeline-card">/, '').replace(/<\/section>$/, '').replace(/<h3 class="timeline-title">[\s\S]*?<\/h3>/, '');
    // 선택: 권역, 테마 같은 요약 상자는 글자 그대로 두고 틀만 새 클래스로
    let facts = '';
    const box = inner.match(/<div class="timeline-meta-box">((?:\s*<div class="meta-item">[\s\S]*?<\/div>)+)\s*<\/div>/);
    if (box) {
      inner = inner.replace(box[0], '');
      facts = `<div class="tl-facts">${box[1].replace(/\s+/g, ' ').trim()}</div>`;
    }
    const rows = [];
    const re1 = /<div class="timeline-item">\s*<span class="timeline-badge">([\s\S]*?)<\/span>\s*<div class="timeline-content">\s*<div class="timeline-time">([\s\S]*?)<\/div>\s*<div class="timeline-spot">([\s\S]*?)<\/div>\s*<div class="timeline-desc">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const re2 = /<li class="timeline-item">\s*<div class="timeline-time">([\s\S]*?)<\/div>\s*<div class="timeline-name">([\s\S]*?)<\/div>\s*<div class="timeline-sub">([\s\S]*?)<\/div>\s*<\/li>/g;
    const list = inner.match(/<(ul|div) class="timeline-list">([\s\S]*)<\/\1>/);
    if (!list) fail('timeline-list를 찾지 못했다');
    const body = list[2];
    let rest = body;
    for (const m of body.matchAll(re1)) rows.push({ badge: m[1], time: m[2], place: m[3], note: m[4], at: m.index });
    for (const m of body.matchAll(re2)) rows.push({ time: m[1], place: m[2], note: m[3], at: m.index });
    rows.sort((a, b) => a.at - b.at);
    rest = body.replace(re1, '').replace(re2, '');
    if (rest.replace(/<\/?(?:ul|div)[^>]*>/g, '').trim()) fail(`동선에 모르는 요소가 있다: ${rest.trim().slice(0, 80)}`);
    if (!rows.length) fail('timeline-item이 없다');
    inner = inner.replace(list[0], '');
    if (inner.trim()) fail(`동선 구획에 모르는 요소가 있다: ${inner.trim().slice(0, 80)}`);
    const steps = rows.map((r, i) => `<div class="tl-step" style="--r:2; --c:${i + 1}">${r.badge ? `<span class="tl-badge">${r.badge}</span>` : ''}<span class="tl-time">${r.time}</span><span class="tl-place">${r.place}</span><span class="tl-note">${r.note}</span></div>`);
    return `<section class="timeline-card band">
        <div class="container">
          <h2 class="timeline-title">${stripLead(title)}</h2>${facts ? `\n          ${facts}` : ''}
          <div class="route range" style="--n:${rows.length}">
            ${steps.join('\n            ')}
          </div>
        </div>
      </section>`;
  },
};
