// 빌드 끝에 dist/blog/<slug>/index.html의 <img>마다 실제 사진 크기를 width·height 속성으로 넣는다(P-244).
// 크기 없는 사진이 받아지기 전 높이 0으로 그려졌다가 머리를 읽는 순간 커지며 아래 내용을 밀던 첫 방문 흔들림을 막는다.
// 크기는 scripts/blog_image_sizes.json(주소→[가로, 세로])에서 읽는다. 없는 주소만 앞 64KB를 Range로 받아 PNG, JPEG, WebP, GIF 머리에서 읽고 캐시에 더한다.
// JPEG는 EXIF 방향이 5~8이면 가로세로를 바꾼다(브라우저가 방향을 적용한 크기로 그린다). 64KB 안에 SOF가 없으면 1MB로 한 번 더 받는다.
// 망이 없거나 읽지 못한 img는 그대로 두고 빌드를 실패시키지 않는다. BLOG_IMAGE_SIZES_OFFLINE=1이면 망을 쓰지 않는다.
// 이미 width나 height가 있는 img는 건드리지 않는다. 실행 시점: build_blog_related.mjs 뒤. 원본 public/blog/는 고치지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cachePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'blog_image_sizes.json');
const blogDir = path.resolve('dist', 'blog');
const offline = process.env.BLOG_IMAGE_SIZES_OFFLINE === '1';
const IMG_RE = /<img\b[^>]*>/g;

function jpegSize(b) {
  let orientation = 1;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff || (m >= 0xd0 && m <= 0xd8) || m === 0x01) { i += m === 0xff ? 1 : 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m === 0xe1 && i + 4 + len <= b.length && b.toString('ascii', i + 4, i + 8) === 'Exif') orientation = exifOrientation(b.subarray(i + 10, i + 2 + len)) ?? orientation;
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      const w = b.readUInt16BE(i + 7);
      const h = b.readUInt16BE(i + 5);
      return orientation >= 5 && orientation <= 8 ? [h, w] : [w, h];
    }
    i += 2 + len;
  }
  return null;
}

// TIFF 머리(II/MM) 뒤 IFD0에서 0x0112(Orientation)를 찾는다.
function exifOrientation(t) {
  if (t.length < 8) return null;
  const le = t.toString('ascii', 0, 2) === 'II';
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const ifd = le ? t.readUInt32LE(4) : t.readUInt32BE(4);
  if (ifd + 2 > t.length) return null;
  for (let k = 0, n = u16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 10 > t.length) return null;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return null;
}

function imageSize(b) {
  if (b.length < 30) return null;
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  return null;
}

async function fetchHead(url, bytes) {
  const r = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function readSize(src) {
  const url = src.replace(/&amp;/g, '&').replace(/^http:/, 'https:');
  const head = await fetchHead(url, 65536);
  const size = imageSize(head) ?? (head.length >= 65536 && head[0] === 0xff && head[1] === 0xd8 ? imageSize(await fetchHead(url, 1 << 20)) : null);
  if (!size || !size.every((n) => Number.isInteger(n) && n > 0)) throw new Error('머리에서 크기를 읽지 못했다');
  return size;
}

if (!fs.existsSync(blogDir)) {
  console.error('build_blog_image_sizes: dist/blog가 없다. vite build 이후에 실행해야 한다.');
  process.exit(1);
}

const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf-8')) : {};
const files = fs.readdirSync(blogDir).map((d) => path.join(blogDir, d, 'index.html')).filter((f) => fs.existsSync(f));
const pages = files.map((file) => ({ file, html: fs.readFileSync(file, 'utf-8') }));

const srcOf = (tag) => tag.match(/\ssrc="(https?:\/\/[^"]+)"/)?.[1];
const hasSize = (tag) => /\s(width|height)=/.test(tag);
const missing = new Set();
for (const { html } of pages) {
  for (const [tag] of html.matchAll(IMG_RE)) {
    const src = srcOf(tag);
    if (src && !hasSize(tag) && !cache[src]) missing.add(src);
  }
}

const failed = [];
let added = 0;
if (missing.size && !offline) {
  const queue = [...missing];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let src; (src = queue.shift()); ) {
      try {
        cache[src] = await readSize(src);
        added++;
      } catch (e) {
        failed.push(`${src} (${e.message})`);
      }
    }
  }));
}
if (added) {
  const keys = Object.keys(cache).sort();
  fs.writeFileSync(cachePath, `{\n${keys.map((k) => `  ${JSON.stringify(k)}: [${cache[k].join(', ')}]`).join(',\n')}\n}\n`);
}

let sized = 0;
let left = 0;
for (const { file, html } of pages) {
  const out = html.replace(IMG_RE, (tag) => {
    const src = srcOf(tag);
    if (!src || hasSize(tag)) return tag;
    const size = cache[src];
    if (!size) { left++; return tag; }
    sized++;
    return tag.replace(/^<img\b/, `<img width="${size[0]}" height="${size[1]}"`);
  });
  if (out !== html) fs.writeFileSync(file, out);
}

console.log(`build_blog_image_sizes: img ${sized}개에 크기를 넣었다 (캐시에 더한 주소 ${added}개, 크기 없이 둔 img ${left}개${offline ? ', 망 끔' : ''})`);
if (failed.length) console.warn(`build_blog_image_sizes: 크기를 읽지 못한 주소 ${failed.length}개\n  ${failed.join('\n  ')}`);
