// 계열: 동선이 tl-act·tl-step·tl-move 블록인 spot-info-box 글(강화, 군위, 산청, 보성 등).
import { fail, stripLead } from '../hallmark_common.mjs';

export default {
  name: 'spot-info-step',
  match: (inner) => /<section class="timeline-card">/.test(inner) && /class="tl-step"/.test(inner),
  timelineRe: /<section class="timeline-card">/,
  timeline(sec) {
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
  },
};
