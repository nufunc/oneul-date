// 빌드가 끝난 dist의 사이트 주소와 base 경로를 SITE_ORIGIN·BASE_PATH 값으로 바꾼다(P-485).
// 블로그 104편과 생성 스크립트 여럿이 https://nufunc.github.io/oneul-date/를 직접 쓰므로 원본을 고치지 않고 산출물에서 한 번에 바꾼다.
// 두 값이 기본값(GitHub Pages)이면 아무 파일도 건드리지 않아 산출물이 바이트 단위로 그대로다.
// 앱 번들의 base는 vite.config.ts가 같은 BASE_PATH로 정한다.
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_ORIGIN = 'https://nufunc.github.io';
const DEFAULT_BASE = '/oneul-date/';
const origin = (process.env.SITE_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
const base = process.env.BASE_PATH || DEFAULT_BASE;

if (!/^https?:\/\/[^/]+$/.test(origin)) {
  console.error(`rebase_dist: SITE_ORIGIN은 경로 없는 주소여야 한다: ${origin}`);
  process.exit(1);
}
if (!base.startsWith('/') || !base.endsWith('/')) {
  console.error(`rebase_dist: BASE_PATH는 /로 시작하고 끝나야 한다: ${base}`);
  process.exit(1);
}
if (origin === DEFAULT_ORIGIN && base === DEFAULT_BASE) {
  console.log('rebase_dist: 기본 주소라 바꿀 파일이 없다');
  process.exit(0);
}

// 긴 패턴부터 바꾼다. 끝 슬래시 없는 사이트 주소는 generate_seo_pages.mjs의 SITE_URL 꼴이다.
// sw.js는 번들 경로를 정규식(\/oneul-date\/assets\/)으로 찾으므로 이스케이프한 꼴도 바꾼다.
const RULES = [
  [`${DEFAULT_ORIGIN}${DEFAULT_BASE}`, `${origin}${base}`],
  [`${DEFAULT_ORIGIN}${DEFAULT_BASE.slice(0, -1)}`, `${origin}${base.slice(0, -1)}`],
  [DEFAULT_BASE, base],
  [DEFAULT_BASE.replaceAll('/', '\\/'), base.replaceAll('/', '\\/')],
];
const TEXT_EXT = new Set(['.html', '.js', '.css', '.xml', '.txt', '.json', '.webmanifest', '.svg']);
// data/는 수집기가 쓰는 장소 자료(spots.json 24MB 등)이고 사이트 주소를 담지 않는다
const SKIP_DIRS = new Set(['data']);

const distDir = path.resolve('dist');
let changed = 0;
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (dir === distDir && SKIP_DIRS.has(ent.name)) continue;
      walk(p);
    } else if (TEXT_EXT.has(path.extname(ent.name))) {
      const before = fs.readFileSync(p, 'utf-8');
      let after = before;
      for (const [from, to] of RULES) after = after.replaceAll(from, to);
      if (after !== before) {
        fs.writeFileSync(p, after);
        changed++;
      }
    }
  }
};
walk(distDir);
console.log(`rebase_dist: ${origin}${base} 기준으로 ${changed}개 파일을 바꿨다`);
