// 빌드 끝에 dist의 모든 HTML 쪽 </head> 앞에 애드센스 스크립트를 넣는다(P-536).
// 애드센스 심사와 자동 광고는 사이트의 쪽마다 이 코드를 본다. 매거진 글과 지역 랜딩은 머리 틀이 여럿이므로
// 원본을 고치지 않고 산출물 한 곳에서 같은 줄을 넣는다. 이미 있으면 넣지 않는다.
// 실행 시점: vite build와 generate_seo_pages.mjs 뒤.
import fs from 'node:fs';
import path from 'node:path';

export const ADSENSE_CLIENT = 'ca-pub-9593341318585134';
const MARK = 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const TAG = `<script async src="https://${MARK}?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;
// assets는 번들, data는 장소 자료라 HTML 쪽이 없다
const SKIP_DIRS = new Set(['assets', 'data']);

const distDir = path.resolve(process.argv[2] || 'dist');
if (!fs.existsSync(distDir)) {
  console.error('build_adsense: dist가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

let done = 0;
const missing = [];
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!(dir === distDir && SKIP_DIRS.has(ent.name))) walk(p);
      continue;
    }
    if (!ent.name.endsWith('.html')) continue;
    const html = fs.readFileSync(p, 'utf-8');
    if (html.includes(MARK)) continue;
    const at = html.indexOf('</head>');
    if (at < 0) { missing.push(path.relative(distDir, p)); continue; }
    fs.writeFileSync(p, `${html.slice(0, at)}  ${TAG}\n${html.slice(at)}`);
    done++;
  }
};
walk(distDir);
console.log(`build_adsense: 애드센스 스크립트를 ${done}쪽에 넣었다`);
if (missing.length) console.warn(`build_adsense: </head>가 없어 건너뛴 쪽 ${missing.length}개\n  ${missing.join('\n  ')}`);
